import { Container, Sprite } from 'pixi.js'
import { layout, applySpec, applyUiAnchor, cover } from '../layout'
import { tex } from '../assets'
import { ClientQueue } from '../game/ClientQueue'
import type { SpineName } from '../assets'
import type { Sfx } from '../AudioManager'
import { Kitchen } from '../game/Kitchen'
import { Hint } from '../ui/Hint'
import { AudioManager } from '../AudioManager'
import { CoinsHud } from '../ui/CoinsHud'
import { VisitorsHud } from '../ui/VisitorsHud'
import { InstallButton } from '../ui/InstallButton'
import { openStore } from '../redirect'
import { planHintTarget } from '../game/HintPlanner'
import { FlyingCoinFx } from '../game/FlyingCoinFx'

// Total guests required to "win" the playable — 5th satisfied guest triggers
// the App Store redirect.
const VISITORS_GOAL = 5

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
  private flyingCoinFx: FlyingCoinFx

  // UI children
  private soundButton: Sprite
  private coins: CoinsHud
  private visitors: VisitorsHud
  private hint: Hint
  private installButton: InstallButton

  private viewW = 0
  private viewH = 0
  private coverScale = 1
  // Sound button toggle state. When false, AudioManager is muted and the
  // button is desaturated; flipping back to true re-enables music + SFX.
  private soundOn = true

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
    this.soundButton.eventMode = 'static'
    this.soundButton.cursor = 'pointer'
    this.soundButton.on('pointerdown', () => this.toggleSound())
    this.coins = new CoinsHud()
    this.visitors = new VisitorsHud(VISITORS_GOAL)
    this.hint = new Hint()
    this.installButton = new InstallButton()
    this.installButton.onClick = () => {
      this.audio.play('tap')
      openStore()
    }

    // Install button last in uiRoot so it draws ABOVE the rest of the UI.
    this.uiRoot.addChild(
      this.soundButton, this.coins, this.visitors, this.hint, this.installButton,
    )

    this.fxLayer = new Container()
    this.fxLayer.eventMode = 'none'
    this.flyingCoinFx = new FlyingCoinFx(this.fxLayer, this.coins, this.audio)

    // Stage order: world below, UI above, FX overlay on top.
    this.addChild(this.worldRoot, this.uiRoot, this.fxLayer)

    this.applyWorldLayout()
  }

  start(): void {
    this.wireConnections()
    this.clientQueue.start(layout.clientSlots)
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
    this.flyingCoinFx.setCoverScale(cov.scale)

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
    this.flyingCoinFx.update(dt)
  }

  notifyInteraction(): void {
    this.hint.notifyInteraction()
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
  }

  private wireConnections(): void {
    this.clientQueue.onClientReady = () => {
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
      this.refreshHint()
    }

    this.clientQueue.onItemDelivered = ({ reward, worldPos }) => {
      // Audio is fired from onDeliveryAccepted (sync at tap moment); this
      // callback runs 1.5 s later, only to launch the flying-coin FX.
      this.flyingCoinFx.spawn(worldPos, reward)
    }
    this.clientQueue.onDeliveryAccepted = ({ isLast, spineName }) => {
      // 'ok' on every delivered position; gendered happy cheer adds on top
      // when the slot completed the client's full order.
      this.audio.play('ok')
      if (isLast) this.audio.play(happySfxFor(spineName))
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
    // blocked taps stay silent. The on*Tap hooks are the exception:
    // they fire on every press for click feedback, regardless of result.
    this.kitchen.onSliceStart      = () => this.audio.play('slice_meat')
    this.kitchen.onMeatPlaced      = () => this.audio.play('fry')
    this.kitchen.onPitaPlaced      = () => this.audio.play('ok')
    this.kitchen.onIngredientAdded = () => this.audio.play('ok')
    this.kitchen.onIngredientTap   = () => this.audio.play('tap')
    this.kitchen.onPitaPress       = () => this.audio.play('tap')
    this.kitchen.onBasketTap       = () => this.audio.play('tap')
    this.kitchen.onSpitTap         = () => this.audio.play('tap')
  }

  private refreshHint(): void {
    this.hint.pointAt(planHintTarget(this.clientQueue, this.kitchen))
  }

  // Sound on/off toggle wired to the bottom-left button. Mutes/unmutes the
  // AudioManager and tints the button grey while silenced. The tap-on click
  // sound only fires when re-enabling — toggling OFF stays silent.
  private toggleSound(): void {
    this.soundOn = !this.soundOn
    this.audio.setMuted(!this.soundOn)
    this.soundButton.tint = this.soundOn ? 0xffffff : 0x666666
    if (this.soundOn) this.audio.play('tap')
  }
}

function happySfxFor(name: SpineName): Sfx {
  // Female: random between female_happy and female_haha for variety.
  // Male: just male_happy.
  if (name === 'italian_man' || name === 'old_grambler') return 'male_happy'
  return Math.random() < 0.5 ? 'female_happy' : 'female_haha'
}
