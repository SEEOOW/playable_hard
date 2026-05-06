// Order generation for clients. An order has 1 or 3 positions; each position
// is either a drink or a pita variant. Pita is meat + 0..2 toppings (never
// all three).
import type { PitaTopping } from './recipes'

export type OrderItem =
  | { kind: 'drink' }
  | { kind: 'pita'; toppings: PitaTopping[] }

// Coin reward per ingredient. Pita base ("лепёшка") and meat are implicit
// in every closed pita; toppings are charged on top.
export const PRICE = {
  pita: 3,
  meat: 5,
  cucumber: 4,
  fries: 3,
  tomato: 2,
  drink: 5,
} as const

export function priceForItem(item: OrderItem): number {
  if (item.kind === 'drink') return PRICE.drink
  let sum = PRICE.pita + PRICE.meat
  for (const t of item.toppings) sum += PRICE[t]
  return sum
}

const TOPPINGS: ReadonlyArray<PitaTopping> = ['cucumber', 'fries', 'tomato']

export function generateOrder(): OrderItem[] {
  const count = Math.random() < 0.5 ? 1 : 3
  const items: OrderItem[] = []
  for (let i = 0; i < count; i++) items.push(generateItem())
  return items
}

function generateItem(): OrderItem {
  if (Math.random() < 0.3) return { kind: 'drink' }
  return { kind: 'pita', toppings: randomToppings() }
}

function randomToppings(): PitaTopping[] {
  // 0, 1, or 2 toppings — never all three.
  const count = Math.floor(Math.random() * 3)
  const shuffled = [...TOPPINGS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
