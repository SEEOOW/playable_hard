import { Container, Point } from 'pixi.js'
import { Client } from './Client'
import { Order } from './Order'
import type { RecipeId } from '../recipes'
import { layout, DESIGN_W } from '../layout'
import type { SpineName } from '../assets'

// Three character spines, one per slot. Order = slot 0, 1, 2 (left → right).
const CLIENT_SPINES: SpineName[] = ['italian_man', 'pretty_woman', 'old_grambler']

export class ClientQueue extends Container {
  onClientReady: ((c: Client) => void) | null = null
  onClientLeft:  ((c: Client, satisfied: boolean) => void) | null = null
  onAllDone:     (() => void) | null = null

  private clients: Client[] = []
  private slots: Point[] = []

  start(_plan: RecipeId[][], slots: Point[]): void {
    this.slots = slots

    // Spawn three clients simultaneously off-screen left; each tween-walks
    // to its slot. Idle spine animation runs throughout (no walk anim shipped).
    const spawnX = -200
    for (let i = 0; i < CLIENT_SPINES.length && i < slots.length; i++) {
      const order = new Order(['shawarma']) // dummy — order/bubble logic comes later
      const client = new Client(order, CLIENT_SPINES[i])
      client.scale.set(layout.clientScale)
      client.position.set(spawnX, slots[i].y)
      this.addChild(client)
      this.clients.push(client)
      client.walkIn(slots[i], () => { /* no-op for now */ })
    }
  }

  // Sends the first waiting client off-screen right. Returns true if a
  // client was dismissed. Used by the dev cheat (key G).
  dismissNext(): boolean {
    const client = this.clients.find((c) => c.state === 'waiting')
    if (!client) return false
    const target = new Point(DESIGN_W + 200, client.position.y)
    client.walkOut(target, () => {
      this.removeChild(client)
      const idx = this.clients.indexOf(client)
      if (idx >= 0) this.clients.splice(idx, 1)
      this.onClientLeft?.(client, false)
      if (this.clients.length === 0) this.onAllDone?.()
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
}
