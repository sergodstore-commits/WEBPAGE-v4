import type { ExecutionContext } from '@sergod/foundation';
import type { Pool } from 'pg';

import type { CatalogAdminAuthorizer } from '../application/ports.js';
import { CatalogError } from '../domain/catalog.js';

export class PgCatalogAdminAuthorizer implements CatalogAdminAuthorizer {
  constructor(private readonly pool: Pool) {}

  async assertCanManageCatalog(context: ExecutionContext): Promise<void> {
    if (context.actorId === undefined) {
      throw new CatalogError(
        'CATALOG_ADMIN_REQUIRED',
        'VALIDATION',
        'Catalog administrator is required.',
      );
    }
    const result = await this.pool.query(
      `SELECT account_id FROM user_accounts
        WHERE account_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE'
          AND email_verification_status = 'VERIFIED'`,
      [context.actorId],
    );
    if (result.rowCount !== 1) {
      throw new CatalogError(
        'CATALOG_ACCESS_DENIED',
        'VALIDATION',
        'Catalog access is not available.',
      );
    }
  }
}
