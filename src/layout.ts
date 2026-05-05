import { Point, Sprite } from 'pixi.js'
import type { AssetName, SpineName } from './assets'

// Single design canvas — sourced from psd/lvl.psd. World content is cover-scaled
// into the actual viewport (may crop at edges in extreme aspects). UI is
// screen-anchored and scaled with the same cover factor so it visually matches
// the world while staying in viewport corners.
export const DESIGN_W = 1280
export const DESIGN_H = 720

// PSD layer stack, bottom (drawn first) → top (drawn last).
export const Z_ORDER = [
  'back', 'table',
  'basket', 'tortilla', 'grill', 'knife', 'bowl',
  'fries', 'cucumber',
  'plates', 'drinks', 'tomato', 'pita', 'meat',
  'sound', 'coin', 'hint', 'cta',  // UI: above world
] as const
export type LayerKey = typeof Z_ORDER[number]

// World sprite placement. PSD smartobjects are non-uniformly scaled, so we
// store both position and size and force them via `applySpec`.
export type LayerSpec = { x: number; y: number; w: number; h: number }

const s = (x: number, y: number, w: number, h: number): LayerSpec => ({ x, y, w, h })

export function applySpec(sprite: Sprite, spec: LayerSpec): void {
  sprite.anchor.set(0, 0)
  sprite.position.set(spec.x, spec.y)
  sprite.width = spec.w
  sprite.height = spec.h
}

// UI element is anchored to a viewport edge/corner and scaled with cover scale.
// `offsetX/Y` are in design pixels relative to the chosen edge.
export type UiAnchor = {
  hAnchor: 'left' | 'right' | 'center'
  vAnchor: 'top' | 'bottom' | 'center'
  offsetX: number
  offsetY: number
  w: number
  h: number
}

export function applyUiAnchor(
  sprite: Sprite, a: UiAnchor, viewW: number, viewH: number, scale: number,
): void {
  const sw = a.w * scale
  const sh = a.h * scale
  const ox = a.offsetX * scale
  const oy = a.offsetY * scale
  let x = 0, y = 0
  switch (a.hAnchor) {
    case 'left':   x = ox; break
    case 'right':  x = viewW - sw - ox; break
    case 'center': x = (viewW - sw) / 2 + ox; break
  }
  switch (a.vAnchor) {
    case 'top':    y = oy; break
    case 'bottom': y = viewH - sh - oy; break
    case 'center': y = (viewH - sh) / 2 + oy; break
  }
  sprite.anchor.set(0, 0)
  sprite.position.set(x, y)
  sprite.width = sw
  sprite.height = sh
}

export type MeatChunk = {
  texture: Extract<AssetName, 'meat1' | 'meat2'>
  spec: LayerSpec
  flipped?: boolean
}

// Spine spit visuals (kebab_back + kebab_front) are positioned by root + uniform scale.
export type SpineSpitPos = { x: number; y: number; scale: number }

export type LayoutMap = {
  background: { back: LayerSpec; table: LayerSpec }

  // Clients walk in above the counter — PSD has no client layer; positions are placed.
  // Client.position is the spine root (feet). y is PLACEHOLDER until calibrated.
  clientSlots: Point[]
  clientScale: number

  // Order bubble — same for every client. Offset is in world (design) pixels
  // from the client's anchor; scale.x/y are independent so it can be squashed.
  bubble: {
    offset: { x: number; y: number }
    scale:  { x: number; y: number }
  }

  // Per-character horizontal offset of the spine inside its Client, in WORLD
  // (design) pixels. Negative shifts the character left of the slot anchor;
  // the bubble (anchored to the slot) stays put. Missing entries = 0.
  clientSpineOffsetX: Partial<Record<SpineName, number>>

  pita: { basket: LayerSpec; tortilla: LayerSpec }
  fries: LayerSpec
  knife: LayerSpec
  spit: LayerSpec    // grill smartobject
  pan: LayerSpec     // bowl smartobject

  tomatoSlices: LayerSpec[]
  cucumberSlices: LayerSpec[]
  juice: LayerSpec[]
  plates: LayerSpec[]

  pitaClean: { pita1: LayerSpec; pita2: LayerSpec }
  meatStack: MeatChunk[]

  // PLACEHOLDER — final coords TBD from PSD/layout-data.
  spitSpine: SpineSpitPos

  // Screen-anchored UI. Edge offsets/sizes derived from PSD positions
  // assuming a 1280×720 reference frame.
  ui: {
    coinHud:     UiAnchor
    soundButton: UiAnchor
  }
}

export const layout: LayoutMap = {
  background: {
    back:  s(0,  -97, 1280,  721),  // Layer 0 (pixel)
    table: s(0, -164, 1280, 1177),  // table smartobject
  },

  // Y is the TOP edge (head line) — Client offsets the spine internally so
  // characters of different heights share the same head Y (feet vary).
  // Middle client centered horizontally; outer two ±200px around the center.
  clientSlots: [
    new Point(400, 190),
    new Point(600, 190),
    new Point(800, 190),
  ],
  // PLACEHOLDER — characters are ~600–770px tall; halve them for now.
  clientScale: 0.45,

  // PLACEHOLDER — tweak to align the bubble with the head.
  bubble: {
    offset: { x: 70, y: 5 },
    scale:  { x: 0.77, y: 0.77 },
  },

  // Per-character horizontal nudges (world pixels). Bubble stays at slot.
  clientSpineOffsetX: {
    old_grambler: -10,
  },

  pita: {
    basket:   s(679, 551, 150, 104),
    tortilla: s(700, 552, 109,  65),
  },

  fries: s(640, 477,  73,  70),
  knife: s(433, 565,  92,  68),
  spit:  s(355, 321, 154, 278),
  pan:   s(541, 552, 138, 100),

  tomatoSlices: [
    s(557, 480, 33, 32),
    s(585, 480, 33, 32),
    s(555, 496, 33, 32),
    s(583, 496, 33, 32),
    s(549, 513, 33, 32),
    s(577, 513, 33, 32),
  ],

  cucumberSlices: [
    s(738, 480, 51, 33),
    s(738, 497, 51, 33),
    s(738, 512, 51, 33),
  ],

  juice: [
    s(821, 433, 47, 78),
    s(838, 487, 47, 78),
    s(857, 538, 47, 78),
  ],

  plates: [
    s(541, 384, 106, 82),
    s(647, 384, 106, 82),
    s(751, 384, 106, 82),
  ],

  pitaClean: {
    pita1: s(556, 391, 88, 63),
    pita2: s(568, 360, 72, 56),
  },

  meatStack: [
    { texture: 'meat1', spec: s(557, 562, 106, 62) },
    { texture: 'meat2', spec: s(559, 565, 114, 55) },
    { texture: 'meat1', spec: s(565, 553, 107, 63), flipped: true },
  ],

  // PLACEHOLDER — replace with PSD/layout-derived coords.
  // Roughly fits the spine skeleton (~434×770) into the PSD grill rect
  // (355,321..509,599). Anchor placed at bottom-center of the grill,
  // assuming the spine root bone sits at the bottom of the figure.
  // Replace once spine bones are calibrated against the actual grill cavity.
  spitSpine: { x: 432, y: 580, scale: 0.25 },

  ui: {
    // PSD: coin (2, 0) 72x79 → top-left
    coinHud:     { hAnchor: 'left', vAnchor: 'top',    offsetX: 2, offsetY: 0, w: 72, h: 79 },
    // PSD: sound (2, 655) 61x64 → bottom-left (720 - 655 - 64 = 1)
    soundButton: { hAnchor: 'left', vAnchor: 'bottom', offsetX: 2, offsetY: 1, w: 61, h: 64 },
  },
}

export type CoverResult = { scale: number; offsetX: number; offsetY: number }

// Cover-fit: scale design canvas to fully cover the viewport, center-crop excess.
// In extreme aspect mismatches (e.g. portrait phone vs landscape design) this
// crops significantly — that's accepted per design.
export function cover(viewW: number, viewH: number): CoverResult {
  const scale = Math.max(viewW / DESIGN_W, viewH / DESIGN_H)
  return {
    scale,
    offsetX: (viewW - DESIGN_W * scale) / 2,
    offsetY: (viewH - DESIGN_H * scale) / 2,
  }
}
