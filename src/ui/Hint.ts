import { Container } from 'pixi.js'
import { config } from '../config'

export class Hint extends Container {
  private target: Container | null = null
  private idleTimer = 0

  constructor() {
    super()
    this.visible = false
    // TODO: build hand sprite + tap pulse animation
  }

  pointAt(target: Container | null): void {
    this.target = target
    this.idleTimer = 0
    this.visible = false
  }

  notifyInteraction(): void {
    this.idleTimer = 0
    this.visible = false
  }

  update(dt: number): void {
    if (!this.target) return
    this.idleTimer += dt
    if (this.idleTimer >= config.hint.idleDelay && !this.visible) {
      this.visible = true
      // TODO: position hand at target's global position, start pulse
    }
  }
}
