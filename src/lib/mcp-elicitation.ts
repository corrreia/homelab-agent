import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js'
import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js'

// The context the codemode `openApiMcpServer` request callback receives, tied to
// the originating `execute` tool-call's response stream. The same object instance
// is passed to every host request within one run, so its identity keys per-run state.
export type McpRequestContext = RequestHandlerExtra<ServerRequest, ServerNotification>

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase())
}

// A human has this long to answer a confirmation prompt before it is treated as a
// denial. Kept below the executor timeout so a slow answer kills the prompt, not the run.
const ELICITATION_TIMEOUT_MS = 90_000

type Decision = 'granted' | 'denied'

// Per-run state, keyed by context identity. WeakMap entries are released when the
// run's context is garbage-collected, so there is no manual cleanup and no leak.
let runGrants = new WeakMap<McpRequestContext, Map<string, Decision>>()
let progressCounters = new WeakMap<McpRequestContext, number>()

// Test-only: swap in fresh state. Real runs never need this (each run has a fresh context).
export function __resetRunStateForTests(): void {
  runGrants = new WeakMap()
  progressCounters = new WeakMap()
}

/**
 * Ask the human whether sandbox code may write to `slug`, once per run per source.
 * Returns true if the write may proceed.
 *
 * - Cached: the first mutating call to a source prompts; later calls reuse the decision.
 * - Fail open: a client with no elicitation support is allowed through, with a one-time warning.
 * - Denied on decline, timeout, or cancellation.
 */
export async function confirmWrite(
  context: McpRequestContext,
  slug: string,
  method: string,
  path: string,
  clientSupportsElicitation: boolean,
  warn: (message: string) => void,
): Promise<boolean> {
  let grants = runGrants.get(context)
  if (!grants) {
    grants = new Map()
    runGrants.set(context, grants)
  }

  const cached = grants.get(slug)
  if (cached) return cached === 'granted'

  if (!clientSupportsElicitation) {
    warn(`unconfirmed write to "${slug}" (${method} ${path}) — client has no elicitation support`)
    grants.set(slug, 'granted')
    return true
  }

  let decision: Decision = 'denied'
  try {
    const result = await context.sendRequest(
      {
        method: 'elicitation/create',
        params: {
          message: `Allow writes to "${slug}" for this execution? Triggered by ${method} ${path}.`,
          requestedSchema: {
            type: 'object',
            properties: {
              approve: {
                type: 'boolean',
                title: `Approve writes to "${slug}"`,
                description: 'Applies to every write to this source during this run.',
              },
            },
            required: ['approve'],
          },
        },
      },
      ElicitResultSchema,
      { timeout: ELICITATION_TIMEOUT_MS, signal: context.signal },
    )
    if (result.action === 'accept' && result.content?.approve === true) {
      decision = 'granted'
    }
  } catch {
    // Timeout, cancellation, or transport error — deny, don't crash the run.
    decision = 'denied'
  }

  grants.set(slug, decision)
  return decision === 'granted'
}

/**
 * Emit an indeterminate progress heartbeat for the current run, if the client asked
 * for progress (supplied a progressToken). The host cannot know the total up front —
 * the sandbox loops arbitrarily — so this is a running count plus an activity label.
 */
export function emitProgress(context: McpRequestContext, label: string): void {
  const progressToken = context._meta?.progressToken
  if (progressToken === undefined) return

  const next = (progressCounters.get(context) ?? 0) + 1
  progressCounters.set(context, next)

  void context
    .sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress: next, message: label },
    })
    .catch(() => {
      // Best-effort: a dropped progress ping must never fail the underlying request.
    })
}
