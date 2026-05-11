import { Container } from 'pixi.js'
import type { ClientQueue } from './ClientQueue'
import type { Client } from './Client'
import type { Kitchen } from './Kitchen'
import type { PitaTopping } from '../pita/recipes'

// Decides what the hand-hint should point at next. Given the live game
// state (waiting clients + kitchen) the planner returns one of:
//   • a topping/meat station the player should tap next,
//   • a pita assembly that's ready to deliver,
//   • the basket if no pita is on the path,
//   • null when no actionable step exists (e.g. all drinks on cooldown).
//
// Pure read-only: doesn't mutate game state. Per-frame safe — Hint.pointAt
// is idempotent on the same target, so re-running this from the update
// loop only resets the idle countdown when the next valid step changes.
export function planHintTarget(queue: ClientQueue, kitchen: Kitchen): Container | null {
  const waiting = queue.waitingClients()
  if (waiting.length === 0) return null
  // Priority: most-progressed order first (closest to completion). Tiebreak
  // by lowest patience so the most urgent client gets coached. Falls
  // through to the next client if their order has no actionable step
  // (e.g. only drink left and every drink is on cooldown).
  const sorted = [...waiting].sort((a, b) => {
    const ad = a.deliveredCount(); const bd = b.deliveredCount()
    if (ad !== bd) return bd - ad
    return a.patienceLeft - b.patienceLeft
  })
  for (const client of sorted) {
    const target = planFor(client, kitchen)
    if (target) return target
  }
  return null
}

function planFor(client: Client, kitchen: Kitchen): Container | null {
  for (const item of client.pendingItems()) {
    const t = planForItem(item, kitchen)
    if (t) return t
  }
  return null
}

function planForItem(
  item: { kind: 'drink' } | { kind: 'pita'; toppings: ReadonlyArray<PitaTopping> },
  kitchen: Kitchen,
): Container | null {
  if (item.kind === 'drink') return kitchen.drinkTarget()

  const target = item.toppings
  const pitas = kitchen.pitaAssemblies()

  // 1. Already-ready assembly that exactly matches → tap to deliver.
  for (const p of pitas) {
    if (!p.hasPita() || !p.hasMeat()) continue
    if (sameToppings(p.toppings(), target)) return p
  }

  // 2. On-path assembly — toppings ⊆ target, prefer the most-progressed
  //    so we keep finishing what's already started rather than restarting.
  let best: ReturnType<Kitchen['pitaAssemblies']>[number] | null = null
  let bestScore = -1
  for (const p of pitas) {
    if (!p.hasPita()) continue
    const t = p.toppings()
    if (!isSubset(t, target)) continue
    const score = t.length * 2 + (p.hasMeat() ? 1 : 0)
    if (score > bestScore) { best = p; bestScore = score }
  }
  if (best) {
    // Meat-first rule: toppings can't be added until meat is on the pita.
    if (!best.hasMeat()) {
      return kitchen.hasMeatInBowl() ? kitchen.meatTarget() : kitchen.spitTarget()
    }
    // Find the first missing topping the kitchen actually has a station for.
    const have = new Set(best.toppings())
    for (const t of target) {
      if (have.has(t)) continue
      const ts = kitchen.ingredientTarget(t)
      if (ts) return ts
    }
    // Fully-built and matching — should have been caught in (1); defensive.
    return best
  }

  // 3. No assembly is on-path — start fresh. Smart Cooking will allow the
  //    placement because there's at least one demand slot for this target.
  if (kitchen.hasUnplacedPlate()) return kitchen.basketTarget()
  return null
}

function sameToppings(a: ReadonlyArray<PitaTopping>, b: ReadonlyArray<PitaTopping>): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  for (const t of a) if (!setB.has(t)) return false
  return true
}

function isSubset(sub: ReadonlyArray<PitaTopping>, sup: ReadonlyArray<PitaTopping>): boolean {
  if (sub.length > sup.length) return false
  const setSup = new Set(sup)
  for (const t of sub) if (!setSup.has(t)) return false
  return true
}
