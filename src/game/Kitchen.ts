import { Container, Point, Sprite } from 'pixi.js'
import { MeatSpit } from './MeatSpit'
import { Plate } from './Plate'
import { tex, type AssetName } from '../assets'
import { applySpec, type LayoutMap, type LayerSpec } from '../layout'
import { config } from '../config'
import type { Ingredient, RecipeId } from '../recipes'

type CookState = 'idle' | 'slicing' | 'flying' | 'done'

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

  // Cooking sequence state machine: tap → slice → fly → idle (× 3 → done)
  private cookState: CookState = 'idle'
  private nextSlotIdx = 0
  private sliceT = 0
  private flyT = 0
  private knifeRest = new Point()
  private flyStart = new Point()
  private slotCenters: Point[] = [new Point(), new Point(), new Point()]

  private activeRecipes: RecipeId[] = []
  private inProgress: Ingredient[] = []

  constructor() {
    super()

    this.spit = new MeatSpit()
    this.spit.onSliceTap = () => this.requestSlice()

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
    // Bowl starts empty — meat is revealed slot-by-slot on tap.
    this.meatStack.forEach((s) => { s.visible = false })

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
    this.runCooking(dt)
  }

  layout(map: LayoutMap): void {
    applySpec(this.basket,   map.pita.basket)
    applySpec(this.tortilla, map.pita.tortilla)
    this.spit.layout(map.spit, map.spitSpine)
    applySpec(this.knife, map.knife)
    applySpec(this.bowl,  map.pan)
    applySpec(this.fries, map.fries)

    applyMany(this.cucumberSlices, map.cucumberSlices)
    applyMany(this.plateSprites,   map.plates)
    applyMany(this.drinks,          map.juice)
    applyMany(this.tomatoSlices,    map.tomatoSlices)

    applySpec(this.pita1, map.pitaClean.pita1)
    applySpec(this.pita2, map.pitaClean.pita2)

    // Meat slices use center anchor — easier to fly in and to flip-mirror
    // in place. Slot centers are stored for the cooking sequence.
    for (let i = 0; i < this.meatStack.length; i++) {
      const chunk = map.meatStack[i]
      const sprite = this.meatStack[i]
      sprite.texture = tex(chunk.texture)
      sprite.anchor.set(0.5, 0.5)
      sprite.width = chunk.spec.w
      sprite.height = chunk.spec.h
      if (chunk.flipped) sprite.scale.x = -Math.abs(sprite.scale.x)
      this.slotCenters[i].set(chunk.spec.x + chunk.spec.w / 2, chunk.spec.y + chunk.spec.h / 2)
      sprite.position.copyFrom(this.slotCenters[i])
    }

    this.knifeRest.set(map.knife.x, map.knife.y)
  }

  // Called from MeatSpit.onSliceTap. Starts a slice if idle and slots remain.
  private requestSlice(): void {
    if (this.cookState !== 'idle') return
    if (this.nextSlotIdx >= this.meatStack.length) return
    this.cookState = 'slicing'
    this.sliceT = 0
  }

  private runCooking(dt: number): void {
    const c = config.cooking

    if (this.cookState === 'slicing') {
      this.sliceT += dt
      const p = Math.min(this.sliceT / c.sliceDuration, 1)
      const saw = Math.sin(p * c.sawFreq * Math.PI * 2) * c.sawAmp
      this.knife.position.x = c.sliceX + saw
      this.knife.position.y = lerp(c.sliceY0, c.sliceY1, p)
      if (p >= 1) {
        // Slice landed at the bottom of the meat — spawn fly-in for next slot.
        this.flyStart.set(
          this.knife.position.x + this.knife.width / 2,
          this.knife.position.y + this.knife.height / 2,
        )
        this.meatStack[this.nextSlotIdx].visible = true
        this.flyT = 0
        this.cookState = 'flying'
        // Knife snaps back to rest immediately so player can tap again sooner.
        this.knife.position.copyFrom(this.knifeRest)
      }
    } else if (this.cookState === 'flying') {
      this.flyT += dt
      const p = Math.min(this.flyT / c.flyDuration, 1)
      const eased = 1 - (1 - p) * (1 - p)
      const sprite = this.meatStack[this.nextSlotIdx]
      sprite.position.x = lerp(this.flyStart.x, this.slotCenters[this.nextSlotIdx].x, eased)
      sprite.position.y = lerp(this.flyStart.y, this.slotCenters[this.nextSlotIdx].y, eased)
      if (p >= 1) {
        this.nextSlotIdx += 1
        this.cookState = this.nextSlotIdx >= this.meatStack.length ? 'done' : 'idle'
      }
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
