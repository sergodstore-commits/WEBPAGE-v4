import { setTimeout } from 'node:timers/promises';

export class CancelableWorker {
  constructor(
    private readonly tick: () => Promise<void>,
    private readonly pollMs: number,
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.tick();
      try {
        await setTimeout(this.pollMs, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) {
          throw error;
        }
      }
    }
  }
}
