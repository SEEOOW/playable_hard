import { Container, Sprite } from 'pixi.js'
import { tex } from '../assets'
import { applySpec } from '../layout'
import {
  OPEN_BASE, INGREDIENT_LAYERS, INGREDIENT_Z,
  PITA_SCALE_X, PITA_SCALE_Y,
  type PitaIngredient, type PitaLayer, type PitaTopping,
} from './recipes'

// One pita on a plate. Starts empty (no children); spawnEmpty() lays down the
// base bread (open pita), then addIngredient() fills meat/fries/cucumber/tomato
// in PSD-derived layer positions, capped at MAX_INGREDIENTS.
export class PitaAssembly extends Container {
  static readonly MAX_INGREDIENTS = 3

  // Fired when the player taps any visible part of the assembly. Outer code
  // (Kitchen → GameScene → ClientQueue) decides whether the tap delivers an
  // order, and resets this assembly on success.
  onTap: ((p: PitaAssembly) => void) | null = null

  private placed = false
  private ingredients = new Set<PitaIngredient>()

  constructor() {
    super()
    this.scale.set(PITA_SCALE_X, PITA_SCALE_Y)
  }

  hasPita(): boolean { return this.placed }
  isFull(): boolean { return this.ingredients.size >= PitaAssembly.MAX_INGREDIENTS }
  hasMeat(): boolean { return this.ingredients.has('meat') }

  // Toppings = ingredients excluding meat; matches OrderItem.toppings shape.
  toppings(): PitaTopping[] {
    const out: PitaTopping[] = []
    for (const ing of this.ingredients) {
      if (ing !== 'meat') out.push(ing)
    }
    return out
  }

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

  // Empty the plate slot — visuals gone, ingredients cleared, ready for a new
  // basket tap to place a fresh open pita.
  reset(): void {
    this.placed = false
    this.ingredients.clear()
    this.removeChildren()
  }

  // Rebuild children in canonical z-order (base → meat → toppings) so adding
  // ingredients out of order still produces correct stacking.
  private rebuild(): void {
    this.removeChildren()
    for (const layer of OPEN_BASE) this.addChild(this.makeLayer(layer))
    for (const ing of INGREDIENT_Z) {
      if (this.ingredients.has(ing)) {
        for (const layer of INGREDIENT_LAYERS[ing]) {
          this.addChild(this.makeLayer(layer))
        }
      }
    }
  }

  private makeLayer(layer: PitaLayer): Sprite {
    const s = new Sprite(tex(layer.tex))
    applySpec(s, layer.spec)
    s.eventMode = 'static'
    s.cursor = 'pointer'
    s.on('pointerdown', () => this.onTap?.(this))
    return s
  }
}
