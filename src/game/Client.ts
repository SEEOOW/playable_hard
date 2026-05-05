import { Container, Point, Sprite } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { Order } from './Order'
import type { RecipeId } from '../recipes'
import { makeSpine, tex, type SpineName } from '../assets'
import { applySpec, layout } from '../layout'
import { config } from '../config'
import { closedPitaLayers, type Recipe } from '../pita/recipes'
import type { OrderItem } from '../pita/orders'

export type ClientState = 'walkingIn' | 'waiting' | 'leaving'

// Bubble layout (in bubble-local coords, BEFORE bubble.scale is applied).
// Bubble.png is 241×119, rotated 90° → effective 119×241 (tall pill), so
// items stack vertically inside. Pitas use the same size whether the order
// has 1 or 3 positions; drink is half the slot size.
const BUBBLE_ITEM_SIZE = 132
const BUBBLE_ITEM_SPACING = 70
const BUBBLE_ITEM_X = 5  // horizontal nudge inside the bubble (right of center)
const BUBBLE_DRINK_SCALE = 0.45  // drink size relative to a pita slot

export class Client extends Container {
  readonly order: Order
  readonly spineName: SpineName
  slotIdx = 0
  state: ClientState = 'walkingIn'
  patienceLeft = config.client.patience

  // Public so ClientQueue can attach the bubble to a top-most layer outside
  // this Container (so it ends up above table/kitchen z-wise).
  readonly bubble: Container
  private bubbleBg: Sprite
  private orderSlots: Container[] = []

  private spine: Spine
  private walkT: number | null = null
  private walkDur = 0
  private walkStart = new Point()
  private walkTarget = new Point()
  private onArrivedCb: (() => void) | null = null

  constructor(order: Order, spineName: SpineName) {
    super()
    this.order = order
    this.spineName = spineName
    this.spine = makeSpine(spineName)
    this.spine.eventMode = 'none'

    // Offset spine inside Client so Client.position.y represents the bbox
    // TOP edge of the character. Different skeletons have their root at
    // different heights (e.g. old_grambler's root is ~23% above the floor),
    // so we use skeleton-data's own bbox: top edge in spine-local y-up is
    // (data.y + data.height); rendering flips Y, and the parent Client.scale
    // propagates to this offset, so we set it in raw spine units.
    const d = this.spine.skeleton.data
    // World-pixel x-nudge per character (e.g. shift grandpa 10px left of slot).
    // Stored in world pixels in layout, converted to spine-local via 1/scale.
    const nudgeWorldX = layout.clientSpineOffsetX[spineName] ?? 0
    this.spine.position.x = nudgeWorldX / layout.clientScale
    this.spine.position.y = d.y + d.height

    this.addChild(this.spine)
    // No dedicated walk animation in the asset — idle from the start.
    this.spine.state.setAnimation(0, 'idle', true)

    // Order bubble — sits to the right of the head, drawn above EVERYTHING.
    // Created here but ClientQueue parents it into a top-most bubbles layer.
    // Container itself is NOT rotated; only the backdrop is rotated 90°, so
    // order item slots inside stay upright.
    this.bubble = new Container()
    this.bubble.eventMode = 'none'
    this.bubble.visible = false
    this.bubbleBg = new Sprite(tex('bubble'))
    this.bubbleBg.anchor.set(0.5, 0.5)
    this.bubbleBg.rotation = Math.PI / 2
    this.bubble.addChild(this.bubbleBg)
  }

  // Populates the bubble with the given order items (1 or 3 positions).
  setOrder(items: ReadonlyArray<OrderItem>): void {
    for (const slot of this.orderSlots) slot.destroy({ children: true })
    this.orderSlots = []

    const startY = items.length === 1 ? 0 : -BUBBLE_ITEM_SPACING

    for (let i = 0; i < items.length; i++) {
      const slot = makeOrderSlot(items[i], BUBBLE_ITEM_SIZE)
      slot.position.set(BUBBLE_ITEM_X, startY + i * BUBBLE_ITEM_SPACING)
      this.bubble.addChild(slot)
      this.orderSlots.push(slot)
    }
  }

  walkIn(target: Point, onArrived: () => void): void {
    this.state = 'walkingIn'
    this.walkStart.copyFrom(this.position)
    this.walkTarget.copyFrom(target)
    this.walkT = 0
    this.walkDur = config.client.walkInDuration
    this.onArrivedCb = onArrived
  }

  receive(recipe: RecipeId): boolean {
    return this.order.tryDeliver(recipe)
  }

  walkOut(target: Point, onDone: () => void): void {
    this.state = 'leaving'
    this.bubble.visible = false
    this.walkStart.copyFrom(this.position)
    this.walkTarget.copyFrom(target)
    this.walkT = 0
    this.walkDur = config.client.walkOutDuration
    this.onArrivedCb = onDone
  }

  update(dt: number): void {
    if (this.walkT != null) {
      this.walkT += dt
      const p = Math.min(this.walkT / this.walkDur, 1)
      this.position.x = lerp(this.walkStart.x, this.walkTarget.x, p)
      this.position.y = lerp(this.walkStart.y, this.walkTarget.y, p)
      this.syncBubble()
      if (p >= 1) {
        this.walkT = null
        // Only walk-in transitions to waiting; walk-out keeps state 'leaving'.
        if (this.state === 'walkingIn') {
          this.state = 'waiting'
          this.bubble.visible = true
        }
        const cb = this.onArrivedCb
        this.onArrivedCb = null
        cb?.()
      }
    }
    if (this.state !== 'waiting') return
    this.patienceLeft -= dt
  }

  // Bubble sits in a sibling top-most layer in world space, so we sync its
  // position from Client.position + a configurable world-pixel offset.
  private syncBubble(): void {
    const off = layout.bubble.offset
    this.bubble.position.set(this.position.x + off.x, this.position.y + off.y)
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Builds one order-item visual centered at (0,0) in its parent slot.
function makeOrderSlot(item: OrderItem, size: number): Container {
  const slot = new Container()
  if (item.kind === 'drink') {
    const drink = new Sprite(tex('drink'))
    drink.anchor.set(0.5, 0.5)
    // drink.png is 55×87 (taller than wide); fit half the slot height.
    const fit = (size * BUBBLE_DRINK_SCALE) / 87
    drink.scale.set(fit)
    slot.addChild(drink)
  } else {
    // Closed-pita preview: render PSD layers in a sub-container scaled to fit
    // a 200×200 PSD canvas into `size` and centered at (0,0).
    const pita = new Container()
    const fit = size / 200
    pita.scale.set(fit)
    pita.position.set(-100 * fit, -100 * fit)
    const recipe: Recipe = { toppings: item.toppings }
    for (const layer of closedPitaLayers(recipe)) {
      const sp = new Sprite(tex(layer.tex))
      applySpec(sp, layer.spec)
      pita.addChild(sp)
    }
    slot.addChild(pita)
  }
  return slot
}
