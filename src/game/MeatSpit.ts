import { Container, Sprite } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { config } from '../config'
import { tex, makeSpine } from '../assets'
import { applySpec, type LayerSpec, type SpineSpitPos } from '../layout'

// Owns the vertical spit. Z-order, back → front:
//   grill → skewerBack → spitBack → kebabCut (overlay) → spitFront → skewerFront.
// All five spine skeletons share the same root position + scale (`spitSpine`).
export class MeatSpit extends Container {
  // Fired when the player taps the spit area. Kitchen drives the slice motion.
  onSliceTap: (() => void) | null = null

  private grill: Sprite
  private skewerBack:  Spine
  private spitBack:    Spine
  private kebabCut:    Spine
  private spitFront:   Spine
  private skewerFront: Spine

  constructor() {
    super()
    this.grill = new Sprite(tex('grill'))
    this.skewerBack  = makeSpine('skewer_back')
    this.spitBack    = makeSpine('kebab_back')
    this.kebabCut    = makeSpine('kebab_cut')
    this.spitFront   = makeSpine('kebab_front')
    this.skewerFront = makeSpine('skewer_front')

    this.addChild(
      this.grill,
      this.skewerBack,
      this.spitBack,
      this.kebabCut,
      this.spitFront,
      this.skewerFront,
    )

    // Spine layers must NOT intercept pointer events — otherwise they catch
    // pointerdown on their internal mesh and the grill below never sees the
    // press, even though pointerover (cursor) still bubbles to grill.
    this.skewerBack.eventMode  = 'none'
    this.spitBack.eventMode    = 'none'
    this.kebabCut.eventMode    = 'none'
    this.spitFront.eventMode   = 'none'
    this.skewerFront.eventMode = 'none'

    // Grill is the bottom layer of the spit — the click target.
    this.grill.eventMode = 'static'
    this.grill.cursor = 'pointer'
    this.grill.on('pointerdown', () => this.onSliceTap?.())

    // Idle loop on the meat (full-meat state). skewerBack has no animations —
    // stays in setup pose. skewerFront's '1st' selects which top stick is shown.
    this.spitBack.state.setAnimation(0,    '1st', true)
    this.spitFront.state.setAnimation(0,   '1st', true)
    this.skewerFront.state.setAnimation(0, '1st', true)

    // Cut overlay: hidden until a slice triggers it. Animation is non-looping
    // and uses an accelerated timeScale so the rgba fade-out happens shortly
    // after the slice — i.e. cuts disappear once the spit "rotates them away".
    this.kebabCut.visible = false
    this.kebabCut.state.timeScale = config.cooking.cutTimeScale
  }

  // Start the cut overlay with the given skin. Restarts the spine animation
  // so the alpha fade-in plays from zero.
  playCut(skinName: string): void {
    const sk = this.kebabCut.skeleton
    sk.setSkinByName(skinName)
    sk.setSlotsToSetupPose()
    this.kebabCut.state.setAnimation(0, '1st', false)
    this.kebabCut.visible = true
  }

  // Swap the cut texture in place without restarting the animation —
  // alpha continues so the new skin appears at current visibility.
  swapCutSkin(skinName: string): void {
    const sk = this.kebabCut.skeleton
    sk.setSkinByName(skinName)
    sk.setSlotsToSetupPose()
  }

  update(_dt: number): void {
    // Cycle/cut state is owned by Kitchen now; nothing periodic to tick here.
  }

  layout(grillSpec: LayerSpec, spinePos: SpineSpitPos): void {
    applySpec(this.grill, grillSpec)
    for (const sp of [this.skewerBack, this.spitBack, this.kebabCut, this.spitFront, this.skewerFront]) {
      sp.position.set(spinePos.x, spinePos.y)
      sp.scale.set(spinePos.scale)
    }
  }
}
