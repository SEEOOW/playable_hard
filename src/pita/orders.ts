// Order generation for clients. An order has 1 or 3 positions; each position
// is either a drink or a pita variant. Pita is meat + 0..2 toppings (never
// all three).
import type { PitaTopping } from './recipes'

export type OrderItem =
  | { kind: 'drink' }
  | { kind: 'pita'; toppings: PitaTopping[] }

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
