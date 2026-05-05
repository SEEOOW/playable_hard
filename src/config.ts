import type { RecipeId } from './recipes'

export const config = {
  spit: {
    cookTime: 2.5,
    maxPortions: 4,
  },
  client: {
    walkInDuration: 2.4,
    patience: 12,
    walkOutDuration: 1.8,
  },
  queue: {
    spawnInterval: 1.5,
    maxConcurrent: 3,
    orderPlan: [
      ['shawarma'],
      ['shawarma', 'juice'],
      ['shawarma'],
    ] as RecipeId[][],
  },
  hint: {
    idleDelay: 1.5,
  },
  drink: {
    cooldown: 3.0,  // seconds before a tapped drink reappears
  },
  cooking: {
    sliceDuration: 1.8,   // knife top→bottom pass per tap, sec
    flyDuration:   0.4,   // slice flies from knife to bowl slot, sec
    // Vertical slicing path (knife sprite top-left during slice).
    sliceX:        386,   // base x — blade roughly aligned with meat center
    sliceY0:       410,   // start at meat top (PSD spit y=321)
    sliceY1:       500,   // end at meat bottom (PSD spit y=599)
    // Sawing motion: knife oscillates horizontally while descending.
    sawAmp:        14,    // px deviation from sliceX
    sawFreq:       6,     // full cycles per slice
    // kebab_cut overlay shown per slice. Within a single slice the texture
    // swaps from small → big at `cutSwapRatio` of the slice duration; the
    // small piece appears as the cut starts and the big piece replaces it
    // by the time the knife reaches the bottom.
    cutSkinSmall:  '01',
    cutSkinLarge:  '15',  // patch 15 lives on kebab_cut_3 — the largest cut
    cutSwapRatio:  0.5,
    // Spine animation is 20s by default; speed up so the alpha fade-out
    // (cut piece "rotated off-screen") finishes a few seconds after the slice.
    cutTimeScale:  4,
  },
  coinsPerOrder: 10,
} as const
