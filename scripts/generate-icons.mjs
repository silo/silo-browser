import sharp from 'sharp'
import { readFileSync, mkdirSync, rmSync, unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const squareSvg = readFileSync(join(root, 'silo-browser-logo-square.svg'))

// Generate PNG from SVG at a given size
async function generatePng(outputPath, size) {
  const density = Math.round((size / 128) * 72)
  await sharp(squareSvg, { density })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outputPath)
  console.log(`  ${outputPath} (${size}x${size})`)
}

// 1. build/icon.png — 1024x1024 (electron-builder uses this for .icns/.ico)
console.log('Generating app icons...')
await generatePng(join(root, 'build', 'icon.png'), 1024)

// 2. resources/icon.png — 512x512 (Linux window icon)
await generatePng(join(root, 'resources', 'icon.png'), 512)

// 3. macOS .icns via iconutil (macOS only)
if (process.platform === 'darwin') {
  console.log('Generating .icns...')
  const iconsetDir = join(root, 'build', 'icon.iconset')
  mkdirSync(iconsetDir, { recursive: true })

  const iconsetSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 }
  ]

  for (const { name, size } of iconsetSizes) {
    await generatePng(join(iconsetDir, name), size)
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${join(root, 'build', 'icon.icns')}"`)
  rmSync(iconsetDir, { recursive: true })
  console.log(`  build/icon.icns`)
} else {
  console.log('Skipping .icns generation (not macOS)')
}

// 4. Remove build/icon.ico — electron-builder auto-generates on Windows builds
const icoPath = join(root, 'build', 'icon.ico')
if (existsSync(icoPath)) {
  unlinkSync(icoPath)
  console.log('Removed build/icon.ico (electron-builder will auto-generate)')
}

console.log('Done.')
