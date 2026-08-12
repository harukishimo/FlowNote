import { GoogleSheetsClient, getSheetsClient } from './client'

export type OperationResult = 'success' | 'failure' | 'conflict'
export type Operation = { requestId: string; action: string; targetId: string; result: OperationResult; durationMs: number; occurredAt: string }

export class OperationsRepository {
  constructor(private readonly client: GoogleSheetsClient = getSheetsClient()) {}

  async record(operation: Operation): Promise<void> {
    // Explicitly keep this audit row free of bodies, graph JSON, credentials,
    // and tokens. The client escapes formula-like values before RAW writing.
    await this.client.appendRow('operations', [operation.requestId, operation.action, operation.targetId, operation.result, operation.durationMs, operation.occurredAt])
  }

  async hasRequest(requestId: string): Promise<boolean> {
    const rows = await this.client.getRows('operations')
    return rows.some((row) => row.values.request_id === requestId)
  }
}

export function createOperationsRepository(): OperationsRepository { return new OperationsRepository() }
