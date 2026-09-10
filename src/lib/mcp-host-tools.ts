import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createHost, deleteHost, ensureAgentIdentity, listHosts } from './hosts-repo'

const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] })

const fail = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true })

/**
 * Register host-management tools so the model can maintain its own SSH host list (the same
 * hosts the /hosts UI manages and the remote-* tools reach). Adding a host is benign on its
 * own — the host only becomes reachable once the agent public key is in its authorized_keys,
 * and every mutating remote-* call is still confirmation-gated.
 */
export function registerHostTools(server: McpServer): void {
  const guard = async (fn: () => Promise<CallToolResult>): Promise<CallToolResult> => {
    try {
      return await fn()
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  server.registerTool(
    'host-list',
    {
      description:
        'List registered SSH hosts (usable by the remote-* tools) and the agent public key to install on new hosts.',
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const hosts = await listHosts()
        const { publicKey } = await ensureAgentIdentity()

        return ok(
          JSON.stringify(
            {
              hosts: hosts.map((h) => ({
                slug: h.slug,
                label: h.label,
                hostname: h.hostname,
                port: h.port,
                username: h.username,
                pinned: h.pinned,
              })),
              agentPublicKey: publicKey,
            },
            null,
            2,
          ),
        )
      }),
  )

  server.registerTool(
    'host-add',
    {
      description:
        "Register an SSH host so the remote-* tools can reach it. The agent authenticates with its own key — the agent public key (see host-list) must be in the host's ~/.ssh/authorized_keys.",
      inputSchema: {
        slug: z.string().describe('short handle, e.g. "nas" — lowercase alphanumeric + hyphens'),
        hostname: z.string().describe('bare host or IP, no scheme'),
        username: z.string(),
        port: z.number().int().positive().optional(),
        label: z.string().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const host = await createHost({
          slug: args.slug,
          hostname: args.hostname,
          username: args.username,
          port: args.port,
          label: args.label,
        })

        const { publicKey } = await ensureAgentIdentity()

        return ok(
          `Registered host "${host.slug}" (${host.username}@${host.hostname}:${host.port}). ` +
            `If not already done, add the agent public key to its ~/.ssh/authorized_keys:\n${publicKey}`,
        )
      }),
  )

  server.registerTool(
    'host-remove',
    {
      description:
        'Unregister an SSH host (removes it from the list and unlinks any sources that ran on it). Its pinned server key is kept.',
      inputSchema: { slug: z.string() },
    },
    (args) =>
      guard(async () => {
        await deleteHost(args.slug)

        return ok(`Removed host "${args.slug}".`)
      }),
  )
}
