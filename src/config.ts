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
  coinsPerOrder: 10,
} as const
