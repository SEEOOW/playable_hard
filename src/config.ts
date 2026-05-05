import type { RecipeId } from './recipes'

export const config = {
  spit: {
    cookTime: 2.5,
    maxPortions: 4,
  },
  client: {
    walkInDuration: 0.8,
    patience: 12,
    walkOutDuration: 0.6,
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
  },
  coinsPerOrder: 10,
} as const
