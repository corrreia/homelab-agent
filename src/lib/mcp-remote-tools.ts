import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { confirmAction, type McpRequestContext } from './mcp-elicitation'
import { DEFAULT_EXEC_TIMEOUT_MS, remoteBash, remoteEdit, remoteGlob, remoteGrep, remoteRead, remoteWrite } from './ssh'

const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] })
const fail = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true })

/**
 * Register the remote SSH toolkit on the MCP server: a mirror of the coding-agent file tools
 * (Read/Write/Edit/Bash/Glob/Grep) executed over SSH. Mutating tools (bash/write/edit) are
 * gated behind human confirmation, once per run per host, and **fail closed** when the client
 * cannot elicit. Read/Glob/Grep are unconfirmed.
 */
export function registerRemoteTools(server: McpServer, supportsElicitation: () => boolean): void {
  const warn = (message: string) => console.warn(`[mcp] ${message}`)

  const confirmHost = (ctx: McpRequestContext, host: string, action: string): Promise<boolean> =>
    confirmAction(
      ctx,
      `host:${host}`,
      `Allow "${action}" on host "${host}" for this execution?`,
      supportsElicitation(),
      warn,
      {
        failClosed: true,
      },
    )

  const guard = async (fn: () => Promise<CallToolResult>): Promise<CallToolResult> => {
    try {
      return await fn()
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  server.registerTool(
    'remote-bash',
    {
      description:
        'Run a shell command on a registered SSH host. Returns { stdout, stderr, exitCode }. Requires approval.',
      inputSchema: { host: z.string(), command: z.string(), timeout_ms: z.number().int().positive().optional() },
    },
    (args, extra) =>
      guard(async () => {
        const ctx = extra as McpRequestContext
        if (!(await confirmHost(ctx, args.host, `bash: ${args.command}`))) {
          return fail(`Command on host "${args.host}" was not approved`)
        }
        return ok(
          JSON.stringify(
            await remoteBash(args.host, args.command, args.timeout_ms ?? DEFAULT_EXEC_TIMEOUT_MS),
            null,
            2,
          ),
        )
      }),
  )

  server.registerTool(
    'remote-read',
    {
      description: 'Read a file on a host, returned as numbered lines (like cat -n). Supports offset/limit.',
      inputSchema: {
        host: z.string(),
        path: z.string(),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    (args) => guard(async () => ok(await remoteRead(args.host, args.path, args.offset, args.limit))),
  )

  server.registerTool(
    'remote-write',
    {
      description: 'Write (create or overwrite) a file on a host, atomically. Requires approval.',
      inputSchema: { host: z.string(), path: z.string(), content: z.string() },
    },
    (args, extra) =>
      guard(async () => {
        const ctx = extra as McpRequestContext
        if (!(await confirmHost(ctx, args.host, `write: ${args.path}`))) {
          return fail(`Write to host "${args.host}" was not approved`)
        }
        const { bytes } = await remoteWrite(args.host, args.path, args.content)
        return ok(`Wrote ${bytes} bytes to ${args.path} on ${args.host}`)
      }),
  )

  server.registerTool(
    'remote-edit',
    {
      description:
        'Exact-string-replace in a file on a host. old_string must occur exactly once unless replace_all. Requires approval.',
      inputSchema: {
        host: z.string(),
        path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
        replace_all: z.boolean().optional(),
      },
    },
    (args, extra) =>
      guard(async () => {
        const ctx = extra as McpRequestContext
        if (!(await confirmHost(ctx, args.host, `edit: ${args.path}`))) {
          return fail(`Edit to host "${args.host}" was not approved`)
        }
        const { replacements } = await remoteEdit(
          args.host,
          args.path,
          args.old_string,
          args.new_string,
          args.replace_all ?? false,
        )
        return ok(`Edited ${args.path} on ${args.host} (${replacements} replacement${replacements === 1 ? '' : 's'})`)
      }),
  )

  server.registerTool(
    'remote-glob',
    {
      description: 'Find files matching a glob under a path on a host (via find). Returns matching paths.',
      inputSchema: { host: z.string(), pattern: z.string(), path: z.string().optional() },
    },
    (args) => guard(async () => ok((await remoteGlob(args.host, args.pattern, args.path)) || '(no matches)')),
  )

  server.registerTool(
    'remote-grep',
    {
      description: 'Search file contents on a host (ripgrep, falling back to grep -rn). Returns matching lines.',
      inputSchema: {
        host: z.string(),
        pattern: z.string(),
        path: z.string().optional(),
        glob: z.string().optional(),
        ignore_case: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () =>
        ok(
          (await remoteGrep(args.host, args.pattern, {
            path: args.path,
            glob: args.glob,
            ignoreCase: args.ignore_case,
          })) || '(no matches)',
        ),
      ),
  )
}
