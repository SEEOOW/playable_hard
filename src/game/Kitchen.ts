import { Container, Graphics, Point, Sprite } from 'pixi.js'
import { MeatSpit } from './MeatSpit'
import { Plate } from './Plate'
import { tex, type AssetName } from '../assets'
import { applySpec, type LayoutMap, type LayerSpec } from '../layout'
import { config } from '../config'
import type { Ingredient, RecipeId } from '../recipes'
import { PitaAssembly } from '../pita/PitaAssembly'
import { PITA_ORIGIN_DX, PITA_ORIGIN_DY, type PitaIngredient, type PitaTopping } from '../pita/recipes'

type CookState = 'idle' | 'slicing'

export class Kitchen extends Container {
  readonly spit: MeatSpit
  onPlateReady: ((plate: Plate) => void) | null = null
  // Tap on a built pita: outer code (Scene → ClientQueue) returns true if it
  // was delivered to a waiting client, in which case the plate slot is reset.
  onPitaTap:  ((p: PitaAssembly) => boolean) | null = null
  // Tap on a drink: outer code returns true if the drink was accepted by a
  // waiting client, triggering the reappear cooldown. No-op on no match.
  onDrinkTap: ((idx: number) => boolean) | null = null
  // Smart Cooking feed: outer scene supplies the topping sets of every
  // undelivered pita slot in waiting clients. Used to gate basket placements
  // and ingredient additions so the player can only build pitas that match
  // some active order's path (subset relation).
  activeOrderToppings: (() => ReadonlyArray<ReadonlyArray<PitaTopping>>) | null = null

  // SFX hooks — each fires ONLY when the corresponding action is actually
  // accepted (slot free, Smart Cooking allows, etc.). Blocked taps don't
  // fire any of these callbacks, so they stay silent per the audio spec.
  onSliceStart:       (() => void) | null = null
  onMeatPlaced:       (() => void) | null = null
  onPitaPlaced:       (() => void) | null = null
  onIngredientAdded:  (() => void) | null = null
  // Generic "the player tapped an ingredient station" feedback — fires on
  // every press, regardless of whether the ingredient ended up on a pita.
  // Wired to the click sound so players always hear they hit something.
  onIngredientTap:    ((ing: PitaIngredient) => void) | null = null
  // Same idea for taps on a built pita assembly — fires before the delivery
  // match attempt so the click sound plays even when no client matches.
  onPitaPress:        (() => void) | null = null
  // Tap on the basket (pita stack) — fires on every press, even when Smart
  // Cooking refuses the placement; onPitaPlaced still gates the success SFX.
  onBasketTap:        (() => void) | null = null
  // Tap on the spit — fires on every press, even when the slice limit has
  // been reached. onSliceStart still gates the slicing SFX to accepted taps.
  onSpitTap:          (() => void) | null = null

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
  // One pita assembly per plate slot. Empty until the player taps the basket.
  // After that, ingredient taps fill it up to PitaAssembly.MAX_INGREDIENTS.
  private pitas: PitaAssembly[]
  private meatStack: Sprite[]

  // Each successful tap on the spit places a portion in the bowl IMMEDIATELY
  // (visible + counted toward the consumption limit) and, if the knife is
  // free, kicks off the slicing animation as cosmetic feedback. Rapid taps
  // stack portions without queueing animations.
  private cookState: CookState = 'idle'
  private nextSlotIdx = 0
  private sliceT = 0
  private cutSwapped = false
  private knifeRest = new Point()
  private slotCenters: Point[] = [new Point(), new Point(), new Point()]

  private activeRecipes: RecipeId[] = []
  private inProgress: Ingredient[] = []

  // Per-drink cooldown timer; >0 means hidden, ticks down to 0 → reappear.
  private drinkCooldown: number[] = [0, 0, 0]
  // Visual cooldown clock that replaces the drink while it's away. The
  // timer_progress sprite is revealed by a wedge-shaped Graphics mask that
  // grows from 0° to 360° over the cooldown — so the indicator visibly
  // sweeps around the timer.png face like a filling clock.
  private drinkTimers: Container[] = []
  private drinkTimerMasks: Graphics[] = []

  constructor() {
    super()

    this.spit = new MeatSpit()
    this.spit.onSliceTap = () => {
      this.onSpitTap?.()
      this.requestSlice()
    }

    this.basket   = new Sprite(tex('basket'))
    this.tortilla = new Sprite(tex('tortilla'))
    this.knife    = new Sprite(tex('knife'))
    this.bowl     = new Sprite(tex('bowl'))
    this.fries    = new Sprite(tex('fries'))

    // Knife sweeps over the spit during the slice animation; without this it
    // would catch pointerdown when overlapping the grill hit area, swallowing
    // the player's tap. Visual stays on top of the spit; only events pass
    // through to the meat hit zone below.
    this.knife.eventMode = 'none'

    this.cucumberSlices = makeMany('cucumber', 3)
    this.plateSprites   = makeMany('plate', 3)
    this.drinks         = makeMany('drink', 3)
    this.tomatoSlices   = makeMany('tomato', 6)
    this.pitas          = [new PitaAssembly(), new PitaAssembly(), new PitaAssembly()]
    this.meatStack      = [new Sprite(), new Sprite(), new Sprite()]
    for (let i = 0; i < 3; i++) {
      const c = new Container()
      c.eventMode = 'none'
      c.visible = false
      const bg = new Sprite(tex('timer'))
      bg.anchor.set(0.5, 0.5)
      const progress = new Sprite(tex('timer_progress'))
      progress.anchor.set(0.5, 0.5)
      const mask = new Graphics()
      progress.mask = mask
      c.addChild(bg, progress, mask)
      this.drinkTimers.push(c)
      this.drinkTimerMasks.push(mask)
    }
    // Bowl starts empty — meat is revealed slot-by-slot on tap.
    this.meatStack.forEach((s) => { s.visible = false })

    // Pita station is the basket+tortilla pile. Click target is the basket
    // (larger sprite below); tortilla on top stays non-interactive so taps
    // pass through to it.
    this.basket.eventMode = 'static'
    this.basket.cursor = 'pointer'
    this.tortilla.eventMode = 'none'
    this.basket.on('pointerdown', () => {
      this.onBasketTap?.()
      this.placePita()
    })

    // Ingredient stations on the table — tap on any of them adds the
    // corresponding ingredient inside the current open pita. Cap at 3.
    // Meat slots (when visible) sit on top of the bowl and would otherwise
    // swallow the tap, so wire them too. Every press also fires
    // onIngredientTap (scene plays the click sound).
    const wireIng = (sprite: Sprite, ing: PitaIngredient) => setupTapAdd(sprite, () => {
      this.onIngredientTap?.(ing)
      this.addIngredient(ing)
    })
    wireIng(this.bowl, 'meat')
    this.meatStack.forEach((s) => wireIng(s, 'meat'))
    wireIng(this.fries, 'fries')
    this.cucumberSlices.forEach((s) => wireIng(s, 'cucumber'))
    this.tomatoSlices.forEach((s) => wireIng(s, 'tomato'))
    // Drinks aren't placed inside the pita — they're a separate order item.
    // Tap → try to deliver; on success hide + reappear after cooldown.
    this.drinks.forEach((sprite, idx) => setupTapAdd(sprite, () => this.tryDeliverDrink(idx)))

    // Built pitas can be delivered by tapping them. Each PitaAssembly forwards
    // its tap to Kitchen, which delegates the match attempt to the outer scene.
    for (const pita of this.pitas) {
      pita.onTap = (p) => this.tryDeliverPita(p)
    }

    this.addChild(
      this.basket,
      this.tortilla,
      this.spit,
      this.knife,
      this.bowl,
      this.fries,
      ...this.cucumberSlices,
      ...this.plateSprites,
      ...this.tomatoSlices,
      ...this.pitas,
      ...this.meatStack,
      // Drinks (and their timers) render ABOVE the pita assemblies so the
      // top cup isn't covered by the pita art that bleeds past the rightmost
      // plate. Drinks stay clickable because they're hit-tested first.
      ...this.drinks,
      ...this.drinkTimers,
    )
  }

  // Lays an empty open pita on the first plate that doesn't have one yet.
  // Smart Cooking: blocked when adding the new empty pita would leave any
  // existing assembly without a unique active order to claim.
  private placePita(): void {
    if (!this.smartCookingCanPlace()) return
    for (const pita of this.pitas) {
      if (!pita.hasPita()) {
        pita.spawnEmpty()
        this.onPitaPlaced?.()
        return
      }
    }
  }

  // Adds an ingredient to the first plate whose pita exists, isn't full,
  // doesn't already contain this ingredient, and after the addition still
  // admits a 1-to-1 assignment of every assembly to a distinct active pita
  // order (Smart Cooking — counts quantities, not just types). Meat
  // additionally consumes one portion from the bowl (LIFO).
  private addIngredient(ing: PitaIngredient): void {
    if (ing === 'meat' && !this.hasAvailableMeat()) return
    for (const pita of this.pitas) {
      if (!pita.hasPita()) continue
      if (pita.isFull()) continue
      // Meat-first rule: toppings can only land on pitas that already have
      // meat. Pitas without meat are skipped — if no other pita can accept
      // this topping, the loop exits without changing any state.
      if (ing !== 'meat' && !pita.hasMeat()) continue
      if (!this.smartCookingAllows(pita, ing)) continue
      if (pita.addIngredient(ing)) {
        if (ing === 'meat') this.consumeOneMeat()
        return
      }
    }
  }

  // Checks if every existing assembly + a hypothetical new empty pita can be
  // matched to distinct active orders. Empty pitas match anything, so the
  // gate effectively asks "is there an unused order slot left?".
  private smartCookingCanPlace(): boolean {
    if (!this.activeOrderToppings) return true
    const supply = this.currentPitaToppings()
    supply.push([])
    return this.canCoverDemand(supply)
  }

  // Hypothetically applies `next` to `target` and checks whether all
  // assemblies (including the modified one) can still be matched 1-to-1 to
  // distinct active orders. Meat is implicit in every closed-pita order, so
  // a meat addition doesn't change the topping signature.
  private smartCookingAllows(target: PitaAssembly, next: PitaIngredient): boolean {
    if (!this.activeOrderToppings) return true
    const supply: PitaTopping[][] = []
    for (const p of this.pitas) {
      if (!p.hasPita()) continue
      if (p === target) {
        const after = new Set<PitaTopping>(p.toppings())
        if (next !== 'meat') after.add(next)
        supply.push([...after])
      } else {
        supply.push(p.toppings())
      }
    }
    return this.canCoverDemand(supply)
  }

  private currentPitaToppings(): PitaTopping[][] {
    const out: PitaTopping[][] = []
    for (const p of this.pitas) {
      if (p.hasPita()) out.push(p.toppings())
    }
    return out
  }

  // True iff there's a perfect matching from `supply` to `activeOrderToppings`
  // where supply[i] can claim demand[j] iff supply[i].toppings ⊆ demand[j].
  private canCoverDemand(supply: ReadonlyArray<ReadonlyArray<PitaTopping>>): boolean {
    if (!this.activeOrderToppings) return true
    const demand = this.activeOrderToppings()
    if (supply.length === 0) return true
    if (demand.length < supply.length) return false
    return maxMatch(supply, demand) === supply.length
  }

  private hasAvailableMeat(): boolean {
    return this.meatStack.some((s) => s.visible)
  }

  // Hide the highest-index visible meat sprite (LIFO: the last revealed slice
  // is the first one consumed).
  private consumeOneMeat(): void {
    for (let i = this.meatStack.length - 1; i >= 0; i--) {
      if (this.meatStack[i].visible) {
        this.meatStack[i].visible = false
        break
      }
    }
    // Bowl emptied → reset the slot pointer so the next tap fills slot 0
    // again. Slicing animation, if running, doesn't block this — it's purely
    // visual and the bookkeeping moves with consumption.
    if (!this.hasAvailableMeat()) {
      this.nextSlotIdx = 0
    }
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

  // Hint planner accessors. Read-only intent — the planner just needs to
  // know what's currently tappable / where each station lives so it can
  // point the hand at the next valid step in the player's path.
  basketTarget(): Container { return this.basket }
  spitTarget(): Container { return this.spit }
  // Topmost visible meat slice (consumeOneMeat takes from the back of the
  // stack first); falls back to the empty bowl when nothing is sliced.
  meatTarget(): Container {
    for (let i = this.meatStack.length - 1; i >= 0; i--) {
      if (this.meatStack[i].visible) return this.meatStack[i]
    }
    return this.bowl
  }
  hasMeatInBowl(): boolean { return this.hasAvailableMeat() }
  ingredientTarget(ing: PitaTopping): Container | null {
    if (ing === 'cucumber') return this.cucumberSlices[0] ?? null
    if (ing === 'fries')    return this.fries
    if (ing === 'tomato')   return this.tomatoSlices[0] ?? null
    return null
  }
  // First drink that's currently on the counter (not on cooldown).
  drinkTarget(): Container | null {
    return this.drinks.find((s) => s.visible) ?? null
  }
  pitaAssemblies(): ReadonlyArray<PitaAssembly> { return this.pitas }
  hasUnplacedPlate(): boolean { return this.pitas.some((p) => !p.hasPita()) }

  update(dt: number): void {
    this.spit.update(dt)
    this.runCooking(dt)
    this.tickDrinks(dt)
  }

  // Restores tapped drinks after their cooldown elapses; meanwhile drives the
  // visual clock (rotating hand + seconds-left label) at the drink's slot.
  private tickDrinks(dt: number): void {
    for (let i = 0; i < this.drinkCooldown.length; i++) {
      if (this.drinkCooldown[i] <= 0) continue
      this.drinkCooldown[i] -= dt
      if (this.drinkCooldown[i] <= 0) {
        this.drinkCooldown[i] = 0
        this.drinks[i].visible = true
        this.drinkTimers[i].visible = false
      } else {
        this.updateDrinkTimer(i)
      }
    }
  }

  private updateDrinkTimer(idx: number): void {
    const remaining = this.drinkCooldown[idx]
    const total = config.drink.cooldown
    const progress = (total - remaining) / total  // 0 → 1 over cooldown
    // Wedge mask grows clockwise from 12 o'clock. Radius is generous so the
    // wedge fully covers timer_progress.png (35×34) at any rotation.
    const radius = 30
    const angle = progress * Math.PI * 2
    const m = this.drinkTimerMasks[idx]
    m.clear()
    if (angle > 0) {
      m.moveTo(0, 0)
      m.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + angle)
      m.lineTo(0, 0)
      m.fill({ color: 0xffffff })
    }
  }

  private tryDeliverDrink(idx: number): void {
    if (!this.drinks[idx].visible) return
    if (!this.onDrinkTap?.(idx)) return
    this.drinks[idx].visible = false
    this.drinkCooldown[idx] = config.drink.cooldown
    this.drinkTimers[idx].visible = true
    this.updateDrinkTimer(idx)
  }

  private tryDeliverPita(assembly: PitaAssembly): void {
    if (!assembly.hasPita()) return
    this.onPitaPress?.()
    if (this.onPitaTap?.(assembly)) {
      assembly.reset()
    }
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

    // Each cooldown clock anchors at the centre of its drink's slot so the
    // timer drops in exactly where the cup was.
    for (let i = 0; i < this.drinkTimers.length; i++) {
      const j = map.juice[i]
      this.drinkTimers[i].position.set(j.x + j.w / 2, j.y + j.h / 2)
    }

    // Each pita assembly sits at its plate's PSD canvas origin (top-left of
    // the 200×200 reference frame in src/pita/*.psd) and uses the canonical
    // pita scale; layers within use raw PSD coords.
    for (let i = 0; i < this.pitas.length; i++) {
      const plate = map.plates[i]
      this.pitas[i].position.set(plate.x + PITA_ORIGIN_DX, plate.y + PITA_ORIGIN_DY)
    }

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

  // Called from MeatSpit.onSliceTap. Each successful tap places one portion in
  // the bowl IMMEDIATELY so the player sees and can spend it without waiting
  // for the slice animation. The knife/cut animation kicks off only when the
  // previous one has finished — extra taps stack portions silently.
  private requestSlice(): void {
    if (this.nextSlotIdx >= this.meatStack.length) return
    this.meatStack[this.nextSlotIdx].visible = true
    this.nextSlotIdx += 1
    this.onMeatPlaced?.()
    if (this.cookState === 'idle') {
      this.cookState = 'slicing'
      this.sliceT = 0
      this.cutSwapped = false
      // Cut overlay starts small at the top of the slice; swapped to large
      // mid-way through (see runCooking). Spine alpha fades out post-slice.
      this.spit.playCut(config.cooking.cutSkinSmall)
      this.onSliceStart?.()
    }
  }

  private runCooking(dt: number): void {
    if (this.cookState !== 'slicing') return
    const c = config.cooking
    this.sliceT += dt
    const p = Math.min(this.sliceT / c.sliceDuration, 1)
    const saw = Math.sin(p * c.sawFreq * Math.PI * 2) * c.sawAmp
    this.knife.position.x = c.sliceX + saw
    this.knife.position.y = lerp(c.sliceY0, c.sliceY1, p)
    // Mid-slice: swap the cut overlay from the small piece to the large one,
    // keeping the spine alpha continuous so it just changes texture in place.
    if (!this.cutSwapped && p >= c.cutSwapRatio) {
      this.cutSwapped = true
      this.spit.swapCutSkin(c.cutSkinLarge)
    }
    if (p >= 1) {
      this.cookState = 'idle'
      this.knife.position.copyFrom(this.knifeRest)
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

function toppingsSubset(sub: ReadonlyArray<PitaTopping>, sup: ReadonlyArray<PitaTopping>): boolean {
  if (sub.length > sup.length) return false
  for (const v of sub) if (!sup.includes(v)) return false
  return true
}

// Bipartite max matching (Kuhn's algorithm). supply[i] can claim demand[j]
// iff supply[i].toppings ⊆ demand[j]. Inputs are tiny (≤3 supply, ≤9 demand).
function maxMatch(
  supply: ReadonlyArray<ReadonlyArray<PitaTopping>>,
  demand: ReadonlyArray<ReadonlyArray<PitaTopping>>,
): number {
  const matchD: number[] = new Array(demand.length).fill(-1)
  const tryAssign = (i: number, visited: boolean[]): boolean => {
    for (let j = 0; j < demand.length; j++) {
      if (visited[j]) continue
      if (!toppingsSubset(supply[i], demand[j])) continue
      visited[j] = true
      if (matchD[j] === -1 || tryAssign(matchD[j], visited)) {
        matchD[j] = i
        return true
      }
    }
    return false
  }
  let count = 0
  for (let i = 0; i < supply.length; i++) {
    if (tryAssign(i, new Array(demand.length).fill(false))) count++
  }
  return count
}

// Wires a single sprite as a tap source for an ingredient action.
function setupTapAdd(sprite: Sprite, fire: () => void): void {
  sprite.eventMode = 'static'
  sprite.cursor = 'pointer'
  sprite.on('pointerdown', fire)
}
