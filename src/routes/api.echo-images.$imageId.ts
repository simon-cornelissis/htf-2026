import { eq } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db/index.ts'
import { echoImages } from '#/db/schema.ts'
import { currentGuardian } from '#/lib/session.ts'

export const Route = createFileRoute('/api/echo-images/$imageId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!currentGuardian()) return new Response('Sign in to view this photo.', { status: 401 })
        const image = db
          .select({ data: echoImages.data, mimeType: echoImages.mimeType })
          .from(echoImages)
          .where(eq(echoImages.imageId, params.imageId))
          .get()
        if (!image) return new Response('Photo not found.', { status: 404 })
        return new Response(new Uint8Array(image.data), {
          headers: {
            'Content-Type': image.mimeType,
            'Content-Length': String(image.data.byteLength),
            'Cache-Control': 'private, max-age=300',
            'X-Content-Type-Options': 'nosniff',
            'Cross-Origin-Resource-Policy': 'same-origin',
          },
        })
      },
    },
  },
})
