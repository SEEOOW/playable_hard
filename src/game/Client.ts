import { Container, Point, Sprite, Text } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { Order } from './Order'
import type { RecipeId } from '../recipes'
import { makeSpine, tex, type SpineName } from '../assets'
import { applySpec, layout } from '../layout'
import { config } from '../config'
import { closedPitaLayers, type Recipe, type PitaTopping } from '../pita/recipes'
import { priceForItem, type OrderItem } from '../pita/orders'

export type ClientState = 'walkingIn' | 'waiting' | 'leaving'

// Bubble layout (in bubble-local coords, BEFORE bubble.scale is applied).
// Bubble.png is 241×119, rotated 90° → effective 119×241 (tall pill), so
// items stack vertically inside. Pitas use the same size whether the order
// has 1 or 3 positions; drink is half the slot size.
const BUBBLE_ITEM_SIZE = 132
const BUBBLE_ITEM_SPACING = 70
const BUBBLE_ITEM_X = 5  // horizontal nudge inside the bubble (right of center)
const BUBBLE_DRINK_SCALE = 0.45  // drink size relative to a pita slot
const BUBBLE_CHECK_SIZE = 45  // checkmark fits comfortably inside a slot
const BUBBLE_REWARD_COIN_SIZE = 50  // coin shown next to "+X" during reward phase
const BUBBLE_REWARD_FONT = 36
const BUBBLE_REWARD_COIN_X = -22
const BUBBLE_REWARD_TEXT_X = 4

// Per-slot delivery animation pacing. Timestamps are absolute seconds since
// the position was delivered (rewardT accumulates across phases):
//   0.0 — checkmark appears
//   0.5 — reward (coin + "+X") overlays the checkmark
//   1.0 — checkmark hides (visible for 1 s total)
//   1.5 — reward hides + coin flies to HUD (reward visible for 1 s total)
const REWARD_OVERLAY_AT   = 0.5
const REWARD_CHECK_HIDE_AT = 1.0
const REWARD_FLY_AT       = 1.5
const REWARD_FADE_DUR     = 0.2  // alpha ramp at both ends of each visibility window
const REFLOW_DUR          = 0.3
// Bubble + client linger after the last position's coin starts flying — gives
// the player a beat to see the bubble empty before the walk-out begins.
const ORDER_COMPLETE_LINGER_DUR = 0.5

type RewardPhase = 'idle' | 'check' | 'overlay' | 'reward' | 'gone'

type ClientOrderItem = OrderItem & {
  delivered: boolean
  slot: Container
  rewardPhase: RewardPhase
  rewardT: number              // seconds since delivery, accumulates across phases
  checkSprite: Sprite | null   // so we can remove it independently from the reward
  rewardGroup: Container | null // coin + "+X" wrapped together for unified alpha
  rewardCoin: Sprite | null    // captured so its global pos seeds the fly-out
  slideFromY: number
  slideToY: number
  slideT: number               // -1 = no slide active; otherwise 0..1 progress
}

export type ItemDeliveredInfo = { reward: number; worldPos: Point }

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
  private orderItems: ClientOrderItem[] = []
  private orderCompleteFired = false
  // Counts down once every position is 'gone' (last coin in flight). Reaching
  // zero fires onOrderComplete, which is what triggers the walk-out.
  private orderLingerLeft: number | null = null

  // Fired once per delivered position when its in-bubble reward animation
  // completes — outer scene flies a coin from worldPos to the HUD counter.
  onItemDelivered: ((info: ItemDeliveredInfo) => void) | null = null
  // Fires after the LAST position's reward sequence completes — queue uses
  // this to start the walk-out (we delay dismissal until all "+X" finish).
  onOrderComplete: (() => void) | null = null

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
    for (const it of this.orderItems) it.slot.destroy({ children: true })
    this.orderItems = []
    this.orderCompleteFired = false
    this.orderLingerLeft = null

    const ys = computeSlotYs(items.length)
    for (let i = 0; i < items.length; i++) {
      const slot = makeOrderSlot(items[i], BUBBLE_ITEM_SIZE)
      slot.position.set(BUBBLE_ITEM_X, ys[i])
      this.bubble.addChild(slot)
      this.orderItems.push(makeOrderEntry(items[i], slot))
    }
  }

  // Tries to deliver the given pita assembly to one of this client's open pita
  // slots — exact topping-set match required, and the pita must contain meat
  // (open pitas without meat aren't a valid closed-pita order).
  tryDeliverPita(assemblyToppings: ReadonlyArray<PitaTopping>, hasMeat: boolean): boolean {
    if (!hasMeat) return false
    const want = new Set(assemblyToppings)
    for (const it of this.orderItems) {
      if (it.delivered) continue
      if (it.kind !== 'pita') continue
      if (!sameSet(it.toppings, want)) continue
      this.markDelivered(it)
      return true
    }
    return false
  }

  // First open drink slot, if any.
  tryDeliverDrink(): boolean {
    for (const it of this.orderItems) {
      if (it.delivered) continue
      if (it.kind !== 'drink') continue
      this.markDelivered(it)
      return true
    }
    return false
  }

  isFullyDelivered(): boolean {
    return this.orderItems.length > 0 && this.orderItems.every((i) => i.delivered)
  }

  // Topping sets of every undelivered pita slot — feeds Smart Cooking so the
  // kitchen can allow only those ingredients that keep an open pita on the
  // path to some active order.
  openPitaToppings(): ReadonlyArray<ReadonlyArray<PitaTopping>> {
    const out: PitaTopping[][] = []
    for (const it of this.orderItems) {
      if (it.delivered) continue
      if (it.kind !== 'pita') continue
      out.push(it.toppings)
    }
    return out
  }

  // Total coin reward for this client's order — sum of all item prices.
  totalPrice(): number {
    let sum = 0
    for (const it of this.orderItems) sum += priceForItem(it)
    return sum
  }

  // Phase 'check': drop a checkmark into the slot. The reward overlay is added
  // later (REWARD_OVERLAY_AT) without replacing this sprite.
  // Phase 'check': drop a checkmark into the slot at alpha 0 — tickRewards
  // ramps it up via checkAlpha. The reward overlay is added later
  // (REWARD_OVERLAY_AT) without replacing this sprite.
  private markDelivered(it: ClientOrderItem): void {
    it.delivered = true
    it.rewardPhase = 'check'
    it.rewardT = 0
    it.checkSprite = null
    it.rewardGroup = null
    it.rewardCoin = null
    it.slot.removeChildren()
    const check = new Sprite(tex('check_mark'))
    check.anchor.set(0.5, 0.5)
    const fit = BUBBLE_CHECK_SIZE / Math.max(check.texture.width, check.texture.height)
    check.scale.set(fit)
    check.alpha = 0
    it.slot.addChild(check)
    it.checkSprite = check
  }

  // Phase 'overlay': add coin + "+X" on TOP of the checkmark (drawn last →
  // rendered above). Wrapped in a sub-container so a single alpha controls
  // the whole reward block during fade in/out.
  private addRewardOverlay(it: ClientOrderItem): void {
    it.rewardPhase = 'overlay'
    const group = new Container()
    const coin = new Sprite(tex('coin'))
    coin.anchor.set(0.5, 0.5)
    const fit = BUBBLE_REWARD_COIN_SIZE / Math.max(coin.texture.width, coin.texture.height)
    coin.scale.set(fit)
    coin.position.set(BUBBLE_REWARD_COIN_X, 0)

    const text = new Text({
      text: '+' + priceForItem(it),
      style: {
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: BUBBLE_REWARD_FONT,
        fontWeight: '700',
        fill: 0xffe066,
        stroke: { color: 0x222222, width: 4 },
      },
    })
    text.anchor.set(0, 0.5)
    text.position.set(BUBBLE_REWARD_TEXT_X, 0)
    group.addChild(coin, text)
    group.alpha = 0
    it.slot.addChild(group)
    it.rewardGroup = group
    it.rewardCoin = coin
  }

  // Phase 'reward': checkmark removed, only the reward visual remains.
  private hideCheckmark(it: ClientOrderItem): void {
    it.rewardPhase = 'reward'
    if (it.checkSprite) {
      it.checkSprite.destroy()
      it.checkSprite = null
    }
  }

  // Phase 'gone': hide slot, hand off the coin to the scene's fly-to-HUD FX,
  // and reflow the remaining positions toward bubble centre.
  private completeRewardPhase(it: ClientOrderItem): void {
    const reward = priceForItem(it)
    const src = it.rewardCoin ?? it.slot
    const gp = src.getGlobalPosition()
    it.rewardPhase = 'gone'
    it.slot.visible = false
    it.rewardCoin = null
    it.rewardGroup = null
    this.onItemDelivered?.({ reward, worldPos: new Point(gp.x, gp.y) })
    this.reflowSlots()
  }

  // Slide every still-visible slot toward its target Y for the new count.
  private reflowSlots(): void {
    const visible = this.orderItems.filter((i) => i.rewardPhase !== 'gone')
    const ys = computeSlotYs(visible.length)
    for (let i = 0; i < visible.length; i++) {
      const it = visible[i]
      const target = ys[i]
      if (Math.abs(it.slot.position.y - target) < 0.001) continue
      it.slideFromY = it.slot.position.y
      it.slideToY = target
      it.slideT = 0
    }
  }

  private tickRewards(dt: number): void {
    for (const it of this.orderItems) {
      if (it.rewardPhase === 'idle' || it.rewardPhase === 'gone') continue
      it.rewardT += dt
      // Walk the timestamp ladder — each branch falls through to the next so
      // a single update can advance multiple thresholds if dt is large.
      if (it.rewardPhase === 'check' && it.rewardT >= REWARD_OVERLAY_AT) {
        this.addRewardOverlay(it)
      }
      if (it.rewardPhase === 'overlay' && it.rewardT >= REWARD_CHECK_HIDE_AT) {
        this.hideCheckmark(it)
      }
      if (it.rewardPhase === 'reward' && it.rewardT >= REWARD_FLY_AT) {
        this.completeRewardPhase(it)
      }
      // Drive fade in/out within the visibility window of each sprite.
      // Sprites destroyed by phase transitions above are nulled out, so the
      // null-checks gate this safely.
      if (it.checkSprite) it.checkSprite.alpha = checkAlpha(it.rewardT)
      if (it.rewardGroup) it.rewardGroup.alpha = rewardAlpha(it.rewardT)
    }
    for (const it of this.orderItems) {
      if (it.rewardPhase === 'gone') continue
      if (it.slideT < 0) continue
      it.slideT = Math.min(it.slideT + dt / REFLOW_DUR, 1)
      const eased = easeOutQuad(it.slideT)
      it.slot.position.y = lerp(it.slideFromY, it.slideToY, eased)
      if (it.slideT >= 1) it.slideT = -1
    }
    if (
      !this.orderCompleteFired
      && this.orderItems.length > 0
      && this.orderItems.every((i) => i.rewardPhase === 'gone')
    ) {
      // Defer dismissal so the empty bubble + client linger briefly after the
      // last coin leaves. The flying coin is independent (in scene fxLayer)
      // and continues regardless of when the walk-out finally starts.
      if (this.orderLingerLeft === null) this.orderLingerLeft = ORDER_COMPLETE_LINGER_DUR
      this.orderLingerLeft -= dt
      if (this.orderLingerLeft <= 0) {
        this.orderCompleteFired = true
        this.onOrderComplete?.()
      }
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
    // Reward animations run regardless of walk state — once an item is
    // delivered the bubble keeps animating until the player sees their reward.
    this.tickRewards(dt)
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

function sameSet(a: ReadonlyArray<string>, b: Set<string>): boolean {
  if (a.length !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function makeOrderEntry(item: OrderItem, slot: Container): ClientOrderItem {
  const common = {
    delivered: false,
    slot,
    rewardPhase: 'idle' as RewardPhase,
    rewardT: 0,
    checkSprite: null,
    rewardGroup: null,
    rewardCoin: null,
    slideFromY: 0,
    slideToY: 0,
    slideT: -1,
  }
  if (item.kind === 'drink') return { kind: 'drink', ...common }
  return { kind: 'pita', toppings: [...item.toppings], ...common }
}

// Linear ramp 0→1→0 within [0, REWARD_CHECK_HIDE_AT] with REWARD_FADE_DUR
// edges. Used for the checkmark.
function checkAlpha(t: number): number {
  if (t <= 0) return 0
  if (t >= REWARD_CHECK_HIDE_AT) return 0
  if (t < REWARD_FADE_DUR) return t / REWARD_FADE_DUR
  const tail = REWARD_CHECK_HIDE_AT - t
  if (tail < REWARD_FADE_DUR) return tail / REWARD_FADE_DUR
  return 1
}

// Linear ramp 0→1→0 within [REWARD_OVERLAY_AT, REWARD_FLY_AT] with
// REWARD_FADE_DUR edges. Used for the coin + "+X" reward block.
function rewardAlpha(t: number): number {
  if (t <= REWARD_OVERLAY_AT) return 0
  if (t >= REWARD_FLY_AT) return 0
  const head = t - REWARD_OVERLAY_AT
  const tail = REWARD_FLY_AT - t
  if (head < REWARD_FADE_DUR) return head / REWARD_FADE_DUR
  if (tail < REWARD_FADE_DUR) return tail / REWARD_FADE_DUR
  return 1
}

// Slot Y positions inside the bubble for n visible items. Mirrors the original
// 1-item-centred / 3-item-spaced layout and adds a symmetric 2-item case so
// remaining slots smoothly drift toward centre after a position is delivered.
function computeSlotYs(n: number): number[] {
  if (n <= 1) return [0]
  if (n === 2) return [-BUBBLE_ITEM_SPACING / 2, BUBBLE_ITEM_SPACING / 2]
  return [-BUBBLE_ITEM_SPACING, 0, BUBBLE_ITEM_SPACING]
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
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
