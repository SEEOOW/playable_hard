import { Container, Point, Sprite } from 'pixi.js'
import { tex } from '../assets'
import { layout } from '../layout'
import type { CoinsHud } from '../ui/CoinsHud'
import type { AudioManager } from '../AudioManager'

const FLY_DURATION = 0.55

type FlyingCoin = {
  sprite: Sprite
  start: Point
  end: Point
  t: number
  reward: number
}

// Owns the over-everything coin-fly FX. Each delivered order position spawns
// a coin sprite at the bubble's world position; the coin eases toward the
// HUD coin icon and on arrival increments the counter (CoinsHud.add).
// Sized to match the HUD coin pixel-for-pixel — set once at spawn, never
// touched during flight, so it never scales mid-trajectory.
export class FlyingCoinFx {
  private flying: FlyingCoin[] = []
  private coverScale = 1

  constructor(
    private layerHost: Container,
    private coins: CoinsHud,
    private audio: AudioManager,
  ) {}

  setCoverScale(scale: number): void {
    this.coverScale = scale
  }

  spawn(start: Point, reward: number): void {
    this.audio.play('coins_fly_old')
    const coin = new Sprite(tex('coin'))
    coin.anchor.set(0.5, 0.5)
    const hud = layout.ui.coinHud
    coin.width  = hud.w * this.coverScale
    coin.height = hud.h * this.coverScale
    coin.position.set(start.x, start.y)
    this.layerHost.addChild(coin)
    const end = this.coins.iconGlobalPos()
    this.flying.push({ sprite: coin, start: new Point(start.x, start.y), end, t: 0, reward })
  }

  update(dt: number): void {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const fc = this.flying[i]
      fc.t += dt
      const p = Math.min(fc.t / FLY_DURATION, 1)
      // Ease-in: coin lingers a beat near the bubble then accelerates to HUD.
      const eased = p * p
      fc.sprite.position.set(
        fc.start.x + (fc.end.x - fc.start.x) * eased,
        fc.start.y + (fc.end.y - fc.start.y) * eased,
      )
      if (p >= 1) {
        this.layerHost.removeChild(fc.sprite)
        fc.sprite.destroy()
        this.flying.splice(i, 1)
        this.coins.add(fc.reward, fc.end)
      }
    }
  }
}
