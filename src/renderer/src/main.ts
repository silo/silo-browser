// Fonts are bundled so the UI looks the same offline
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/jetbrains-mono'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
