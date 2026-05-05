// Dev-only cheat registry. Hotkeys fire registered actions; press C to toggle
// a small panel listing all known cheats. Lives outside Pixi as a DOM overlay.

export type CheatEntry = {
  key: string        // single character, case-insensitive
  label: string
  action: () => void
}

const TOGGLE_KEY = 'c'

export class Cheats {
  private entries: CheatEntry[] = []
  private panel: HTMLDivElement | null = null
  private visible = false

  constructor() {
    window.addEventListener('keydown', this.onKey)
  }

  register(entry: CheatEntry): void {
    this.entries.push(entry)
    if (this.visible) this.refresh()
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey)
    this.hide()
  }

  private onKey = (e: KeyboardEvent): void => {
    // Ignore when user types in inputs or holds modifier keys.
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    const key = e.key.toLowerCase()
    if (key === TOGGLE_KEY) {
      this.toggle()
      return
    }
    const entry = this.entries.find((x) => x.key.toLowerCase() === key)
    if (entry) entry.action()
  }

  private toggle(): void {
    if (this.visible) this.hide()
    else this.show()
  }

  private show(): void {
    if (!this.panel) this.panel = this.create()
    document.body.appendChild(this.panel)
    this.visible = true
    this.refresh()
  }

  private hide(): void {
    if (this.panel?.parentElement) this.panel.parentElement.removeChild(this.panel)
    this.visible = false
  }

  private create(): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px',
      'background:rgba(20,20,20,.92)', 'color:#fff',
      'font:13px/1.4 monospace', 'padding:12px 16px',
      'border-radius:6px', 'z-index:9999',
      'min-width:240px', 'pointer-events:auto',
      'box-shadow:0 4px 16px rgba(0,0,0,.4)',
    ].join(';')
    return el
  }

  private refresh(): void {
    if (!this.panel) return
    const rows = this.entries
      .map((e) => `<div><b style="color:#fc0">${e.key.toUpperCase()}</b> — ${escape(e.label)}</div>`)
      .join('')
    this.panel.innerHTML =
      `<div style="font-weight:bold;color:#fc0;margin-bottom:8px">CHEATS</div>` +
      (rows || `<div style="color:#888">— пусто —</div>`) +
      `<div style="margin-top:10px;color:#888;font-size:11px">${TOGGLE_KEY.toUpperCase()} — скрыть</div>`
  }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
