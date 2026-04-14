import { createFileRoute } from '@tanstack/react-router'
import { type Source } from '../../../lib/config'
import { deleteSource, getSource, updateSource } from '../../../lib/sources-repo'

export const Route = createFileRoute('/api/sources/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const source = await getSource(params.slug)
        if (!source) {
          return Response.json({ error: 'Source not found' }, { status: 404 })
        }
        return Response.json(source)
      },
      PUT: async ({ request, params }) => {
        const existing = await getSource(params.slug)
        if (!existing) {
          return Response.json({ error: 'Source not found' }, { status: 404 })
        }
        const updates = (await request.json()) as Partial<Source>
        try {
          const updated = await updateSource(params.slug, { ...existing, ...updates, slug: params.slug })
          return Response.json(updated)
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
        }
      },
      DELETE: async ({ params }) => {
        const existing = await getSource(params.slug)
        if (!existing) {
          return Response.json({ error: 'Source not found' }, { status: 404 })
        }
        await deleteSource(params.slug)
        return Response.json({ ok: true })
      },
    },
  },
})
