import { Container, Sprite } from 'pixi.js'
import { tex } from '../assets'
import { applySpec } from '../layout'
import {
  OPEN_BASE, INGREDIENT_LAYERS, INGREDIENT_Z,
  PITA_SCALE_X, PITA_SCALE_Y,
  type PitaIngredient, type PitaLayer,
} from './recipes'

// One pita on a plate. Starts empty (no children); spawnEmpty() lays down the
// base bread (open pita), then addIngredient() fills meat/fries/cucumber/tomato
// in PSD-derived layer positions, capped at MAX_INGREDIENTS.
export class PitaAssembly extends Container {
  static readonly MAX_INGREDIENTS = 3

  private placed = false
  private ingredients = new Set<PitaIngredient>()

  constructor() {
    super()
    this.scale.set(PITA_SCALE_X, PITA_SCALE_Y)
  }

  hasPita(): boolean { return this.placed }
  isFull(): boolean { return this.ingredients.size >= PitaAssembly.MAX_INGREDIENTS }

  spawnEmpty(): boolean {
    if (this.placed) return false
    this.placed = true
    this.rebuild()
    return true
  }

  addIngredient(ing: PitaIngredient): boolean {
    if (!this.placed) return false
    if (this.ingredients.has(ing)) return false
    if (this.isFull()) return false
    this.ingredients.add(ing)
    this.rebuild()
    return true
  }

  // Rebuild children in canonical z-order (base → meat → toppings) so adding
  // ingredients out of order still produces correct stacking.
  private rebuild(): void {
    this.removeChildren()
    for (const layer of OPEN_BASE) this.addChild(makeLayer(layer))
    for (const ing of INGREDIENT_Z) {
      if (this.ingredients.has(ing)) {
        for (const layer of INGREDIENT_LAYERS[ing]) {
          this.addChild(makeLayer(layer))
        }
      }
    }
  }
}

function makeLayer(layer: PitaLayer): Sprite {
  const s = new Sprite(tex(layer.tex))
  applySpec(s, layer.spec)
  return s
}
