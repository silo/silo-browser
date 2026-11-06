import type { GroupItem, SiloIcon } from '@renderer/types'

/** Built-in silo icons (24×24 stroke paths, drawn white on the silo color). */
export const SILO_ICONS: { id: string; name: string; path: string }[] = [
  { id: 'briefcase', name: 'Briefcase', path: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' },
  { id: 'home', name: 'Home', path: 'm3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V13h6v9' },
  {
    id: 'heart',
    name: 'Heart',
    path: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z'
  },
  { id: 'mountain', name: 'Mountain', path: 'm3 19 6.5-10 4 6 2.5-3.5L21 19z' },
  { id: 'code', name: 'Code', path: 'm8 7-5 5 5 5M16 7l5 5-5 5' },
  {
    id: 'star',
    name: 'Star',
    path: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'
  },
  {
    id: 'globe',
    name: 'Globe',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z'
  },
  {
    id: 'chat',
    name: 'Chat',
    path: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z'
  },
  {
    id: 'book',
    name: 'Book',
    path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'
  },
  {
    id: 'music',
    name: 'Music',
    path: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'
  },
  {
    id: 'camera',
    name: 'Camera',
    path: 'M4 7h3l2-3h6l2 3h3v13H4zm12 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'
  },
  {
    id: 'cart',
    name: 'Cart',
    path: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6M9 20h.01M17 20h.01'
  },
  { id: 'bolt', name: 'Bolt', path: 'M13 2 4 14h7l-1 8 9-12h-7z' },
  { id: 'leaf', name: 'Leaf', path: 'M11 20a7 7 0 0 1-7-7c0-6 5-9 16-9 0 11-3 16-9 16zM4 21c3-6 7-9 12-11' },
  {
    id: 'building',
    name: 'Building',
    path: 'M4 21V3h11v18M15 9h5v12M8 7h3M8 11h3M8 15h3M2 21h20'
  },
  {
    id: 'users',
    name: 'People',
    path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'
  }
]

/** Quick picks in the silo dialog ("Or pick …") */
export const QUICK_EMOJIS = ['🏡', '💼', '☕', '🎧', '🎨', '📚', '🚀', '🌱']
export const QUICK_ICONS = ['briefcase', 'mountain', 'heart', 'code', 'star']

export function siloIconPath(id: string): string | null {
  return SILO_ICONS.find((i) => i.id === id)?.path ?? null
}

/** Normalised icon for a silo (falls back to the first letter of its name). */
export function siloIconOf(group: Pick<GroupItem, 'name' | 'icon'>): SiloIcon {
  if (group.icon && (group.icon.kind === 'letter' || group.icon.value)) return group.icon
  return { kind: 'letter', value: '' }
}

export function siloInitial(group: Pick<GroupItem, 'name' | 'icon'>): string {
  const icon = siloIconOf(group)
  if (icon.kind === 'letter' && icon.value.trim()) return icon.value.trim().slice(0, 2).toUpperCase()
  return Array.from(group.name.trim())[0]?.toUpperCase() ?? '?'
}

const MAX_SVG_BYTES = 64 * 1024
const RASTER_SIZE = 128

/**
 * Turns an uploaded/pasted/dropped image into a compact data URL for storage in the config.
 * Small SVGs are kept as-is (crisp at every size); everything else is rasterised to 128×128 PNG.
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an SVG or PNG image')
  if (file.type === 'image/svg+xml' && file.size <= MAX_SVG_BYTES) {
    return readAsDataUrl(file)
  }
  const source = await readAsDataUrl(file)
  const img = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = RASTER_SIZE
  canvas.height = RASTER_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the image')
  // Contain the image in the square, preserving aspect ratio
  const scale = Math.min(RASTER_SIZE / img.width, RASTER_SIZE / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (RASTER_SIZE - w) / 2, (RASTER_SIZE - h) / 2, w, h)
  return canvas.toDataURL('image/png')
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file is not an image Silo can read'))
    img.src = src
  })
}
