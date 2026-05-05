import type { RecipeId } from '../recipes'

export type OrderItem = { recipe: RecipeId; delivered: boolean }

export class Order {
  readonly items: OrderItem[]

  constructor(recipes: RecipeId[]) {
    this.items = recipes.map((recipe) => ({ recipe, delivered: false }))
  }

  tryDeliver(recipe: RecipeId): boolean {
    const item = this.items.find((i) => !i.delivered && i.recipe === recipe)
    if (!item) return false
    item.delivered = true
    return true
  }

  isComplete(): boolean {
    return this.items.every((i) => i.delivered)
  }
}
