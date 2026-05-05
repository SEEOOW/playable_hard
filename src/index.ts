import { App } from './App'

const canvas = document.getElementById('game') as HTMLCanvasElement
const app = new App(canvas)
app.start()
