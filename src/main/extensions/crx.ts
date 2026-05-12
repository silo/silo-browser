import { net } from 'electron'
import { existsSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'

/**
 * Download a `.crx` archive from a URL and unpack it into a fresh staging
 * directory under the OS temp dir. Returns the absolute path of the dir
 * containing the extension's `manifest.json`.
 *
 * Callers are responsible for either moving the directory to its final home
 * or deleting it on failure.
 *
 * Supports CRX2, CRX3, and bare ZIP payloads (some mirrors serve them).
 */
export async function downloadAndUnpackCrx(url: string): Promise<string> {
  const crxBuffer = await fetchAsBuffer(url)
  const zipBuffer = stripCrxHeader(crxBuffer)
  const stagingDir = join(tmpdir(), `silo-extension-${randomUUID()}`)
  await mkdir(stagingDir, { recursive: true })

  try {
    new AdmZip(zipBuffer).extractAllTo(stagingDir, true)
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    throw new Error(
      `Failed to unpack extension archive: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!existsSync(join(stagingDir, 'manifest.json'))) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    throw new Error('Archive did not contain manifest.json at the root')
  }

  return stagingDir
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const response = await net.fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

// CRX files are a magic header (`Cr24`) followed by version-specific metadata
// followed by a standard ZIP. We just need the ZIP bytes.
function stripCrxHeader(crx: Buffer): Buffer {
  if (crx.toString('utf8', 0, 4) !== 'Cr24') return crx

  const version = crx.readUInt32LE(4)
  if (version === 2) {
    const publicKeyLength = crx.readUInt32LE(8)
    const signatureLength = crx.readUInt32LE(12)
    return crx.subarray(16 + publicKeyLength + signatureLength)
  }
  // CRX3: 32-bit header length, then protobuf header, then ZIP.
  const headerSize = crx.readUInt32LE(8)
  return crx.subarray(12 + headerSize)
}
