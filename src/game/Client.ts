import { Container, Point } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { makeSpine, type SpineName } from '../assets'
import { layout } from '../layout'
import { config } from '../config'
import type { PitaTopping } from '../pita/recipes'
import type { OrderItem } from '../pita/orders'
import { ClientOrderBubble, type ItemDeliveredInfo } from './ClientOrderBubble'

export type ClientState = 'walkingIn' | 'waiting' | 'leaving'
export type { ItemDeliveredInfo }

// One on-stage customer. Owns the spine character + walk-in/out motion and
// composes a ClientOrderBubble that lives in a sibling top-most layer so the
// order bubble renders above table/kitchen. Reward animation + delivery
// state are entirely owned by the bubble; this class just delegates.
export class Client extends Container {
  readonly spineName: SpineName
  slotIdx = 0
  state: ClientState = 'walkingIn'
  patienceLeft = config.client.patience

  // Public so ClientQueue can attach the bubble to a top-most layer outside
  // this Container (so it ends up above table/kitchen z-wise).
  readonly bubble: ClientOrderBubble

  private spine: Spine
  private walkT: number | null = null
  private walkDur = 0
  private walkStart = new Point()
  private walkTarget = new Point()
  private onArrivedCb: (() => void) | null = null

  constructor(spineName: SpineName) {
    super()
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

    this.bubble = new ClientOrderBubble(spineName)
  }

  // ── Order/delivery API — pure delegation to the bubble ──────────────────

  setOrder(items: ReadonlyArray<OrderItem>): void { this.bubble.setOrder(items) }

  tryDeliverPita(assemblyToppings: ReadonlyArray<PitaTopping>, hasMeat: boolean): boolean {
    return this.bubble.tryDeliverPita(assemblyToppings, hasMeat)
  }

  tryDeliverDrink(): boolean { return this.bubble.tryDeliverDrink() }

  isFullyDelivered(): boolean { return this.bubble.isFullyDelivered() }

  pendingItems(): ReturnType<ClientOrderBubble['pendingItems']> {
    return this.bubble.pendingItems()
  }

  deliveredCount(): number { return this.bubble.deliveredCount() }
  totalCount(): number { return this.bubble.totalCount() }

  openPitaToppings(): ReadonlyArray<ReadonlyArray<PitaTopping>> {
    return this.bubble.openPitaToppings()
  }

  totalPrice(): number { return this.bubble.totalPrice() }

  // Bubble event hooks — queue/scene wire these on the bubble through here.
  set onItemDelivered(cb: ((info: ItemDeliveredInfo) => void) | null) {
    this.bubble.onItemDelivered = cb
  }
  set onOrderComplete(cb: (() => void) | null) {
    this.bubble.onOrderComplete = cb
  }

  // ── Walk + tick ────────────────────────────────────────────────────────

  walkIn(target: Point, onArrived: () => void): void {
    this.state = 'walkingIn'
    this.walkStart.copyFrom(this.position)
    this.walkTarget.copyFrom(target)
    this.walkT = 0
    this.walkDur = config.client.walkInDuration
    this.onArrivedCb = onArrived
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
    // Reward animations run regardless of walk state — once an item is
    // delivered the bubble keeps animating until the player sees their reward.
    this.bubble.update(dt)
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
