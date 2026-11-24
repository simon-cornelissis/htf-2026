import { describe, expect, it } from 'vitest'
import { isCriticalReport, normalizeEchoImages } from './user-engagement.ts'

describe('echo photo validation', () => {
  it('accepts a small PNG with matching content bytes', () => {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')
    expect(
      normalizeEchoImages([{ fileName: 'scene.png', mimeType: 'image/png', base64: pngSignature }]),
    ).toMatchObject([{ fileName: 'scene.png', mimeType: 'image/png', byteSize: 8 }])
  })

  it('rejects mismatched image MIME types and too many photos', () => {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')
    expect(() =>
      normalizeEchoImages([{ fileName: 'scene.jpg', mimeType: 'image/jpeg', base64: pngSignature }]),
    ).toThrow(/does not match/)
    expect(() =>
      normalizeEchoImages(Array.from({ length: 4 }, () => ({
        fileName: 'scene.png',
        mimeType: 'image/png',
        base64: pngSignature,
      }))),
    ).toThrow(/up to 3/)
  })
})

describe('critical report detection', () => {
  it('flags urgent incidents without paging on routine reports', () => {
    expect(isCriticalReport('A fire is spreading near the old clock tower.')).toBe(true)
    expect(isCriticalReport('The market stall opened late today.')).toBe(false)
  })
})
