import type { ExecutionContext } from '@sergod/foundation';
import type { Pool } from 'pg';

import type { LoyaltyAdminAuthorizer } from '../application/ports.js';
import { LoyaltyError } from '../domain/loyalty.js';

export class PgLoyaltyAdminAuthorizer implements LoyaltyAdminAuthorizer {
  constructor(private readonly pool: Pool) {}

  async assertCanManageLoyalty(context: ExecutionContext): Promise<void> {
    if (context.actorId === undefined) throw denied();
    const result = await this.pool.query(
      `SELECT account_id FROM user_accounts
        WHERE account_id=$1 AND role='ADMIN' AND status='ACTIVE'
          AND email_verification_status='VERIFIED'`,
      [context.actorId],
    );
    if (result.rowCount !== 1) throw denied();
  }
}

function denied(): LoyaltyError {
  return new LoyaltyError('LOYALTY_ACCESS_DENIED', 'VALIDATION', 'Access is not available.');
}
