import { createFileRoute } from '@tanstack/react-router'
import { readConfig, writeConfig, type Source } from '../../../lib/config'
import { withInferredApiBasePath } from '../../../lib/source-spec'

export const Route = createFileRoute('/api/sources/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const config = await readConfig()
        const source = config.sources.find((s) => s.slug === params.slug)
        if (!source) {
          return Response.json({ error: 'Source not found' }, { status: 404 })
        }
        return Response.json(source)
      },
      PUT: async ({ request, params }) => {
        const updates = (await request.json()) as Partial<Source>
        const config = await readConfig()
        const idx = config.sources.findIndex((s) => s.slug === params.slug)
        if (idx === -1) {
          return Response.json({ error: 'Source not found' }, { status: 404 })
        }
        config.sources[idx] = await withInferredApiBasePath({
          ...config.sources[idx]!,
          ...updates,
          slug: params.slug,
        })
        await writeConfig(config)
        return Response.json(config.sources[idx])
      },
      DELETE: async ({ params }) => {
        const config = await readConfig()
        const idx = config.sources.findIndex((s) => s.slug === params.slug)
        if (idx === -1) {
          return Response.json({ error: 'Source not found' }, { status: 404 })
        }
        config.sources.splice(idx, 1)
        await writeConfig(config)
        return Response.json({ ok: true })
      },
    },
  },
})
