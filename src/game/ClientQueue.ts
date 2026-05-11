import { Container, Point } from 'pixi.js'
import { Client, type ItemDeliveredInfo } from './Client'
import { layout, DESIGN_W } from '../layout'
import type { SpineName } from '../assets'
import { generateOrder } from '../pita/orders'
import type { PitaTopping } from '../pita/recipes'

// Full character pool. The first three fill the slots at scene start; the
// remaining ones wait off-screen and rotate in as on-screen clients leave.
const POOL: SpineName[] = ['italian_man', 'pretty_woman', 'old_grambler', 'old_stylish_woman']

export class ClientQueue extends Container {
  onClientReady: ((c: Client) => void) | null = null
  onClientLeft:  ((c: Client, satisfied: boolean) => void) | null = null
  // Per-position delivery feedback — fires once per delivered slot when the
  // in-bubble reward animation completes; scene flies a coin from this point
  // to the HUD counter.
  onItemDelivered: ((info: ItemDeliveredInfo) => void) | null = null
  // Synchronous "the player just dropped a deliverable item on a matching
  // client" event — fires immediately on success (before reward animation),
  // so audio feedback isn't delayed by the 1.5 s reward sequence. `isLast`
  // is true when the just-delivered slot completed the client's order.
  onDeliveryAccepted: ((info: { isLast: boolean; spineName: SpineName }) => void) | null = null

  // Hard cap on the TOTAL number of clients spawned over the level — counts
  // every walk-in (on-screen, leaving, already-departed). Once reached, no
  // further spawns happen, regardless of the dismissal cause. null = no cap.
  clientsLimit: number | null = null
  private spawnedCount = 0

  // External top-most container (sibling in worldRoot) that parents the
  // bubbles so they render above table/kitchen.
  bubblesLayer: Container | null = null

  private clients: Client[] = []
  private slots: Point[] = []

  start(slots: Point[]): void {
    this.slots = slots
    for (let i = 0; i < slots.length && i < POOL.length; i++) {
      this.spawnAt(i, POOL[i])
    }
  }

  // Tap-on-pita delivery. Returns true if some waiting client's open pita slot
  // matches the assembly's toppings (set equality + meat present); marks that
  // slot delivered. The dismissal happens later via Client.onOrderComplete,
  // after the per-position reward animations finish.
  tryDeliverPita(toppings: ReadonlyArray<PitaTopping>, hasMeat: boolean): boolean {
    for (const c of this.clients) {
      if (c.state !== 'waiting') continue
      if (c.tryDeliverPita(toppings, hasMeat)) {
        this.onDeliveryAccepted?.({ isLast: c.isFullyDelivered(), spineName: c.spineName })
        return true
      }
    }
    return false
  }

  // Tap-on-drink delivery. Same shape as tryDeliverPita, but matches any
  // open drink slot regardless of contents.
  tryDeliverDrink(): boolean {
    for (const c of this.clients) {
      if (c.state !== 'waiting') continue
      if (c.tryDeliverDrink()) {
        this.onDeliveryAccepted?.({ isLast: c.isFullyDelivered(), spineName: c.spineName })
        return true
      }
    }
    return false
  }

  // Walk-out for a specific client, replenishing the slot in parallel so the
  // counter doesn't sit empty for the full walk-out duration. `satisfied`
  // distinguishes a paid order from a manual dev dismissal. The spawn budget
  // is enforced inside spawnAt itself, so fillSlot calls here become no-ops
  // once the cap is reached and no new clients arrive.
  private dismissClient(client: Client, satisfied: boolean): void {
    const slotIdx = client.slotIdx
    const target = new Point(DESIGN_W + 200, client.position.y)
    // Push the leaver to the BOTTOM of the queue's child stack so they walk
    // out behind any clients still standing in their slots.
    this.setChildIndex(client, 0)
    this.fillSlot(slotIdx, client.spineName)
    client.walkOut(target, () => {
      this.removeChild(client)
      this.bubblesLayer?.removeChild(client.bubble)
      const idx = this.clients.indexOf(client)
      if (idx >= 0) this.clients.splice(idx, 1)
      this.onClientLeft?.(client, satisfied)
      // Catch any slot whose replenishment was skipped earlier (pool empty).
      for (let i = 0; i < this.slots.length; i++) {
        if (!this.clients.some((c) => c.slotIdx === i)) {
          this.fillSlot(i, client.spineName)
        }
      }
    })
  }

  private canSpawn(): boolean {
    return this.clientsLimit === null || this.spawnedCount < this.clientsLimit
  }

  // Snapshot of all clients currently in the 'waiting' state — used by the
  // hint planner to pick the priority order to coach toward.
  waitingClients(): ReadonlyArray<Client> {
    return this.clients.filter((c) => c.state === 'waiting')
  }

  // Topping sets of every undelivered pita slot in waiting clients. Used by
  // Kitchen's Smart Cooking gate to validate ingredient additions.
  activeOrderToppings(): ReadonlyArray<ReadonlyArray<PitaTopping>> {
    const out: ReadonlyArray<PitaTopping>[] = []
    for (const c of this.clients) {
      if (c.state !== 'waiting') continue
      for (const t of c.openPitaToppings()) out.push(t)
    }
    return out
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
    // Single chokepoint for the level-wide spawn budget — start() and every
    // fillSlot() funnel through here, so one check covers all spawn paths.
    if (!this.canSpawn()) return
    const slot = this.slots[slotIdx]
    if (!slot) return
    this.spawnedCount += 1
    const client = new Client(name)
    client.setOrder(generateOrder())
    client.slotIdx = slotIdx
    client.scale.set(layout.clientScale)
    client.position.set(-200, slot.y)
    // Per-position reward feedback fires from the client; queue forwards it
    // to the scene's flying-coin FX. Order completion triggers the walk-out;
    // the satisfied count is tracked by the scene's HUD for the redirect.
    client.onItemDelivered = (info) => this.onItemDelivered?.(info)
    client.onOrderComplete = () => this.dismissClient(client, true)
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
