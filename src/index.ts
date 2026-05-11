// Publish the inlined-assets map for the fetch interceptor installed in
// index.html (see assetServer.ts). The interceptor is inlined in <head>
// so it runs before Pixi captures globalThis.fetch; this module just
// supplies the data table it reads from.
import './assetServer'

import { App } from './App'

const canvas = document.getElementById('game') as HTMLCanvasElement
const app = new App(canvas)
app.start()
