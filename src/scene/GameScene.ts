import { Container, Point, Sprite } from 'pixi.js'
import { layout, applySpec, applyUiAnchor, cover } from '../layout'
import { tex } from '../assets'
import { ClientQueue } from '../game/ClientQueue'
import { Kitchen } from '../game/Kitchen'
import { Plate } from '../game/Plate'
import { Hint } from '../ui/Hint'
import { CoinsHud } from '../ui/CoinsHud'
import { VisitorsHud } from '../ui/VisitorsHud'
import { CTA } from '../ui/CTA'
import { config } from '../config'
import { openStore } from '../redirect'

// Flying-coin pacing/sizing for the per-position reward FX.
const FLY_DURATION = 0.55
const FLY_COIN_SIZE = 64  // stage-space px (multiplied by cover scale at spawn)

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

  private tutorialStep = 0
  private viewW = 0
  private viewH = 0
  private coverScale = 1

  constructor() {
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

    this.uiRoot.addChild(this.soundButton, this.coins, this.visitors, this.hint, this.cta)

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
    this.hint.update(dt)
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
      this.spawnFlyingCoin(worldPos, reward)
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

  private resolveHintTarget(): Container | null {
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
    const coin = new Sprite(tex('coin'))
    coin.anchor.set(0.5, 0.5)
    const size = FLY_COIN_SIZE * this.coverScale
    coin.width = size
    coin.height = size
    coin.position.set(start.x, start.y)
    this.fxLayer.addChild(coin)
    const end = this.coins.iconGlobalPos()
    this.flyingCoins.push({ sprite: coin, start: new Point(start.x, start.y), end, t: 0, reward })
  }

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
