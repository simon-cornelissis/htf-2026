export const MAX_ECHO_IMAGES = 3
export const MAX_ECHO_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_ECHO_IMAGES_BYTES = 8 * 1024 * 1024

export type EncodedEchoImage = {
  fileName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  base64: string
  byteSize: number
}

export function normalizeEchoImages(input: unknown): EncodedEchoImage[] {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_ECHO_IMAGES) {
    throw new Error(`Attach up to ${MAX_ECHO_IMAGES} photos.`)
  }

  let totalBytes = 0
  return input.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('One of the photos is invalid.')
    const image = value as Record<string, unknown>
    const mimeType = image.mimeType
    const base64 = image.base64
    if (
      typeof mimeType !== 'string' ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ||
      typeof base64 !== 'string' ||
      base64.length === 0 ||
      base64.length > Math.ceil(MAX_ECHO_IMAGE_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
    ) {
      throw new Error('Use a JPG, PNG or WebP photo under 4 MB.')
    }

    let bytes: Uint8Array
    try {
      const binary = atob(base64)
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    } catch {
      throw new Error('One of the photos could not be decoded.')
    }
    if (bytes.length === 0 || bytes.length > MAX_ECHO_IMAGE_BYTES) {
      throw new Error('Each photo must be smaller than 4 MB.')
    }
    totalBytes += bytes.length
    if (totalBytes > MAX_ECHO_IMAGES_BYTES) throw new Error('Photos must total less than 8 MB.')

    const isPng =
      mimeType === 'image/png' &&
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte)
    const isJpeg = mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const isWebp =
      mimeType === 'image/webp' &&
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    if (!isPng && !isJpeg && !isWebp) throw new Error('The photo content does not match its file type.')

    const rawName = typeof image.fileName === 'string' ? image.fileName : 'photo'
    const fileName =
      rawName
        .split(/[\\/]/)
        .pop()
        ?.replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 120) || 'photo'

    return { fileName, mimeType: mimeType as EncodedEchoImage['mimeType'], base64, byteSize: bytes.length }
  })
}

export function isCriticalReport(description: string): boolean {
  return /\b(?:bomb|explod\w*|detonat\w*|fire|smoke|collapse\w*|poison\w*|contaminat\w*|mass\s+casualt\w*|injur\w*|fatal\w*|dead|kill\w*|flood\w*|blackout|severe)\b/i.test(
    description,
  )
}
