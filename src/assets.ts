import { Assets, Texture } from 'pixi.js'

export type AssetName =
  // background (PSD: Layer 0 + table smartobject)
  | 'back' | 'table' | 'stand_front'
  // kitchen decor / interactives
  | 'grill' | 'knife' | 'bowl' | 'basket' | 'tortilla'
  | 'fries' | 'tomato' | 'cucumber' | 'drink'
  // dish (PSD: pita_clean group + meat stack on bowl)
  | 'plate' | 'pita1' | 'pita2' | 'meat1' | 'meat2'
  // UI
  | 'coin' | 'sound_on' | 'bubble' | 'hand' | 'button_install'

const url = (path: string): string => import.meta.env.BASE_URL + path

const MANIFEST: Record<AssetName, string> = {
  back:           url('images/location/back.jpg'),
  table:          url('images/location/table.png'),
  stand_front:    url('images/location/stand_front.png'),
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
  pita1:          url('images/dish/pita1.png'),
  pita2:          url('images/dish/pita2.png'),
  meat1:          url('images/meat/meat1.png'),
  meat2:          url('images/meat/meat2.png'),
  coin:           url('images/ui/coin.png'),
  sound_on:       url('images/ui/button_sound_on.png'),
  bubble:         url('images/ui/bubble.png'),
  hand:           url('images/ui/hand.png'),
  button_install: url('images/ui/button_install.png'),
}

export async function loadAssets(): Promise<void> {
  const entries = (Object.keys(MANIFEST) as AssetName[]).map((alias) => ({
    alias,
    src: MANIFEST[alias],
  }))
  await Assets.load(entries)
}

export function tex(name: AssetName): Texture {
  const t = Assets.get<Texture>(name)
  return t ?? Texture.WHITE
}
