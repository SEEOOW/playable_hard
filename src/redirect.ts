const STORE_URL = 'https://example.com'

export function openStore(): void {
  // TODO: prefer network SDK install() if injected (IronSource/Mintegral/Vungle/...)
  window.open(STORE_URL, '_blank')
}
