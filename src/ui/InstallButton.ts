import { Container, Sprite, Text } from 'pixi.js'
import { tex } from '../assets'
import { type UiAnchor } from '../layout'

// Base font size in design pixels for the "Install" label, scaled at layout
// time by the cover factor so it stays sharp on every viewport.
const LABEL_FONT_SIZE = 20
// Pulsation period (s) and amplitude (delta from scale 1.0). Subtle so the
// button reads as alive without distracting from gameplay.
const PULSE_PERIOD = 1.0
const PULSE_AMP    = 0.04

export class InstallButton extends Container {
  onClick: (() => void) | null = null

  private bg: Sprite
  private caption: Text
  private t = 0

  constructor() {
    super()
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.on('pointerdown', () => this.onClick?.())

    this.bg = new Sprite(tex('button_install'))
    this.bg.anchor.set(0.5, 0.5)

    this.caption = new Text({
      text: 'Install',
      style: {
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: LABEL_FONT_SIZE,
        fontWeight: '700',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 2 },
      },
    })
    this.caption.anchor.set(0.5, 0.5)

    this.addChild(this.bg, this.caption)
  }

  // Centre the button along the viewport's bottom edge. UiAnchor.w/h give the
  // design-space size; offsetY is measured from the bottom edge upward.
  layout(anchor: UiAnchor, viewW: number, viewH: number, scale: number): void {
    const sw = anchor.w * scale
    const sh = anchor.h * scale
    const x  = viewW / 2 + anchor.offsetX * scale
    const y  = viewH - sh / 2 - anchor.offsetY * scale
    this.position.set(x, y)
    this.bg.width  = sw
    this.bg.height = sh
    this.caption.style.fontSize = LABEL_FONT_SIZE * scale
    // Pixi Text bbox extends below the baseline for descender space even
    // when "Install" uses none — anchor 0.5 centres that bbox, leaving the
    // visible glyphs above geometric centre. Baseline nudge of ~10% of
    // fontSize, then 5 design-px lift to sit on the button's visual midline.
    this.caption.position.set(0, (LABEL_FONT_SIZE * 0.1 - 5) * scale)
  }

  // Soft sine-wave breathe — Container.scale pulses around its centred
  // position so the bg + label scale together without drift.
  update(dt: number): void {
    this.t += dt
    const k = 1 + PULSE_AMP * Math.sin((this.t / PULSE_PERIOD) * Math.PI * 2)
    this.scale.set(k)
  }
}
