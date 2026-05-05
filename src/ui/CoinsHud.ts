import { Container, Point, Sprite } from 'pixi.js'
import { tex } from '../assets'
import { applyUiAnchor, type UiAnchor } from '../layout'

export class CoinsHud extends Container {
  total = 0

  private icon: Sprite

  constructor() {
    super()
    this.icon = new Sprite(tex('coin'))
    this.addChild(this.icon)
    // TODO: counter text/digits next to the icon
  }

  add(amount: number, _fromPos: Point): void {
    this.total += amount
    // TODO: spawn flying coin from fromPos to this.icon position, then bump counter
  }

  layout(anchor: UiAnchor, viewW: number, viewH: number, scale: number): void {
    applyUiAnchor(this.icon, anchor, viewW, viewH, scale)
  }
}
