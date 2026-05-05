import { Application } from 'pixi.js'
import { GameScene } from './scene/GameScene'
import { loadAssets } from './assets'
import { Cheats } from './cheats'

export class App {
  readonly pixi: Application
  private scene: GameScene | null = null
  private canvas: HTMLCanvasElement
  private cheats: Cheats | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.pixi = new Application()
  }

  async start(): Promise<void> {
    await this.pixi.init({
      canvas: this.canvas,
      resizeTo: window,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    })

    await loadAssets()

    this.scene = new GameScene()
    this.pixi.stage.addChild(this.scene)
    this.scene.resize(this.pixi.renderer.width, this.pixi.renderer.height)
    this.scene.start()

    this.pixi.stage.eventMode = 'static'
    this.pixi.stage.on('pointerdown', () => this.scene?.notifyInteraction())

    this.pixi.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000
      this.scene?.update(dt)
    })

    window.addEventListener('resize', this.onResize)

    // Dev cheats — toggle the panel with C, fire actions with their hotkey.
    this.cheats = new Cheats()
    this.cheats.register({
      key: 'g',
      label: 'Отправить ближайшего посетителя',
      action: () => this.scene?.dismissNextClient(),
    })
  }

  private onResize = (): void => {
    if (!this.scene) return
    this.scene.resize(this.pixi.renderer.width, this.pixi.renderer.height)
  }
}
