// Server-only: the live CUSTODIAN engine, wired to the real Anthropic client
// and the shared tool registry. The API key never leaves this module.
import { existsSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { executeTool, toolsForRole } from '#/mcp/tools.ts'
import { CHAT_MODEL, createChatEngine, type ChatEngine } from './engine.ts'
import type { ChatStatus } from './types.ts'

const OFFLINE = 'CUSTODIAN offline: add ANTHROPIC_API_KEY to .env and restart the dev server.'

/**
 * In `vite dev`, nitro loads .env into process.env. A production build
 * (`node .output/server/index.mjs`) doesn't, so load it here when present.
 * loadEnvFile never overrides variables that are already set.
 */
function apiKey(): string | undefined {
  if (!process.env.ANTHROPIC_API_KEY && existsSync('.env')) {
    try {
      process.loadEnvFile('.env')
    } catch {
      // unreadable .env: stay offline
    }
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  return key ? key : undefined
}

type Live = { key: string; engine: ChatEngine }

// Survive dev hot reloads (in-memory threads would otherwise vanish on every edit).
const g = globalThis as typeof globalThis & { __custodian?: Live }

export function chatStatus(): ChatStatus {
  return apiKey() ? { online: true, model: CHAT_MODEL } : { online: false, reason: OFFLINE }
}

/** The engine, or null while no API key is configured. */
export function custodian(): ChatEngine | null {
  const key = apiKey()
  if (!key) return null
  if (g.__custodian?.key !== key) {
    const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000 })
    g.__custodian = {
      key,
      engine: createChatEngine({
        createMessage: (params) => client.beta.messages.create(params),
        toolsFor: toolsForRole,
        execute: executeTool,
      }),
    }
  }
  return g.__custodian.engine
}

export { OFFLINE as CHAT_OFFLINE_MESSAGE }
