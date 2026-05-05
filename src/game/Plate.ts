import { Container, Point } from 'pixi.js'
import type { Ingredient, RecipeId } from '../recipes'

export class Plate extends Container {
  readonly recipeId: RecipeId
  readonly ingredients: Ingredient[]
  onTap: ((p: Plate) => void) | null = null

  constructor(recipeId: RecipeId, ingredients: Ingredient[]) {
    super()
    this.recipeId = recipeId
    this.ingredients = ingredients
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.on('pointerdown', () => this.onTap?.(this))
    // TODO: render plate + stacked ingredient sprites
  }

  flyTo(pos: Point, onDone: () => void): void {
    // TODO: tween to pos, then onDone
    this.position.set(pos.x, pos.y)
    onDone()
  }

  destroyPlate(): void {
    this.destroy({ children: true })
  }
}
