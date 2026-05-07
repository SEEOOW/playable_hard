import { Container, Point, Sprite, Text } from 'pixi.js'
import { tex } from '../assets'
import { applyUiAnchor, type UiAnchor } from '../layout'

// Base font size in design pixels — multiplied by the cover scale on layout
// so the counter grows with the icon on larger viewports. Stays crisp because
// the text is re-rasterized whenever fontSize changes (cover-scale changes).
const LABEL_FONT_SIZE = 18
const LABEL_GAP = 4  // gap between icon's right edge and the number, in design px

export class CoinsHud extends Container {
  total = 0

  private icon: Sprite
  private counter: Text

  constructor() {
    super()
    this.icon = new Sprite(tex('coin'))
    // System fallback stack — keeps the bundle small (no font asset) and
    // looks consistent across the platforms a playable runs on.
    this.counter = new Text({
      text: '0',
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

  add(amount: number, _fromPos: Point): void {
    this.total += amount
    this.counter.text = String(this.total)
  }

  // Stage-space CENTRE of the coin icon — flying-coin FX lands here so the
  // sprite vanishes exactly on the icon regardless of viewport size. The icon
  // uses anchor (0,0), so getGlobalPosition() returns its top-left; we offset
  // by half its current display size (which already reflects cover scale via
  // applyUiAnchor in layout()).
  iconGlobalPos(): Point {
    const tl = this.icon.getGlobalPosition()
    return new Point(tl.x + this.icon.width / 2, tl.y + this.icon.height / 2)
  }

  layout(anchor: UiAnchor, viewW: number, viewH: number, scale: number): void {
    applyUiAnchor(this.icon, anchor, viewW, viewH, scale)
    // Counter sits right of the icon, vertically centered on it. Re-rasterize
    // at the cover-scaled size so the number stays sharp.
    this.counter.style.fontSize = LABEL_FONT_SIZE * scale
    this.counter.position.set(
      this.icon.x + this.icon.width + LABEL_GAP * scale,
      this.icon.y + this.icon.height / 2,
    )
  }
}
