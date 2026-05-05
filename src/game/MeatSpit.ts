import { Container, Sprite } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { config } from '../config'
import { tex, makeSpine } from '../assets'
import { applySpec, type LayerSpec, type SpineSpitPos } from '../layout'

// Owns the vertical spit. Z-order, back → front:
//   grill (frame) → skewerBack (long pole) → spitBack (meat back)
//   → spitFront (meat front + spices/fire) → skewerFront (top stick).
// All four spine skeletons share the same root position + scale (`spitSpine`).
export class MeatSpit extends Container {
  portions = config.spit.maxPortions
  onPortionTaken: (() => void) | null = null
  // Fired when the player taps the spit area. Kitchen drives the slice motion.
  onSliceTap: (() => void) | null = null

  private cookTimer = 0
  private grill: Sprite
  private skewerBack:  Spine
  private spitBack:    Spine
  private spitFront:   Spine
  private skewerFront: Spine

  constructor() {
    super()
    this.grill = new Sprite(tex('grill'))
    this.skewerBack  = makeSpine('skewer_back')
    this.spitBack    = makeSpine('kebab_back')
    this.spitFront   = makeSpine('kebab_front')
    this.skewerFront = makeSpine('skewer_front')

    this.addChild(this.grill, this.skewerBack, this.spitBack, this.spitFront, this.skewerFront)

    // Spine layers must NOT intercept pointer events — otherwise they catch
    // pointerdown on their internal mesh and the grill below never sees the
    // press, even though pointerover (cursor) still bubbles to grill.
    this.skewerBack.eventMode  = 'none'
    this.spitBack.eventMode    = 'none'
    this.spitFront.eventMode   = 'none'
    this.skewerFront.eventMode = 'none'

    // Grill is the bottom layer of the spit — the click target.
    this.grill.eventMode = 'static'
    this.grill.cursor = 'pointer'
    const fire = () => this.onSliceTap?.()
    this.grill.on('pointerdown', fire)
    this.grill.on('pointertap',  fire)

    // Idle loop on the meat (full-meat state). skewerBack has no animations —
    // stays in setup pose. skewerFront's '1st' selects which top stick is shown.
    this.spitBack.state.setAnimation(0,    '1st', true)
    this.spitFront.state.setAnimation(0,   '1st', true)
    this.skewerFront.state.setAnimation(0, '1st', true)
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

  layout(grillSpec: LayerSpec, spinePos: SpineSpitPos): void {
    applySpec(this.grill, grillSpec)
    for (const sp of [this.skewerBack, this.spitBack, this.spitFront, this.skewerFront]) {
      sp.position.set(spinePos.x, spinePos.y)
      sp.scale.set(spinePos.scale)
    }
  }
}
