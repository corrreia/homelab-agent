import { createFileRoute } from '@tanstack/react-router'
import { type Source } from '../../../lib/config'
import { addSource, getSources, sourceExists } from '../../../lib/sources-repo'

export const Route = createFileRoute('/api/sources/')({
  server: {
    handlers: {
      GET: async () => {
        const sources = await getSources()
        return Response.json(sources)
      },
      POST: async ({ request }) => {
        const source = (await request.json()) as Source
        if (!source.slug || !source.baseUrl) {
          return Response.json({ error: 'slug and baseUrl are required' }, { status: 400 })
        }
        if (await sourceExists(source.slug)) {
          return Response.json({ error: `Source "${source.slug}" already exists` }, { status: 409 })
        }
        const created = await addSource(source)
        return Response.json(created, { status: 201 })
      },
    },
  },
})
