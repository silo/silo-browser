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
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          webview: resolve('src/preload/webview.ts')
        },
        // Externalize the `electron` module — its runtime API is provided by
        // the Electron process and must not be bundled. With Vite 8 /
        // Rolldown defaults, bundling pulls in `electron/index.js` (the
        // binary path resolver) which crashes preload startup with
        // "Unable to find Electron app at out/preload/chunks/install.js".
        external: ['electron', /^node:/]
      }
    }
  },
  renderer: {
    server: {
      port: 7456
    },
    build: {
      sourcemap: false
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'webview' || tag === 'browser-action-list'
          }
        }
      }),
      tailwindcss()
    ]
  }
})
