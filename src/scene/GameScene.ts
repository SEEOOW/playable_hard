import { Container, Point, Sprite } from 'pixi.js'
import { layout, applySpec, applyUiAnchor, cover } from '../layout'
import { tex } from '../assets'
import { ClientQueue } from '../game/ClientQueue'
import { Client } from '../game/Client'
import type { SpineName } from '../assets'
import type { Sfx } from '../AudioManager'
import { Kitchen } from '../game/Kitchen'
import { Plate } from '../game/Plate'
import { Hint } from '../ui/Hint'
import { AudioManager } from '../AudioManager'
import type { PitaTopping } from '../pita/recipes'
import { CoinsHud } from '../ui/CoinsHud'
import { VisitorsHud } from '../ui/VisitorsHud'
import { CTA } from '../ui/CTA'
import { InstallButton } from '../ui/InstallButton'
import { config } from '../config'
import { openStore } from '../redirect'

// Flying-coin pacing for the per-position reward FX. Display size mirrors
// the HUD coin icon (layout.ui.coinHud) so spawn (from the bubble), the
// entire flight, and the landing are all at identical pixel dimensions.
const FLY_DURATION = 0.55

// Total guests required to "win" the playable — 5th satisfied guest triggers
// the App Store redirect.
const VISITORS_GOAL = 5

type FlyingCoin = {
  sprite: Sprite
  start: Point
  end: Point
  t: number
  reward: number
}

export class GameScene extends Container {
  // World content lives in design space (1280×720) and is cover-scaled
  // into the viewport. Cropping at edges is accepted.
  private worldRoot: Container

  // UI lives in viewport space — sprites anchor to viewport edges and
  // resize on every viewport change. Stays in corners regardless of orientation.
  private uiRoot: Container

  // World children
  private back: Sprite
  private table: Sprite
  private clientQueue: ClientQueue
  private kitchen: Kitchen
  // Top-most layer in the world — order bubbles live here so they render
  // above table, kitchen, and the clients themselves.
  private bubblesLayer: Container

  // Above world AND ui — hosts coins flying from delivered bubble slots to
  // the HUD counter. Lives in stage coords (no transform).
  private fxLayer: Container
  private flyingCoins: FlyingCoin[] = []

  // UI children
  private soundButton: Sprite
  private coins: CoinsHud
  private visitors: VisitorsHud
  private hint: Hint
  private cta: CTA
  private installButton: InstallButton

  private tutorialStep = 0
  private viewW = 0
  private viewH = 0
  private coverScale = 1

  constructor(private audio: AudioManager) {
    super()

    // World ----------------------------------------------------------------
    this.worldRoot = new Container()

    this.back = new Sprite(tex('back'))
    this.table = new Sprite(tex('table'))

    this.clientQueue = new ClientQueue()
    // Stop spawning replacements once VISITORS_GOAL satisfied departures
    // happen — this terminates the level cleanly so the Store redirect fires
    // on the final guest with no further visitors arriving behind them.
    this.clientQueue.clientsLimit = VISITORS_GOAL
    this.kitchen = new Kitchen()
    this.bubblesLayer = new Container()
    this.clientQueue.bubblesLayer = this.bubblesLayer

    // z-order: back wall → clients (behind the table) → table → kitchen
    // → bubbles (above everything in world).
    this.worldRoot.addChild(this.back, this.clientQueue, this.table, this.kitchen, this.bubblesLayer)

    // UI -------------------------------------------------------------------
    this.uiRoot = new Container()

    this.soundButton = new Sprite(tex('sound_on'))
    this.coins = new CoinsHud()
    this.visitors = new VisitorsHud(VISITORS_GOAL)
    this.hint = new Hint()
    this.cta = new CTA()
    this.installButton = new InstallButton()
    this.installButton.onClick = () => {
      this.audio.play('tap')
      openStore()
    }

    // Install button last in uiRoot so it draws ABOVE the rest of the UI.
    this.uiRoot.addChild(
      this.soundButton, this.coins, this.visitors, this.hint, this.cta, this.installButton,
    )

    this.fxLayer = new Container()
    this.fxLayer.eventMode = 'none'

    // Stage order: world below, UI above, FX overlay on top.
    this.addChild(this.worldRoot, this.uiRoot, this.fxLayer)

    this.applyWorldLayout()
  }

  start(): void {
    this.wireConnections()
    this.clientQueue.start(config.queue.orderPlan, layout.clientSlots)
    this.refreshHint()
  }

  // Called by App on viewport resize. World cover-scales (may crop), UI
  // re-anchors to viewport edges with the same cover scale for size.
  resize(viewW: number, viewH: number): void {
    this.viewW = viewW
    this.viewH = viewH

    const cov = cover(viewW, viewH)
    this.coverScale = cov.scale
    this.worldRoot.scale.set(cov.scale)
    this.worldRoot.position.set(cov.offsetX, cov.offsetY)

    this.applyUiLayout()
  }

  update(dt: number): void {
    this.clientQueue.update(dt)
    this.kitchen.update(dt)
    // Re-plan the hint every frame — pointAt is idempotent on the same
    // target, so this only resets the idle countdown when the next valid
    // step actually changes (i.e. the player progressed or state shifted).
    this.refreshHint()
    this.hint.update(dt)
    this.installButton.update(dt)
    this.tickFlyingCoins(dt)
  }

  notifyInteraction(): void {
    this.hint.notifyInteraction()
  }

  // Dev cheat: dismiss the next waiting client (sends them off-screen).
  dismissNextClient(): boolean {
    return this.clientQueue.dismissNext()
  }

  // Static, design-space layout. Called once at construction.
  private applyWorldLayout(): void {
    applySpec(this.back,  layout.background.back)
    applySpec(this.table, layout.background.table)
    this.kitchen.layout(layout)
    this.clientQueue.layout(layout.clientSlots)
  }

  // Viewport-relative UI layout. Called on every resize.
  private applyUiLayout(): void {
    applyUiAnchor(this.soundButton, layout.ui.soundButton, this.viewW, this.viewH, this.coverScale)
    this.coins.layout(layout.ui.coinHud, this.viewW, this.viewH, this.coverScale)
    this.visitors.layout(layout.ui.visitorsHud, this.viewW, this.viewH, this.coverScale)
    this.installButton.layout(layout.ui.installButton, this.viewW, this.viewH, this.coverScale)
    this.hint.layout(this.coverScale)
    this.cta.layout(this.viewW, this.viewH)
  }

  private wireConnections(): void {
    this.clientQueue.onClientReady = () => {
      this.kitchen.setActiveRecipes(this.clientQueue.activeRecipes())
      this.refreshHint()
    }

    this.clientQueue.onClientLeft = (_client, _satisfied) => {
      // Coins are added per-delivered-position via the flying-coin FX
      // (see onItemDelivered below); no bulk add on walk-out.
      // Visitor counter ticks for every leaver — cheat dismissals included —
      // so the level always ends after exactly 5 guests, however they left.
      if (this.visitors.bumpServed()) {
        openStore()
      }
      this.kitchen.setActiveRecipes(this.clientQueue.activeRecipes())
      this.refreshHint()
    }

    this.clientQueue.onItemDelivered = ({ reward, worldPos }) => {
      // Audio is fired from onDeliveryAccepted (sync at tap moment); this
      // callback runs 1.5 s later, only to launch the flying-coin FX.
      this.spawnFlyingCoin(worldPos, reward)
    }
    this.clientQueue.onDeliveryAccepted = ({ isLast, spineName }) => {
      // 'ok' on every delivered position; gendered happy cheer adds on top
      // when the slot completed the client's full order.
      this.audio.play('ok')
      if (isLast) this.audio.play(happySfxFor(spineName))
    }

    this.clientQueue.onAllDone = () => this.finish()

    this.kitchen.onPlateReady = (plate) => {
      plate.onTap = (p) => this.handlePlateTap(p)
      this.refreshHint()
    }

    // Tap on a finished pita / drink → try to match an open slot in any
    // waiting client's bubble. On match, Kitchen resets the slot (pita) or
    // hides the drink for its cooldown.
    this.kitchen.onPitaTap = (assembly) => {
      return this.clientQueue.tryDeliverPita(assembly.toppings(), assembly.hasMeat())
    }
    this.kitchen.onDrinkTap = (_idx) => {
      return this.clientQueue.tryDeliverDrink()
    }

    // Smart Cooking feed: lets Kitchen veto basket placements and ingredient
    // additions that don't lead to any active order.
    this.kitchen.activeOrderToppings = () => this.clientQueue.activeOrderToppings()

    // SFX: kitchen actions. Each accept-only callback fires ONLY on actions
    // that actually go through (slot free, Smart Cooking allows, etc.) —
    // blocked taps stay silent. The onIngredientTap hook is the exception:
    // it fires on every press for click feedback, regardless of result.
    this.kitchen.onSliceStart      = () => this.audio.play('slice_meat')
    this.kitchen.onMeatPlaced      = () => this.audio.play('fry')
    this.kitchen.onPitaPlaced      = () => this.audio.play('ok')
    this.kitchen.onIngredientAdded = () => this.audio.play('ok')
    this.kitchen.onIngredientTap   = () => this.audio.play('tap')
    this.kitchen.onPitaPress       = () => this.audio.play('tap')
    this.kitchen.onBasketTap       = () => this.audio.play('tap')
    this.kitchen.onSpitTap         = () => this.audio.play('tap')

    this.cta.onClick = () => openStore()
  }

  private handlePlateTap(plate: Plate): void {
    const target = this.clientQueue.findMatching(plate.recipeId)
    if (!target) return
    plate.flyTo(target.position.clone(), () => {
      target.receive(plate.recipeId)
      plate.destroyPlate()
      this.advanceTutorial()
      this.refreshHint()
    })
  }

  private advanceTutorial(): void {
    this.tutorialStep += 1
  }

  // Picks the highest-priority waiting client and returns the next valid
  // tappable target for delivering their order. Returns null when there's
  // no actionable next step (e.g. all drinks on cooldown, no plates free,
  // no waiting clients). Per-frame safe: idempotent through Hint.pointAt.
  private resolveHintTarget(): Container | null {
    const waiting = this.clientQueue.waitingClients()
    if (waiting.length === 0) return null
    // Priority: most-progressed order first (closest to completion). Tiebreak
    // by lowest patience so the most urgent client gets coached. Falls
    // through to the next client if their order has no actionable step
    // (e.g. only drink left and every drink is on cooldown).
    const sorted = [...waiting].sort((a, b) => {
      const ad = a.deliveredCount(); const bd = b.deliveredCount()
      if (ad !== bd) return bd - ad
      return a.patienceLeft - b.patienceLeft
    })
    for (const client of sorted) {
      const target = this.planFor(client)
      if (target) return target
    }
    return null
  }

  private planFor(client: Client): Container | null {
    for (const item of client.pendingItems()) {
      const t = this.planForItem(item)
      if (t) return t
    }
    return null
  }

  private planForItem(
    item: { kind: 'drink' } | { kind: 'pita'; toppings: ReadonlyArray<PitaTopping> },
  ): Container | null {
    if (item.kind === 'drink') return this.kitchen.drinkTarget()

    const target = item.toppings
    const pitas = this.kitchen.pitaAssemblies()

    // 1. Already-ready assembly that exactly matches → tap to deliver.
    for (const p of pitas) {
      if (!p.hasPita() || !p.hasMeat()) continue
      if (sameToppings(p.toppings(), target)) return p
    }

    // 2. On-path assembly — toppings ⊆ target, prefer the most-progressed
    //    so we keep finishing what's already started rather than restarting.
    let best: ReturnType<Kitchen['pitaAssemblies']>[number] | null = null
    let bestScore = -1
    for (const p of pitas) {
      if (!p.hasPita()) continue
      const t = p.toppings()
      if (!isSubset(t, target)) continue
      const score = t.length * 2 + (p.hasMeat() ? 1 : 0)
      if (score > bestScore) { best = p; bestScore = score }
    }
    if (best) {
      // Meat-first rule: toppings can't be added until meat is on the pita.
      if (!best.hasMeat()) {
        return this.kitchen.hasMeatInBowl() ? this.kitchen.meatTarget() : this.kitchen.spitTarget()
      }
      // Find the first missing topping the kitchen actually has a station for.
      const have = new Set(best.toppings())
      for (const t of target) {
        if (have.has(t)) continue
        const ts = this.kitchen.ingredientTarget(t)
        if (ts) return ts
      }
      // Fully-built and matching — should have been caught in (1); defensive.
      return best
    }

    // 3. No assembly is on-path — start fresh. Smart Cooking will allow the
    //    placement because there's at least one demand slot for this target.
    if (this.kitchen.hasUnplacedPlate()) return this.kitchen.basketTarget()
    return null
  }

  private refreshHint(): void {
    this.hint.pointAt(this.resolveHintTarget())
  }

  private finish(): void {
    this.cta.show()
  }

  // Spawns a coin sprite in fxLayer (stage space) at the bubble slot's world
  // position; tickFlyingCoins eases it toward the HUD coin icon and triggers
  // the counter increment on arrival.
  private spawnFlyingCoin(start: Point, reward: number): void {
    this.audio.play('coins_fly_old')
    const coin = new Sprite(tex('coin'))
    coin.anchor.set(0.5, 0.5)
    // Lock pixel size to the HUD coin icon for the entire flight — set once
    // at spawn, never touched in tickFlyingCoins, so the sprite never scales
    // along the trajectory.
    const hud = layout.ui.coinHud
    coin.width  = hud.w * this.coverScale
    coin.height = hud.h * this.coverScale
    coin.position.set(start.x, start.y)
    this.fxLayer.addChild(coin)
    const end = this.coins.iconGlobalPos()
    this.flyingCoins.push({ sprite: coin, start: new Point(start.x, start.y), end, t: 0, reward })
  }

  // (helpers below)
  private tickFlyingCoins(dt: number): void {
    for (let i = this.flyingCoins.length - 1; i >= 0; i--) {
      const fc = this.flyingCoins[i]
      fc.t += dt
      const p = Math.min(fc.t / FLY_DURATION, 1)
      // Ease-in: coin lingers a beat near the bubble then accelerates to HUD.
      const eased = p * p
      fc.sprite.position.set(
        fc.start.x + (fc.end.x - fc.start.x) * eased,
        fc.start.y + (fc.end.y - fc.start.y) * eased,
      )
      if (p >= 1) {
        this.fxLayer.removeChild(fc.sprite)
        fc.sprite.destroy()
        this.flyingCoins.splice(i, 1)
        this.coins.add(fc.reward, fc.end)
      }
    }
  }
}

// Gendered cheer for the spine name. Females alternate randomly between the
// plain happy and the "haha" laugh so 5-guest sessions don't all sound the
// same; males have a single happy variant in the asset pack.
function happySfxFor(name: SpineName): Sfx {
  if (name === 'italian_man' || name === 'old_grambler') return 'male_happy'
  return Math.random() < 0.5 ? 'female_happy' : 'female_haha'
}

// Set equality for topping arrays — toppings have no duplicates inside a
// single recipe, so length + subset is sufficient.
function sameToppings(
  a: ReadonlyArray<PitaTopping>, b: ReadonlyArray<PitaTopping>,
): boolean {
  if (a.length !== b.length) return false
  for (const v of a) if (!b.includes(v)) return false
  return true
}

function isSubset(
  sub: ReadonlyArray<PitaTopping>, sup: ReadonlyArray<PitaTopping>,
): boolean {
  if (sub.length > sup.length) return false
  for (const v of sub) if (!sup.includes(v)) return false
  return true
}
