import { google, sheets_v4 } from 'googleapis'
import { getSheetsConfig } from '../env'

export const NOTE_HEADERS = ['id', 'owner_id', 'title', 'content_markdown', 'content_json', 'created_at', 'updated_at', 'version', 'deleted_at'] as const
export const SNAPSHOT_HEADERS = ['id', 'note_id', 'graph_json', 'warnings_json', 'summary', 'layout_config_json', 'saved_at', 'version', 'request_id'] as const
export const OPERATION_HEADERS = ['request_id', 'action', 'target_id', 'result', 'duration_ms', 'occurred_at'] as const

export type SheetNameKey = 'notes' | 'snapshots' | 'operations'
export type SheetRow = { rowNumber: number; values: Record<string, string> }

/** Prefix values which Sheets would otherwise interpret as a formula. */
export function escapeSheetCell(value: string | number): string | number {
  if (typeof value !== 'string') return value
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

export function unescapeSheetCell(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value
}

function columnName(index: number): string {
  let n = index + 1
  let result = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

type MetadataSheet = { properties?: { sheetId?: number | null; title?: string | null } }

/**
 * Thin server-only Google Sheets v4 adapter. No credentials or access token
 * are read at module evaluation time. A new JWT client is created on each
 * adapter construction so the library obtains short-lived access tokens.
 */
export class GoogleSheetsClient {
  private readonly spreadsheetId: string
  private readonly names: Record<SheetNameKey, string>
  private readonly sheets: sheets_v4.Sheets
  private initialized?: Promise<void>
  private metadata: MetadataSheet[] = []

  private constructor(config: Extract<ReturnType<typeof getSheetsConfig>, { ok: true }>) {
    this.spreadsheetId = config.spreadsheetId
    this.names = { notes: config.noteSheet, snapshots: config.snapshotSheet, operations: config.operationsSheet }
    const auth = new google.auth.JWT({
      email: config.email,
      key: config.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    this.sheets = google.sheets({ version: 'v4', auth })
  }

  static create(): GoogleSheetsClient {
    const config = getSheetsConfig()
    if (!config.ok) throw new SheetsConfigurationError()
    return new GoogleSheetsClient(config)
  }

  async initialize(): Promise<void> {
    if (!this.initialized) this.initialized = this.initializeOnce()
    return this.initialized
  }

  private async initializeOnce(): Promise<void> {
    const metadataResponse = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    })
    this.metadata = (metadataResponse.data.sheets ?? []) as MetadataSheet[]
    const requests: sheets_v4.Schema$Request[] = []
    const requestedTitles = new Set<string>()
    for (const key of ['notes', 'snapshots', 'operations'] as SheetNameKey[]) {
      const title = this.names[key]
      const existing = this.metadata.find((sheet) => sheet.properties?.title === title)
      if (!existing && !requestedTitles.has(title)) {
        requests.push({ addSheet: { properties: { title } } })
        requestedTitles.add(title)
      }
    }
    if (requests.length) {
      try {
        await this.sheets.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests } })
      } catch (error) {
        // Another serverless instance may have created the same tabs between
        // our metadata read and batchUpdate. Refresh and only rethrow when a
        // requested tab is still genuinely missing.
        const refreshedAfterError = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: 'sheets.properties(sheetId,title)' })
        this.metadata = (refreshedAfterError.data.sheets ?? []) as MetadataSheet[]
        const stillMissing = Object.values(this.names).some((name) => !this.metadata.some((sheet) => sheet.properties?.title === name))
        if (stillMissing) throw error
      }
      if (!this.metadata.length || requests.length) {
        const refreshed = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: 'sheets.properties(sheetId,title)' })
        this.metadata = (refreshed.data.sheets ?? []) as MetadataSheet[]
      }
    }
    const headersByKey: Record<SheetNameKey, readonly string[]> = { notes: NOTE_HEADERS, snapshots: SNAPSHOT_HEADERS, operations: OPERATION_HEADERS }
    for (const key of ['notes', 'snapshots', 'operations'] as SheetNameKey[]) {
      const sheetName = this.names[key]
      const headerResponse = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `${quoteSheet(sheetName)}!1:1` })
      const current = (headerResponse.data.values?.[0] ?? []).map(String)
      const missing = headersByKey[key].filter((header) => !current.includes(header))
      if (!current.length) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${quoteSheet(sheetName)}!A1:${columnName(headersByKey[key].length - 1)}1`,
          valueInputOption: 'RAW',
          requestBody: { values: [Array.from(headersByKey[key])] },
        })
      } else if (missing.length) {
        const values = [...current, ...missing]
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${quoteSheet(sheetName)}!A1:${columnName(values.length - 1)}1`,
          valueInputOption: 'RAW',
          requestBody: { values: [values] },
        })
      }
    }
  }

  sheetName(key: SheetNameKey): string {
    return this.names[key]
  }

  async getRows(key: SheetNameKey): Promise<SheetRow[]> {
    await this.initialize()
    const name = this.names[key]
    const response = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `${quoteSheet(name)}!A:ZZ` })
    const rows = response.data.values ?? []
    const headers = (rows[0] ?? []).map(String)
    return rows.slice(1).map((row, index) => {
      const values: Record<string, string> = {}
      headers.forEach((header, column) => {
        if (header) values[header] = unescapeSheetCell(String(row[column] ?? ''))
      })
      return { rowNumber: index + 2, values }
    }).filter((row) => Object.values(row.values).some((value) => value !== ''))
  }

  async appendRow(key: SheetNameKey, values: (string | number)[]): Promise<void> {
    await this.initialize()
    const name = this.names[key]
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${quoteSheet(name)}!A:ZZ`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values.map(escapeSheetCell)] },
    })
  }

  async updateRow(key: SheetNameKey, rowNumber: number, values: (string | number)[]): Promise<void> {
    await this.initialize()
    const name = this.names[key]
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${quoteSheet(name)}!A${rowNumber}:${columnName(values.length - 1)}${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values.map(escapeSheetCell)] },
    })
  }
}

export class SheetsConfigurationError extends Error {
  constructor() {
    super('Google Sheets is not configured')
    this.name = 'SheetsConfigurationError'
  }
}

function quoteSheet(name: string): string {
  // Sheet names are environment configuration, but quote defensively for
  // spaces, apostrophes, and punctuation.
  return `'${name.replace(/'/g, "''")}'`
}

let client: GoogleSheetsClient | undefined
export function getSheetsClient(): GoogleSheetsClient {
  if (!client) client = GoogleSheetsClient.create()
  return client
}

/** Explicit factory alias for callers that prefer dependency injection wording. */
export function createSheetsClient(): GoogleSheetsClient {
  return GoogleSheetsClient.create()
}

export { GoogleSheetsClient as SheetsClient }

export function resetSheetsClientForTests(): void {
  client = undefined
}
