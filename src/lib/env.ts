import { z } from 'zod'

/**
 * Environment values are intentionally read lazily.  Next.js must be able to
 * build a preview without production secrets, while requests which need a
 * secret fail closed with a configuration error.
 */
const integerFromEnv = (fallback: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return fallback
    return Number(value)
  }, z.number().int().positive())

const rawEnvSchema = z.object({
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().trim().min(1).default('1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50'),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().trim().email().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(1).optional(),
  NOTES_SHEET_NAME: z.string().trim().min(1).default('notes'),
  SNAPSHOTS_SHEET_NAME: z.string().trim().min(1).default('diagram_snapshots'),
  OPERATIONS_SHEET_NAME: z.string().trim().min(1).default('operations'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.6-flash'),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_PASSWORD_HASH: z.string().trim().min(1).optional(),
  AUTH_SESSION_MAX_AGE_SECONDS: integerFromEnv(43200),
  AUTH_LOGIN_MAX_ATTEMPTS: integerFromEnv(5),
  AUTH_LOGIN_WINDOW_SECONDS: integerFromEnv(900),
  MAX_MEMO_LENGTH: integerFromEnv(20000),
})

export type AppEnv = z.infer<typeof rawEnvSchema>

/** Return parsed values and a generic error without exposing values/secrets. */
export function readEnv(): { values: AppEnv; issues: string[] } {
  const result = rawEnvSchema.safeParse(process.env)
  if (result.success) return { values: result.data, issues: [] }
  return {
    values: rawEnvSchema.parse({}),
    issues: result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean),
  }
}

export function getServerEnv(): AppEnv {
  return readEnv().values
}

/**
 * Auth config is considered unavailable unless both secrets are supplied and
 * the password is an Argon2id PHC string.  Do not include the reason in a
 * client response; it is useful only to server-side callers/tests.
 */
export const ARGON2ID_PHC = /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/

export function getAuthConfig():
  | { ok: true; secret: string; passwordHash: string; maxAge: number; maxAttempts: number; windowSeconds: number }
  | { ok: false; reason: 'missing' | 'invalid' } {
  const { values } = readEnv()
  if (!values.AUTH_SECRET || !values.AUTH_PASSWORD_HASH) return { ok: false, reason: 'missing' }
  if (!ARGON2ID_PHC.test(values.AUTH_PASSWORD_HASH)) return { ok: false, reason: 'invalid' }
  return {
    ok: true,
    secret: values.AUTH_SECRET,
    passwordHash: values.AUTH_PASSWORD_HASH,
    maxAge: values.AUTH_SESSION_MAX_AGE_SECONDS,
    maxAttempts: values.AUTH_LOGIN_MAX_ATTEMPTS,
    windowSeconds: values.AUTH_LOGIN_WINDOW_SECONDS,
  }
}

export function getSheetsConfig():
  | { ok: true; spreadsheetId: string; email: string; privateKey: string; noteSheet: string; snapshotSheet: string; operationsSheet: string }
  | { ok: false } {
  const { values } = readEnv()
  if (!values.GOOGLE_SHEETS_SPREADSHEET_ID || !values.GOOGLE_SERVICE_ACCOUNT_EMAIL || !values.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return { ok: false }
  }
  return {
    ok: true,
    spreadsheetId: values.GOOGLE_SHEETS_SPREADSHEET_ID,
    email: values.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: values.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    noteSheet: values.NOTES_SHEET_NAME,
    snapshotSheet: values.SNAPSHOTS_SHEET_NAME,
    operationsSheet: values.OPERATIONS_SHEET_NAME,
  }
}

export function getMaxMemoLength(): number {
  return getServerEnv().MAX_MEMO_LENGTH
}
