import { Container, Sprite } from 'pixi.js'
import { layout, applySpec, applyUiAnchor, cover } from '../layout'
import { tex } from '../assets'
import { ClientQueue } from '../game/ClientQueue'
import { Kitchen } from '../game/Kitchen'
import { Plate } from '../game/Plate'
import { Hint } from '../ui/Hint'
import { CoinsHud } from '../ui/CoinsHud'
import { CTA } from '../ui/CTA'
import { config } from '../config'
import { openStore } from '../redirect'

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

  // UI children
  private soundButton: Sprite
  private coins: CoinsHud
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
    this.hint = new Hint()
    this.cta = new CTA()

    this.uiRoot.addChild(this.soundButton, this.coins, this.hint, this.cta)

    // Stage order: world below, UI above.
    this.addChild(this.worldRoot, this.uiRoot)

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
    this.cta.layout(this.viewW, this.viewH)
  }

  private wireConnections(): void {
    this.clientQueue.onClientReady = () => {
      this.kitchen.setActiveRecipes(this.clientQueue.activeRecipes())
      this.refreshHint()
    }

    this.clientQueue.onClientLeft = (client, satisfied) => {
      if (satisfied) {
        this.coins.add(config.coinsPerOrder, client.position.clone())
      }
      this.kitchen.setActiveRecipes(this.clientQueue.activeRecipes())
      this.refreshHint()
    }

    this.clientQueue.onAllDone = () => this.finish()

    this.kitchen.onPlateReady = (plate) => {
      plate.onTap = (p) => this.handlePlateTap(p)
      this.refreshHint()
    }

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
}
