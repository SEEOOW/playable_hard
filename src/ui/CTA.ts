import { Container, Rectangle } from 'pixi.js'

export class CTA extends Container {
  onClick: (() => void) | null = null

  constructor() {
    super()
    this.visible = false
    this.eventMode = 'static'
    this.on('pointerdown', () => this.onClick?.())
    // TODO: build dim overlay + Install button
  }

  show(): void {
    this.visible = true
    // TODO: animate overlay + button in
  }

  // Cover full viewport regardless of orientation.
  layout(viewW: number, viewH: number): void {
    this.hitArea = new Rectangle(0, 0, viewW, viewH)
    // TODO: stretch overlay sprite to viewW × viewH; place button centered.
  }
}
