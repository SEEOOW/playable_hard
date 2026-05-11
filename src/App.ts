import { Application } from 'pixi.js'
import { GameScene } from './scene/GameScene'
import { loadAssets } from './assets'
import { AudioManager } from './AudioManager'

export class App {
  readonly pixi: Application
  private scene: GameScene | null = null
  private canvas: HTMLCanvasElement
  private audio = new AudioManager()

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

    this.scene = new GameScene(this.audio)
    this.pixi.stage.addChild(this.scene)
    this.scene.resize(this.pixi.renderer.width, this.pixi.renderer.height)
    this.scene.start()

    this.pixi.stage.eventMode = 'static'
    this.pixi.stage.on('pointerdown', () => {
      // First-tap gesture unlocks browser audio autoplay and starts music.
      this.audio.unlock()
      this.scene?.notifyInteraction()
    })

    this.pixi.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000
      this.scene?.update(dt)
    })

    window.addEventListener('resize', this.onResize)
  }

  private onResize = (): void => {
    if (!this.scene) return
    this.scene.resize(this.pixi.renderer.width, this.pixi.renderer.height)
  }
}
