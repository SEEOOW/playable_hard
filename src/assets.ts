import { Assets, Texture } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { INLINED } from './inlinedAssets'

export type AssetName =
  // background (PSD: Layer 0 + table smartobject)
  | 'back' | 'table'
  // kitchen decor / interactives
  | 'grill' | 'knife' | 'bowl' | 'basket' | 'tortilla'
  | 'fries' | 'tomato' | 'cucumber' | 'drink'
  // dish (PSD: plate + meat stack on bowl)
  | 'plate' | 'meat1' | 'meat2'
  // pita assembly — textures rendered out of src/pita/*.psd reference layers.
  | 'pita_back' | 'pita_top' | 'pita_front'
  | 'pita_meat_a' | 'pita_meat_b'
  | 'pita_cucumber'
  | 'pita_fries_a' | 'pita_fries_b'
  | 'pita_tomato'
  // UI
  | 'coin' | 'sound_on' | 'bubble' | 'hand' | 'button_install' | 'check_mark' | 'new_avatar'
  | 'timer' | 'timer_progress'

const url = (path: string): string => import.meta.env.BASE_URL + path

const MANIFEST: Record<AssetName, string> = {
  back:           url('images/location/back.jpg'),
  table:          url('images/location/table.png'),
  grill:          url('images/location/grill.png'),
  knife:          url('images/location/knife.png'),
  bowl:           url('images/meat/bowl.png'),
  basket:         url('images/tortilla/basket.png'),
  tortilla:       url('images/tortilla/tortilla.png'),
  fries:          url('images/fry/potato2_ready3.png'),
  tomato:         url('images/tomato/tomato.png'),
  cucumber:       url('images/cucumbers/cucumber.png'),
  drink:          url('images/location/drink.png'),
  plate:          url('images/dish/plate.png'),
  meat1:          url('images/meat/meat1.png'),
  meat2:          url('images/meat/meat2.png'),
  pita_back:      url('images/pita/pita_back.png'),
  pita_top:       url('images/pita/pita_top.png'),
  pita_front:     url('images/pita/pita_front.png'),
  pita_meat_a:    url('images/pita/pita_meat_a.png'),
  pita_meat_b:    url('images/pita/pita_meat_b.png'),
  pita_cucumber:  url('images/pita/pita_cucumber.png'),
  pita_fries_a:   url('images/pita/pita_fries_a.png'),
  pita_fries_b:   url('images/pita/pita_fries_b.png'),
  pita_tomato:    url('images/pita/pita_tomato.png'),
  coin:           url('images/ui/coin.png'),
  sound_on:       url('images/ui/button_sound_on.png'),
  bubble:         url('images/ui/bubble.png'),
  hand:           url('images/ui/hand.png'),
  button_install: url('images/ui/button_install.png'),
  check_mark:     url('images/ui/check_mark.png'),
  new_avatar:     url('images/ui/new_avatar.png'),
  timer:          url('images/ui/timer.png'),
  timer_progress: url('images/ui/timer_progress.png'),
}

// Spine skeletons. Files live in `assets_shawarma/spine_v42/` — copies of the
// original Spine 4.1 assets with the version bumped to 4.2.0 so the only
// available Pixi-v8 spine runtime (4.2) accepts them. Originals remain
// untouched in `assets_shawarma/spine/`.
export type SpineName =
  | 'kebab_back' | 'kebab_front' | 'kebab_cut'
  | 'skewer_back' | 'skewer_front'
  | 'italian_man' | 'pretty_woman' | 'old_grambler' | 'old_stylish_woman'

const SPINE_MANIFEST: Record<SpineName, { json: string; atlas: string }> = {
  kebab_back:        { json: url('spine_v42/kebab_back.json'),        atlas: url('spine_v42/kebab_back.atlas') },
  kebab_front:       { json: url('spine_v42/kebab_front.json'),       atlas: url('spine_v42/kebab_front.atlas') },
  kebab_cut:         { json: url('spine_v42/kebab_cut.json'),         atlas: url('spine_v42/kebab_cut.atlas') },
  skewer_back:       { json: url('spine_v42/skewer_back.json'),       atlas: url('spine_v42/skewer_back.atlas') },
  skewer_front:      { json: url('spine_v42/skewer_front.json'),      atlas: url('spine_v42/skewer_front.atlas') },
  italian_man:       { json: url('spine_v42/italian_man.json'),       atlas: url('spine_v42/italian_man.atlas') },
  pretty_woman:      { json: url('spine_v42/pretty_woman.json'),      atlas: url('spine_v42/pretty_woman.atlas') },
  old_grambler:      { json: url('spine_v42/old_grambler.json'),      atlas: url('spine_v42/old_grambler.atlas') },
  old_stylish_woman: { json: url('spine_v42/old_stylish_woman.json'), atlas: url('spine_v42/old_stylish_woman.atlas') },
}

// Strip the './' base so we can match against INLINED keys (which are
// publicDir-relative, e.g. 'images/ui/coin.png').
function inlinedKey(path: string): string {
  return path.replace(/^\.?\//, '')
}

function toDataUrlIfInlined(path: string): string {
  const inlined = INLINED[inlinedKey(path)]
  return inlined ? `data:${inlined.mime};base64,${inlined.b64}` : path
}

export async function loadAssets(): Promise<void> {
  // Plain textures go straight to Pixi as data: URLs in production — Pixi's
  // texture pipeline doesn't always route through window.fetch, so swapping
  // src here is more reliable than the fetch interceptor for these.
  const texEntries = (Object.keys(MANIFEST) as AssetName[]).map((alias) => ({
    alias,
    src: toDataUrlIfInlined(MANIFEST[alias]),
  }))

  // Spine asset src stays as a plain path with its real extension — the
  // spine-pixi-v8 loaders register themselves by extension (`.atlas`,
  // `.skel`, `.json`), so swapping for a data: URL would make them skip
  // these files entirely. The .atlas + .json fetches go through window.fetch
  // and our interceptor serves them from INLINED.
  // Atlas pages, however, can't be served via fetch (Pixi's texture pipeline
  // uses Image directly for those, bypassing fetch). Instead we pass each
  // page as a data: URL through the loader's `data.images` map — atlas
  // parser consumes that and resolves pages via Pixi's normal loader, which
  // handles data: URLs natively for image content.
  const spinePageImages: Record<string, string> = {}
  for (const path in INLINED) {
    if (!path.startsWith('spine_v42/') || !path.endsWith('.png')) continue
    const basename = path.split('/').pop()!
    const asset = INLINED[path]
    spinePageImages[basename] = `data:${asset.mime};base64,${asset.b64}`
  }

  const spineEntries: Array<{ alias: string; src: string; data?: unknown }> = []
  for (const name of Object.keys(SPINE_MANIFEST) as SpineName[]) {
    const m = SPINE_MANIFEST[name]
    spineEntries.push({ alias: `${name}_skel`,  src: m.json })
    spineEntries.push({
      alias: `${name}_atlas`,
      src:  m.atlas,
      data: { images: spinePageImages },
    })
  }

  // Load each asset independently and swallow individual failures — a single
  // missing UI icon (e.g. a placeholder slot waiting for a real file) must
  // not black-screen the whole playable. Missing aliases fall back to
  // Texture.WHITE via tex().
  // Load each asset independently and swallow individual failures — a single
  // missing UI icon (e.g. a placeholder slot waiting for a real file) must
  // not black-screen the whole playable. Missing aliases fall back to
  // Texture.WHITE via tex().
  const all = [...texEntries, ...spineEntries]
  await Promise.all(
    all.map((entry) =>
      Assets.load(entry).catch((err) => {
        console.warn(`[assets] failed "${entry.alias}" (${entry.src}):`, err?.message ?? err)
      }),
    ),
  )
}

export function tex(name: AssetName): Texture {
  const t = Assets.get<Texture>(name)
  return t ?? Texture.WHITE
}

// Spine instance bound to the shared Pixi Ticker (default autoUpdate). Caller
// chooses the animation; without `state.setAnimation(...)` the skeleton stays
// in setup pose.
export function makeSpine(name: SpineName): Spine {
  return Spine.from({
    skeleton: `${name}_skel`,
    atlas:    `${name}_atlas`,
  })
}
