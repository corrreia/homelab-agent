import { createFileRoute } from '@tanstack/react-router'
import { readConfig, writeConfig, type Source } from '../../../lib/config'
import { withInferredApiBasePath } from '../../../lib/source-spec'

export const Route = createFileRoute('/api/sources/')({
  server: {
    handlers: {
      GET: async () => {
        const config = await readConfig()
        return Response.json(config.sources)
      },
      POST: async ({ request }) => {
        const source = (await request.json()) as Source
        if (!source.slug || !source.baseUrl) {
          return Response.json({ error: 'slug and baseUrl are required' }, { status: 400 })
        }
        const config = await readConfig()
        if (config.sources.some((s) => s.slug === source.slug)) {
          return Response.json({ error: `Source "${source.slug}" already exists` }, { status: 409 })
        }
        config.sources.push(await withInferredApiBasePath(source))
        await writeConfig(config)
        return Response.json(config.sources.at(-1), { status: 201 })
      },
    },
  },
})
