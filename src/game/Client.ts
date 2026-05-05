import { Container, Point } from 'pixi.js'
import { Order } from './Order'
import type { RecipeId } from '../recipes'
import { config } from '../config'

export type ClientState = 'walkingIn' | 'waiting' | 'leaving'

export class Client extends Container {
  readonly order: Order
  state: ClientState = 'walkingIn'
  patienceLeft = config.client.patience

  constructor(order: Order) {
    super()
    this.order = order
    // TODO: build client sprite + order bubble
  }

  walkIn(target: Point, onArrived: () => void): void {
    // TODO: tween to target over config.client.walkInDuration
    this.position.set(target.x, target.y)
    this.state = 'waiting'
    onArrived()
  }

  receive(recipe: RecipeId): boolean {
    const ok = this.order.tryDeliver(recipe)
    // TODO: bubble check-mark animation on delivered item
    return ok
  }

  walkOut(target: Point, onDone: () => void): void {
    this.state = 'leaving'
    // TODO: tween to target over config.client.walkOutDuration
    onDone()
  }

  update(dt: number): void {
    if (this.state !== 'waiting') return
    this.patienceLeft -= dt
    // TODO: visualize remaining patience
  }
}
