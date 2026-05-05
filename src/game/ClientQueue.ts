import { Container, Point } from 'pixi.js'
import { Client } from './Client'
import { Order } from './Order'
import type { RecipeId } from '../recipes'
import { layout, DESIGN_W } from '../layout'
import type { SpineName } from '../assets'

// Full character pool. The first three fill the slots at scene start; the
// remaining ones wait off-screen and rotate in as on-screen clients leave.
const POOL: SpineName[] = ['italian_man', 'pretty_woman', 'old_grambler', 'old_stylish_woman']

export class ClientQueue extends Container {
  onClientReady: ((c: Client) => void) | null = null
  onClientLeft:  ((c: Client, satisfied: boolean) => void) | null = null
  onAllDone:     (() => void) | null = null

  // External top-most container (sibling in worldRoot) that parents the
  // bubbles so they render above table/kitchen.
  bubblesLayer: Container | null = null

  private clients: Client[] = []
  private slots: Point[] = []

  start(_plan: RecipeId[][], slots: Point[]): void {
    this.slots = slots
    for (let i = 0; i < slots.length && i < POOL.length; i++) {
      this.spawnAt(i, POOL[i])
    }
  }

  // Sends the first waiting client off-screen right. A replacement walks in
  // IN PARALLEL — the slot doesn't sit empty for the full walk-out duration.
  dismissNext(): boolean {
    const client = this.clients.find((c) => c.state === 'waiting')
    if (!client) return false
    const slotIdx = client.slotIdx
    const target = new Point(DESIGN_W + 200, client.position.y)
    // Push the leaver to the BOTTOM of the queue's child stack so they walk
    // out behind any clients still standing in their slots.
    this.setChildIndex(client, 0)

    // Spawn the replacement now so walk-in overlaps walk-out. If the pool is
    // temporarily exhausted (multiple fast dismissals stacking), the recovery
    // pass in the walk-out callback catches up after each leaver is removed.
    this.fillSlot(slotIdx, client.spineName)

    client.walkOut(target, () => {
      this.removeChild(client)
      this.bubblesLayer?.removeChild(client.bubble)
      const idx = this.clients.indexOf(client)
      if (idx >= 0) this.clients.splice(idx, 1)
      this.onClientLeft?.(client, false)
      // Catch any slot whose replenishment was skipped earlier (pool empty).
      for (let i = 0; i < this.slots.length; i++) {
        if (!this.clients.some((c) => c.slotIdx === i)) {
          this.fillSlot(i, client.spineName)
        }
      }
    })
    return true
  }

  findMatching(recipe: RecipeId): Client | null {
    for (const c of this.clients) {
      if (c.state !== 'waiting') continue
      const item = c.order.items.find((i) => !i.delivered && i.recipe === recipe)
      if (item) return c
    }
    return null
  }

  activeRecipes(): RecipeId[] {
    const set = new Set<RecipeId>()
    for (const c of this.clients) {
      if (c.state !== 'waiting') continue
      for (const item of c.order.items) {
        if (!item.delivered) set.add(item.recipe)
      }
    }
    return [...set]
  }

  update(dt: number): void {
    for (const c of this.clients) c.update(dt)
  }

  layout(slots: Point[]): void {
    this.slots = slots
    // TODO: reposition active clients on resize/layout change
  }

  // Picks any pool character not currently on screen (and not the just-departed
  // one, if specified) and walks it into the given slot from off-screen left.
  private fillSlot(slotIdx: number, exclude?: SpineName): void {
    const taken = new Set(this.clients.map((c) => c.spineName))
    if (exclude) taken.add(exclude)
    const candidate = POOL.find((n) => !taken.has(n))
    if (!candidate) return
    this.spawnAt(slotIdx, candidate)
  }

  private spawnAt(slotIdx: number, name: SpineName): void {
    const slot = this.slots[slotIdx]
    if (!slot) return
    const order = new Order(['shawarma']) // dummy — order/bubble logic comes later
    const client = new Client(order, name)
    client.slotIdx = slotIdx
    client.scale.set(layout.clientScale)
    client.position.set(-200, slot.y)
    // Add to the BOTTOM of the queue's child stack so the walking-in client
    // is drawn behind already-standing ones and doesn't overlap them mid-walk.
    this.addChildAt(client, 0)
    this.clients.push(client)
    // Bubble lives in a top-most sibling layer so it renders above table/kitchen.
    // Scale comes from layout.bubble (independent of clientScale).
    if (this.bubblesLayer) {
      client.bubble.scale.set(layout.bubble.scale.x, layout.bubble.scale.y)
      this.bubblesLayer.addChild(client.bubble)
    }
    client.walkIn(slot, () => { /* no-op for now */ })
  }
}
