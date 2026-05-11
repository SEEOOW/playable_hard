// Tiny SFX/music wrapper around HTMLAudioElement. No Web Audio dependency —
// fine for a playable with ~7 short clips. Music loops as a single element;
// SFX clone the element on each play so rapid triggers overlap rather than
// cut each other off.
//
// In the single-file production build, MP3s are inlined as data: URLs via
// `assetServer`'s INLINED map — HTMLAudioElement does NOT go through fetch,
// so we have to set src directly to a data URL rather than relying on the
// fetch interceptor that handles Pixi/spine assets.

import { INLINED } from './inlinedAssets'

export type Sfx =
  | 'tap' | 'slice_meat' | 'fry' | 'ok' | 'coins_fly_old'
  | 'male_happy' | 'female_happy' | 'female_haha'
type Track = Sfx | 'music'

const FILE: Record<Track, string> = {
  music:         'music.mp3',
  tap:           'tap.mp3',
  slice_meat:    'slice_meat.mp3',
  fry:           'fry.mp3',
  ok:            'ok.mp3',
  coins_fly_old: 'coins_fly_old.mp3',
  male_happy:    'male_happy.mp3',
  female_happy:  'female_happy.mp3',
  female_haha:   'female_haha.mp3',
}

const SFX_VOLUME = 0.7
const MUSIC_VOLUME = 0.35

export class AudioManager {
  private readonly elements: Record<Track, HTMLAudioElement>
  private readonly music: HTMLAudioElement
  private unlocked = false
  private muted = false

  constructor() {
    const base = import.meta.env.BASE_URL + 'sounds/'
    const make = (file: string): HTMLAudioElement => {
      const inlined = INLINED['sounds/' + file]
      const src = inlined
        ? `data:${inlined.mime};base64,${inlined.b64}`
        : base + file
      const el = new Audio(src)
      el.preload = 'auto'
      return el
    }
    this.elements = {
      music:         make(FILE.music),
      tap:           make(FILE.tap),
      slice_meat:    make(FILE.slice_meat),
      fry:           make(FILE.fry),
      ok:            make(FILE.ok),
      coins_fly_old: make(FILE.coins_fly_old),
      male_happy:    make(FILE.male_happy),
      female_happy:  make(FILE.female_happy),
      female_haha:   make(FILE.female_haha),
    }
    this.music = this.elements.music
    this.music.loop = true
    this.music.volume = MUSIC_VOLUME
    // Lower master volume for one-shots so they sit nicely under the music.
    for (const name of Object.keys(this.elements) as Track[]) {
      if (name !== 'music') this.elements[name].volume = SFX_VOLUME
    }
  }

  // Called from the first user pointerdown to satisfy autoplay policy and
  // kick off the music loop. Safe to call multiple times.
  unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    if (!this.muted) this.music.play().catch(() => { /* still locked → ignore */ })
  }

  play(name: Sfx): void {
    if (this.muted) return
    if (!this.unlocked) return
    const src = this.elements[name]
    // Clone so overlapping plays don't restart-cut each other; underlying
    // media buffer is shared by the browser, so this is cheap.
    const clone = src.cloneNode() as HTMLAudioElement
    clone.volume = src.volume
    clone.play().catch(() => { /* mid-flight cancel etc. — ignore */ })
  }

  setMuted(flag: boolean): void {
    if (this.muted === flag) return
    this.muted = flag
    if (flag) this.music.pause()
    else if (this.unlocked) this.music.play().catch(() => {})
  }
}
