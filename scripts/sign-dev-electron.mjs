// Signs node_modules/electron/dist/Electron.app with your local code-signing
// identity so macOS notifications work in `pnpm dev`.
//
// Since Electron 42, macOS notifications use the UNNotification API, which
// refuses notifications from ad-hoc signed apps (the npm Electron.app is ad-hoc
// signed). Release builds are signed in CI and don't need this.
// Re-run after every Electron update.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.platform !== 'darwin') {
  console.log('Not macOS, nothing to sign.')
  process.exit(0)
}

const app = 'node_modules/electron/dist/Electron.app'
if (!existsSync(app)) {
  console.error(`${app} not found. Run pnpm install first.`)
  process.exit(1)
}

// Sign by SHA-1 hash: codesign can fail to match identity names with non-ASCII characters
const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
  encoding: 'utf8'
})
const match = identities.match(/^\s*\d+\)\s+([0-9A-F]{40})\s+"(.+)"$/m)
if (!match) {
  console.error('No code-signing identity found in your keychain.')
  process.exit(1)
}
const [, hash, name] = match

execFileSync('codesign', ['--force', '--deep', '--sign', hash, app], { stdio: 'inherit' })
console.log(`Signed ${app} with "${name}".`)
