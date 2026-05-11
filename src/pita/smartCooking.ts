import type { PitaTopping } from './recipes'

// Smart Cooking — the rule that the player can only build pitas that match
// some active order. The check is a bipartite max-matching from in-progress
// assemblies (supply) to undelivered pita slots in waiting clients (demand);
// an assembly may claim a demand iff its toppings are a subset of that
// demand's toppings. A perfect matching (every supply assigned) means every
// pita on the plates can still finish into a wanted order.
//
// Inputs are tiny — at most 3 supply (one per plate) and ~9 demand (3
// clients × max 3 slots) — so Kuhn's algorithm runs in microseconds.

export function canCoverDemand(
  supply: ReadonlyArray<ReadonlyArray<PitaTopping>>,
  demand: ReadonlyArray<ReadonlyArray<PitaTopping>>,
): boolean {
  if (supply.length === 0) return true
  if (demand.length < supply.length) return false
  return maxMatch(supply, demand) === supply.length
}

function toppingsSubset(sub: ReadonlyArray<PitaTopping>, sup: ReadonlyArray<PitaTopping>): boolean {
  if (sub.length > sup.length) return false
  for (const v of sub) if (!sup.includes(v)) return false
  return true
}

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
