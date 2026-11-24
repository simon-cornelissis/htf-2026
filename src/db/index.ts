import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.ts'

// Server-only: never import this from client code.
const sqlite = new Database(process.env.DB_FILE_NAME ?? 'local.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
