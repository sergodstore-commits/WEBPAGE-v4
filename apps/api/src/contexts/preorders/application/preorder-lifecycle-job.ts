import type { Clock, ExecutionContext } from '@sergod/foundation';

import { CoordinationStore } from '../../../platform/coordination/coordination-store.js';
import type { PreordersRepository } from './ports.js';

const JOB_NAME = 'PREORDER_CAMPAIGN_LIFECYCLE';

export class PreorderLifecycleJob {
  constructor(
    private readonly repository: PreordersRepository,
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
      const counts = await this.repository.processLifecycle(context, this.clock.now());
      const succeeded = counts.opened + counts.closed;
      await this.coordination.completeScheduledJob(
        acquired.runId,
        { failed: counts.failed, processed: counts.scanned, succeeded },
        {
          failed: counts.failed,
          metadata_contract: 'ScheduledJobResultSummary.v1',
          metadata_schema_version: 1,
          scanned: counts.scanned,
          skipped: counts.scanned - succeeded - counts.failed,
          succeeded,
        },
      );
      return { ...counts, kind: 'COMPLETED' as const };
    } catch (error) {
      await this.coordination.failScheduledJob(acquired.runId, 'DEPENDENCY_UNAVAILABLE');
      throw error;
    }
  }
}
