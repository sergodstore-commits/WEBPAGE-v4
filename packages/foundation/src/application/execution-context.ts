export interface ExecutionContext {
  readonly actorId?: string;
  readonly actorType: 'EXTERNAL_SERVICE' | 'SYSTEM' | 'USER';
  readonly causationId?: string;
  readonly correlationId: string;
  readonly idempotencyKey?: string;
}

export function createSystemExecutionContext(
  correlationId: string,
  causationId?: string,
): ExecutionContext {
  return {
    actorType: 'SYSTEM',
    ...(causationId === undefined ? {} : { causationId }),
    correlationId,
  };
}
