import { Container, Point } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { Order } from './Order'
import type { RecipeId } from '../recipes'
import { makeSpine, type SpineName } from '../assets'
import { config } from '../config'

export type ClientState = 'walkingIn' | 'waiting' | 'leaving'

export class Client extends Container {
  readonly order: Order
  state: ClientState = 'walkingIn'
  patienceLeft = config.client.patience

  private spine: Spine
  private walkT: number | null = null
  private walkDur = 0
  private walkStart = new Point()
  private walkTarget = new Point()
  private onArrivedCb: (() => void) | null = null

  constructor(order: Order, spineName: SpineName) {
    super()
    this.order = order
    this.spine = makeSpine(spineName)
    this.spine.eventMode = 'none'

    // Offset spine inside Client so Client.position.y represents the bbox
    // TOP edge of the character. Different skeletons have their root at
    // different heights (e.g. old_grambler's root is ~23% above the floor),
    // so we use skeleton-data's own bbox: top edge in spine-local y-up is
    // (data.y + data.height); rendering flips Y, and the parent Client.scale
    // propagates to this offset, so we set it in raw spine units.
    const d = this.spine.skeleton.data
    this.spine.position.y = d.y + d.height

    this.addChild(this.spine)
    // No dedicated walk animation in the asset — idle from the start.
    this.spine.state.setAnimation(0, 'idle', true)
  }

  walkIn(target: Point, onArrived: () => void): void {
    this.state = 'walkingIn'
    this.walkStart.copyFrom(this.position)
    this.walkTarget.copyFrom(target)
    this.walkT = 0
    this.walkDur = config.client.walkInDuration
    this.onArrivedCb = onArrived
  }

  receive(recipe: RecipeId): boolean {
    return this.order.tryDeliver(recipe)
  }

  walkOut(target: Point, onDone: () => void): void {
    this.state = 'leaving'
    this.walkStart.copyFrom(this.position)
    this.walkTarget.copyFrom(target)
    this.walkT = 0
    this.walkDur = config.client.walkOutDuration
    this.onArrivedCb = onDone
  }

  update(dt: number): void {
    if (this.walkT != null) {
      this.walkT += dt
      const p = Math.min(this.walkT / this.walkDur, 1)
      const eased = 1 - (1 - p) * (1 - p)
      this.position.x = lerp(this.walkStart.x, this.walkTarget.x, eased)
      this.position.y = lerp(this.walkStart.y, this.walkTarget.y, eased)
      if (p >= 1) {
        this.walkT = null
        // Only walk-in transitions to waiting; walk-out keeps state 'leaving'.
        if (this.state === 'walkingIn') this.state = 'waiting'
        const cb = this.onArrivedCb
        this.onArrivedCb = null
        cb?.()
      }
    }
    if (this.state !== 'waiting') return
    this.patienceLeft -= dt
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
