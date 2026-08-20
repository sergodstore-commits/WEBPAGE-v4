import type { ExecutionContext } from '@sergod/foundation';
import type { Pool } from 'pg';

import type { PreordersAdminAuthorizer } from '../application/ports.js';
import { PreorderError } from '../domain/preorders.js';

export class PgPreordersAdminAuthorizer implements PreordersAdminAuthorizer {
  constructor(private readonly pool: Pool) {}

  async assertCanManagePreorders(context: ExecutionContext): Promise<void> {
    if (context.actorId === undefined) throw denied();
    const result = await this.pool.query(
      `SELECT 1 FROM user_accounts
        WHERE account_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE'`,
      [context.actorId],
    );
    if (result.rowCount !== 1) throw denied();
  }
}

function denied(): PreorderError {
  return new PreorderError(
    'PREORDERS_ACCESS_DENIED',
    'VALIDATION',
    'Preorder administration access is denied.',
  );
}
