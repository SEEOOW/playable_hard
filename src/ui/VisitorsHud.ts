import { Container, Sprite, Text } from 'pixi.js'
import { tex } from '../assets'
import { applyUiAnchor, type UiAnchor } from '../layout'

// Mirrors CoinsHud — icon at the anchor, "served/total" counter to its right,
// re-rasterized on layout so the number stays sharp at any cover scale.
const LABEL_FONT_SIZE = 18
const LABEL_GAP = 4

export class VisitorsHud extends Container {
  served = 0
  readonly total: number

  private icon: Sprite
  private counter: Text

  constructor(total: number) {
    super()
    this.total = total
    this.icon = new Sprite(tex('new_avatar'))
    this.counter = new Text({
      text: this.formatLabel(),
      style: {
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: LABEL_FONT_SIZE,
        fontWeight: '700',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 2 },
      },
    })
    this.counter.anchor.set(0, 0.5)
    this.addChild(this.icon, this.counter)
  }

  // Bumps the served count after a guest's order is fully delivered. Returns
  // true once the final guest is counted, so callers can fire the redirect.
  bumpServed(): boolean {
    this.served = Math.min(this.served + 1, this.total)
    this.counter.text = this.formatLabel()
    return this.served >= this.total
  }

  layout(anchor: UiAnchor, viewW: number, viewH: number, scale: number): void {
    applyUiAnchor(this.icon, anchor, viewW, viewH, scale)
    this.counter.style.fontSize = LABEL_FONT_SIZE * scale
    this.counter.position.set(
      this.icon.x + this.icon.width + LABEL_GAP * scale,
      this.icon.y + this.icon.height / 2,
    )
  }

  private formatLabel(): string {
    return this.served + '/' + this.total
  }
}
