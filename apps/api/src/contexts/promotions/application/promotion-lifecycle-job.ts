import type { Clock, ExecutionContext } from '@sergod/foundation';

import { CoordinationStore } from '../../../platform/coordination/coordination-store.js';
import type { PromotionsRepository } from './ports.js';

const JOB_NAME = 'PROMOTION_LIFECYCLE';

export class PromotionLifecycleJob {
  constructor(
    private readonly repository: PromotionsRepository,
    private readonly coordination: CoordinationStore,
    private readonly clock: Clock,
  ) {}

  async run(input: { readonly correlationId: string; readonly scheduledFor: Date }) {
    const acquired = await this.coordination.acquireScheduledJob({
      allowFailedRetry: true,
      correlationId: input.correlationId,
      idempotencyKey: `${JOB_NAME}:${input.scheduledFor.toISOString()}`,
      jobName: JOB_NAME,
      leaseMs: 15 * 60 * 1_000,
      scheduledFor: input.scheduledFor,
    });
    if (acquired.kind !== 'ACQUIRED') return { kind: acquired.kind } as const;
    const context: ExecutionContext = { actorType: 'SYSTEM', correlationId: input.correlationId };
    try {
      const counts = await this.repository.expireDue(context, this.clock.now());
      const processed = counts.promotions + counts.coupons;
      await this.coordination.completeScheduledJob(
        acquired.runId,
        { failed: 0, processed, succeeded: processed },
        {
          failed: 0,
          metadata_contract: 'ScheduledJobResultSummary.v1',
          metadata_schema_version: 1,
          scanned: processed,
          skipped: 0,
          succeeded: processed,
        },
      );
      return { ...counts, kind: 'COMPLETED' as const };
    } catch (error) {
      await this.coordination.failScheduledJob(acquired.runId, 'DEPENDENCY_UNAVAILABLE');
      throw error;
    }
  }
}
