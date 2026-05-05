// Pita assembly recipes — derived from psd/pita/{open,close}/*.psd references.
// PSD canvas is 200×200; layer specs below mirror PSD layer bounds 1:1 so a
// PitaAssembly Container scaled (PITA_SCALE_X, PITA_SCALE_Y) and positioned at
// the right plate origin produces the same visuals as the PSD reference.
//
// Textures referenced here live in `images/pita/` and are direct PNG renders
// of the PSD layers (not the dish/meat folder versions, which are different
// images sharing the same PSD layer name).
import type { LayerSpec } from '../layout'
import type { AssetName } from '../assets'

export type PitaTopping = 'cucumber' | 'fries' | 'tomato'
export type PitaIngredient = 'meat' | PitaTopping

export type PitaLayer = { tex: AssetName; spec: LayerSpec }

const r = (x: number, y: number, w: number, h: number): LayerSpec => ({ x, y, w, h })

// Open pita on plate: back bread + top fold (no front cover).
export const OPEN_BASE: ReadonlyArray<PitaLayer> = [
  { tex: 'pita_back', spec: r(49, 66, 104, 70) },
  { tex: 'pita_top',  spec: r(65, 30,  84, 62) },
]

// Closed pita (bubble): back bread + filling + front cover (drawn last).
export const CLOSED_BACK: ReadonlyArray<PitaLayer> = [
  { tex: 'pita_back', spec: r(49, 66, 104, 70) },
]
export const CLOSED_FRONT: PitaLayer = {
  tex: 'pita_front', spec: r(58, 50, 90, 44),
}

// Each ingredient produces one or more sprite layers at fixed PSD positions.
// Within an ingredient, layers are ordered back → front (drawn first → last).
export const INGREDIENT_LAYERS: Record<PitaIngredient, ReadonlyArray<PitaLayer>> = {
  meat: [
    { tex: 'pita_meat_a', spec: r(48, 77, 95, 53) }, // lower row, behind
    { tex: 'pita_meat_b', spec: r(51, 59, 95, 55) }, // upper row, in front
  ],
  fries: [
    { tex: 'pita_fries_a', spec: r(48, 61, 54, 47) }, // left handful
    { tex: 'pita_fries_b', spec: r(93, 79, 55, 47) }, // right handful
  ],
  cucumber: [
    { tex: 'pita_cucumber', spec: r(52, 68, 48, 42) },
    { tex: 'pita_cucumber', spec: r(86, 88, 48, 42) },
  ],
  tomato: [
    { tex: 'pita_tomato', spec: r( 63, 64, 33, 32) },
    { tex: 'pita_tomato', spec: r( 80, 73, 33, 32) },
    { tex: 'pita_tomato', spec: r( 96, 83, 33, 32) },
    { tex: 'pita_tomato', spec: r(113, 94, 33, 32) },
  ],
}

// Z-order priority (back → front) when multiple ingredients coexist. Derived
// from PSD: meat is the deepest filling, then fries, then cucumber, tomato on top.
export const INGREDIENT_Z: ReadonlyArray<PitaIngredient> = ['meat', 'fries', 'cucumber', 'tomato']

// Closed-pita variants for bubbles. 7 recipes — meat is implicit; max 2 toppings.
export type Recipe = { toppings: ReadonlyArray<PitaTopping> }

export const RECIPES: ReadonlyArray<Recipe> = [
  { toppings: [] },
  { toppings: ['cucumber'] },
  { toppings: ['fries'] },
  { toppings: ['tomato'] },
  { toppings: ['cucumber', 'fries'] },
  { toppings: ['cucumber', 'tomato'] },
  { toppings: ['fries', 'tomato'] },
]

// Assembled layer list for a closed pita (bubble visual).
export function closedPitaLayers(recipe: Recipe): PitaLayer[] {
  const layers: PitaLayer[] = []
  layers.push(...CLOSED_BACK)
  layers.push(...INGREDIENT_LAYERS.meat)
  for (const ing of INGREDIENT_Z) {
    if (ing === 'meat') continue
    if (recipe.toppings.includes(ing as PitaTopping)) {
      layers.push(...INGREDIENT_LAYERS[ing])
    }
  }
  layers.push(CLOSED_FRONT)
  return layers
}

// PSD canvas → plate placement transform. Tuned to match the existing pita1/2
// placement (which was derived from PSD bounds and the 0.85×0.9 PSD scale used
// across the level).
export const PITA_SCALE_X = 0.85
export const PITA_SCALE_Y = 0.9
// Plate top-left → PSD origin offset (in WORLD pixels at the above scale).
export const PITA_ORIGIN_DX = -28
export const PITA_ORIGIN_DY = -52
