const STORE_URL = 'https://apps.apple.com/us/app/royal-cooking/id1664415775'

export function openStore(): void {
  // TODO: prefer network SDK install() if injected (IronSource/Mintegral/Vungle/...)
  window.open(STORE_URL, '_blank')
}
