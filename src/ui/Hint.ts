import { Container, Sprite } from 'pixi.js'
import { tex } from '../assets'
import { config } from '../config'

// Hand visual baseline — sized in design pixels and multiplied by cover scale
// at layout time so the pointer stays the same proportional size on every
// viewport. The hand asset is 150×224 with the fingertip near the top-left.
const HAND_DESIGN_SIZE = 90
const PULSE_AMP    = 0.12   // ±12% scale wobble — readable as alive, not loud
const PULSE_PERIOD = 0.7    // seconds per breath cycle

export class Hint extends Container {
  private hand: Sprite
  private target: Container | null = null
  private idleTimer = 0
  private pulseT = 0
  private coverScale = 1
  private baseFit = 1  // sprite.scale at coverScale=1 to render at HAND_DESIGN_SIZE

  constructor() {
    super()
    this.eventMode = 'none'
    this.hand = new Sprite(tex('hand'))
    // Anchor near the fingertip (top-left quadrant of the asset) so when the
    // sprite is positioned at a target's centre, the fingertip lands on it.
    this.hand.anchor.set(0.2, 0.1)
    this.addChild(this.hand)
    this.visible = false

    const t = this.hand.texture
    this.baseFit = HAND_DESIGN_SIZE / Math.max(t.width || 1, t.height || 1)
  }

  // Idempotent on the same target — `idleTimer` only resets when the target
  // identity changes, so external code can call pointAt every frame without
  // preventing the delay-to-show from elapsing.
  pointAt(target: Container | null): void {
    if (target === this.target) return
    this.target = target
    this.idleTimer = 0
    this.visible = false
  }

  notifyInteraction(): void {
    this.idleTimer = 0
    this.visible = false
  }

  // Cover scale comes from GameScene's layout pass; the hand re-fits each
  // resize so its on-screen size tracks the rest of the UI.
  layout(scale: number): void {
    this.coverScale = scale
  }

  update(dt: number): void {
    if (!this.target) {
      if (this.visible) this.visible = false
      return
    }
    this.idleTimer += dt
    if (this.idleTimer < config.hint.idleDelay) {
      if (this.visible) this.visible = false
      return
    }
    if (!this.visible) this.visible = true
    // Track the target each frame so the hand follows things that move
    // (clients walking in, pita assemblies appearing on plates, etc.).
    // Hint sits in uiRoot (identity), so global bounds == local position.
    const b = this.target.getBounds()
    this.hand.position.set(b.x + b.width / 2, b.y + b.height / 2)
    this.pulseT += dt
    const k = 1 + PULSE_AMP * Math.sin((this.pulseT / PULSE_PERIOD) * Math.PI * 2)
    this.hand.scale.set(this.baseFit * this.coverScale * k)
  }
}
