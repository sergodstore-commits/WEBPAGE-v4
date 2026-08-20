export type ErrorCategory =
  'AUTHORIZATION' | 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly category: ErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApplicationError';
  }
}
