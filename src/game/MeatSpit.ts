import { Container, Sprite } from 'pixi.js'
import { config } from '../config'
import { tex } from '../assets'
import { applySpec, type LayerSpec } from '../layout'

// Owns the vertical spit sprite. Cooked meat portions (3 sprites stacked on the
// bowl) are decor and live in Kitchen at PSD positions.
export class MeatSpit extends Container {
  portions = config.spit.maxPortions
  onPortionTaken: (() => void) | null = null

  private cookTimer = 0
  private grill: Sprite

  constructor() {
    super()
    this.grill = new Sprite(tex('grill'))
    this.addChild(this.grill)
  }

  takePortion(): boolean {
    if (this.portions <= 0) return false
    this.portions -= 1
    this.onPortionTaken?.()
    return true
  }

  update(dt: number): void {
    if (this.portions >= config.spit.maxPortions) return
    this.cookTimer += dt
    if (this.cookTimer >= config.spit.cookTime) {
      this.cookTimer = 0
      this.portions += 1
    }
  }

  layout(spitSpec: LayerSpec): void {
    applySpec(this.grill, spitSpec)
  }
}
