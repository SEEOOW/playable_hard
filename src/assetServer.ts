// Bridge to the inline-script fetch interceptor declared in index.html.
// Importing this module publishes the inlined-assets map to window.__INLINED
// so the interceptor (which is installed BEFORE the bundle parses) can look
// up assets when Pixi/spine-pixi fire fetch() requests.
//
// The dual setup (inline interceptor + module-published data) exists because
// Pixi's DOMAdapter captures globalThis.fetch at its own module-init time.
// If we tried to swap fetch from a module, Pixi would already hold the
// pre-swap reference and our handler would never run.
import { INLINED } from './inlinedAssets'

;(window as unknown as { __INLINED: typeof INLINED }).__INLINED = INLINED
