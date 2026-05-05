import { Container, Sprite } from 'pixi.js'
import { MeatSpit } from './MeatSpit'
import { Plate } from './Plate'
import { tex, type AssetName } from '../assets'
import { applySpec, type LayoutMap, type LayerSpec } from '../layout'
import type { Ingredient, RecipeId } from '../recipes'

export class Kitchen extends Container {
  readonly spit: MeatSpit
  onPlateReady: ((plate: Plate) => void) | null = null

  // PSD-mirrored decor + interactives
  private basket: Sprite
  private tortilla: Sprite
  private knife: Sprite
  private bowl: Sprite
  private fries: Sprite
  private cucumberSlices: Sprite[]
  private plateSprites: Sprite[]
  private drinks: Sprite[]
  private tomatoSlices: Sprite[]
  private pita1: Sprite
  private pita2: Sprite
  private meatStack: Sprite[]

  private activeRecipes: RecipeId[] = []
  private inProgress: Ingredient[] = []

  constructor() {
    super()

    this.spit = new MeatSpit()
    this.basket   = new Sprite(tex('basket'))
    this.tortilla = new Sprite(tex('tortilla'))
    this.knife    = new Sprite(tex('knife'))
    this.bowl     = new Sprite(tex('bowl'))
    this.fries    = new Sprite(tex('fries'))
    this.pita1    = new Sprite(tex('pita1'))
    this.pita2    = new Sprite(tex('pita2'))

    this.cucumberSlices = makeMany('cucumber', 3)
    this.plateSprites   = makeMany('plate', 3)
    this.drinks         = makeMany('drink', 3)
    this.tomatoSlices   = makeMany('tomato', 6)
    this.meatStack      = [new Sprite(), new Sprite(), new Sprite()]

    // PSD layer order (back → front):
    // basket → tortilla → grill (MeatSpit) → knife → bowl → fries
    // → cucumber → plates → drinks → tomato → pita_clean → meat
    this.addChild(
      this.basket,
      this.tortilla,
      this.spit,
      this.knife,
      this.bowl,
      this.fries,
      ...this.cucumberSlices,
      ...this.plateSprites,
      ...this.drinks,
      ...this.tomatoSlices,
      this.pita1,
      this.pita2,
      ...this.meatStack,
    )
  }

  setActiveRecipes(recipes: RecipeId[]): void {
    this.activeRecipes = recipes
  }

  hintTarget(step: 'pita' | 'meat' | 'juice' | 'plate'): Container | null {
    switch (step) {
      case 'pita':  return this.tortilla
      case 'meat':  return this.bowl
      case 'juice': return this.drinks[1]
      case 'plate': return this.plateSprites[0]
    }
  }

  update(dt: number): void {
    this.spit.update(dt)
  }

  layout(map: LayoutMap): void {
    applySpec(this.basket,   map.pita.basket)
    applySpec(this.tortilla, map.pita.tortilla)
    this.spit.layout(map.spit)
    applySpec(this.knife, map.knife)
    applySpec(this.bowl,  map.pan)
    applySpec(this.fries, map.fries)

    applyMany(this.cucumberSlices, map.cucumberSlices)
    applyMany(this.plateSprites,   map.plates)
    applyMany(this.drinks,          map.juice)
    applyMany(this.tomatoSlices,    map.tomatoSlices)

    applySpec(this.pita1, map.pitaClean.pita1)
    applySpec(this.pita2, map.pitaClean.pita2)

    for (let i = 0; i < this.meatStack.length; i++) {
      const chunk = map.meatStack[i]
      this.meatStack[i].texture = tex(chunk.texture)
      applySpec(this.meatStack[i], chunk.spec)
    }
  }
}

function makeMany(name: AssetName, n: number): Sprite[] {
  const arr: Sprite[] = []
  for (let i = 0; i < n; i++) arr.push(new Sprite(tex(name)))
  return arr
}

function applyMany(sprites: Sprite[], specs: LayerSpec[]): void {
  const n = Math.min(sprites.length, specs.length)
  for (let i = 0; i < n; i++) applySpec(sprites[i], specs[i])
}
