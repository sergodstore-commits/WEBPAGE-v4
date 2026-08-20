import type { ExecutionContext } from '@sergod/foundation';
import type { Pool } from 'pg';

import type { InventoryAdminAuthorizer } from '../application/ports.js';
import { InventoryError } from '../domain/inventory.js';

export class PgInventoryAdminAuthorizer implements InventoryAdminAuthorizer {
  constructor(private readonly pool: Pool) {}

  async assertCanManageInventory(context: ExecutionContext): Promise<void> {
    if (context.actorId === undefined) throw accessDenied();
    const result = await this.pool.query(
      `SELECT account_id FROM user_accounts
        WHERE account_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE'
          AND email_verification_status = 'VERIFIED'`,
      [context.actorId],
    );
    if (result.rowCount !== 1) throw accessDenied();
  }
}

function accessDenied(): InventoryError {
  return new InventoryError(
    'INVENTORY_ACCESS_DENIED',
    'VALIDATION',
    'Inventory administration is not available.',
  );
}
