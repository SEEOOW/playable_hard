export type Ingredient = 'pita' | 'meat' | 'fries' | 'tomato' | 'cucumber' | 'juice'
export type RecipeId = 'shawarma' | 'juice'
export type Recipe = { required: Ingredient[]; optional: Ingredient[] }

export const recipes: Record<RecipeId, Recipe> = {
  shawarma: {
    required: ['pita', 'meat'],
    optional: ['fries', 'tomato', 'cucumber'],
  },
  juice: {
    required: ['juice'],
    optional: [],
  },
}

export function recipeFor(ingredients: Ingredient[]): RecipeId | null {
  // TODO: pick the recipe whose required set is fully covered by ingredients
  return null
}
