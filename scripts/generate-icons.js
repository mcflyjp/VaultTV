/**
 * generate-icons.js
 * Renders public/logo.svg into all required icon assets.
 *
 * Usage: node scripts/generate-icons.js
 *
 * Outputs:
 *   public/logo.png          (512x512 — web og/share)
 *   public/logo-256.png      (256x256 — web)
 *   public/icon.png          (256x256 — electron-builder win/mac/linux)
 *   public/logo.ico          (multi-size: 16,32,48,64,128,256)
 *   android-app/app/src/main/res/mipmap-mdpi/ic_launcher.png     (48x48)
 *   android-app/app/src/main/res/mipmap-hdpi/ic_launcher.png     (72x72)
 *   android-app/app/src/main/res/mipmap-xhdpi/ic_launcher.png    (96x96)
 *   android-app/app/src/main/res/mipmap-xxhdpi/ic_launcher.png   (144x144)
 *   android-app/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png  (192x192)
 *   android-app/app/src/main/res/mipmap-{density}/ic_launcher_round.png  (same sizes, rounded)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SVG_PATH = resolve(ROOT, 'public/logo.svg')

const svgBuffer = readFileSync(SVG_PATH)

async function render(size, outputPath, rounded = false) {
  mkdirSync(dirname(outputPath), { recursive: true })
  let pipeline = sharp(svgBuffer).resize(size, size)
  if (rounded) {
    const mask = Buffer.from(
      `<svg><rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" ry="${Math.round(size * 0.22)}"/></svg>`
    )
    pipeline = pipeline.composite([{ input: mask, blend: 'dest-in' }])
  }
  await pipeline.png().toFile(outputPath)
  console.log(`  ✓ ${outputPath.replace(ROOT, '.')} (${size}px${rounded ? ' rounded' : ''})`)
}

async function main() {
  console.log('Generating VaultTV icons from public/logo.svg...\n')

  // Web
  await render(512, resolve(ROOT, 'public/logo.png'))
  await render(256, resolve(ROOT, 'public/logo-256.png'))
  await render(256, resolve(ROOT, 'public/icon.png'))

  // ICO (multi-size)
  const icoSizes = [16, 32, 48, 64, 128, 256]
  const icoPngs = await Promise.all(
    icoSizes.map(size => sharp(svgBuffer).resize(size, size).png().toBuffer())
  )
  const icoBuffer = await pngToIco(icoPngs)
  writeFileSync(resolve(ROOT, 'public/logo.ico'), icoBuffer)
  console.log('  ✓ ./public/logo.ico (16,32,48,64,128,256px)')

  // Android APK mipmaps
  const mipmaps = [
    { density: 'mdpi',    size: 48  },
    { density: 'hdpi',    size: 72  },
    { density: 'xhdpi',   size: 96  },
    { density: 'xxhdpi',  size: 144 },
    { density: 'xxxhdpi', size: 192 },
  ]
  for (const { density, size } of mipmaps) {
    const base = resolve(ROOT, `android-app/app/src/main/res/mipmap-${density}`)
    await render(size, resolve(base, 'ic_launcher.png'))
    await render(size, resolve(base, 'ic_launcher_round.png'), true)
  }

  console.log('\nDone. Rebuild the APK and installer to pick up the new icons.')
}

main().catch(err => { console.error(err); process.exit(1) })
