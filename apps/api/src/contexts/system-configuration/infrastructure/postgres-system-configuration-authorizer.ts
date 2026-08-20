import type { ExecutionContext } from '@sergod/foundation';
import type { Pool } from 'pg';

import type { SystemConfigurationAdminAuthorizer } from '../application/ports.js';
import { SystemConfigurationError } from '../domain/system-configuration.js';

export class PgSystemConfigurationAdminAuthorizer implements SystemConfigurationAdminAuthorizer {
  constructor(private readonly pool: Pool) {}

  async assertCanManageSystemConfigurations(context: ExecutionContext): Promise<void> {
    if (context.actorId === undefined) throw denied();
    const result = await this.pool.query(
      `SELECT 1 FROM user_accounts
        WHERE account_id=$1 AND role='ADMIN' AND status='ACTIVE'
          AND email_verification_status='VERIFIED'`,
      [context.actorId],
    );
    if (result.rowCount !== 1) throw denied();
  }
}

function denied(): SystemConfigurationError {
  return new SystemConfigurationError(
    'SYSTEM_CONFIGURATION_ACCESS_DENIED',
    'VALIDATION',
    'Access is not available.',
  );
}
