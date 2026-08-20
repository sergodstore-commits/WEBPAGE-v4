import type { ExecutionContext } from '@sergod/foundation';
import type { Pool } from 'pg';

import type { PromotionsAdminAuthorizer } from '../application/ports.js';
import { PromotionError } from '../domain/promotions.js';

export class PgPromotionsAdminAuthorizer implements PromotionsAdminAuthorizer {
  constructor(private readonly pool: Pool) {}

  async assertCanManagePromotions(context: ExecutionContext): Promise<void> {
    if (context.actorId === undefined) throw denied();
    const result = await this.pool.query(
      `SELECT account_id FROM user_accounts
        WHERE account_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE'
          AND email_verification_status = 'VERIFIED'`,
      [context.actorId],
    );
    if (result.rowCount !== 1) throw denied();
  }
}

function denied(): PromotionError {
  return new PromotionError('PROMOTIONS_ACCESS_DENIED', 'VALIDATION', 'Access is not available.');
}
