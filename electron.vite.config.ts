import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      sourcemap: false,
      externalizeDeps: {
        exclude: ['electron-updater']
      }
    }
  },
  preload: {
    build: {
      sourcemap: false
    }
  },
  renderer: {
    build: {
      sourcemap: false
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue(), tailwindcss()]
  }
})
