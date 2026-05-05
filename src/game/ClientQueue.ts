import { Container, Point } from 'pixi.js'
import { Client } from './Client'
import type { RecipeId } from '../recipes'

export class ClientQueue extends Container {
  onClientReady: ((c: Client) => void) | null = null
  onClientLeft:  ((c: Client, satisfied: boolean) => void) | null = null
  onAllDone:     (() => void) | null = null

  private clients: Client[] = []
  private slots: Point[] = []
  private plan: RecipeId[][] = []
  private nextOrderIndex = 0
  private spawnTimer = 0

  start(plan: RecipeId[][], slots: Point[]): void {
    this.plan = plan
    this.slots = slots
    this.nextOrderIndex = 0
    this.spawnTimer = 0
    // TODO: spawn first client immediately
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
    // TODO: spawn timer; per-client update; check completion → walkOut → remove → onClientLeft;
    //       when nextOrderIndex >= plan.length and clients empty → onAllDone
  }

  layout(slots: Point[]): void {
    this.slots = slots
    // TODO: reposition active clients to their slots
  }
}
