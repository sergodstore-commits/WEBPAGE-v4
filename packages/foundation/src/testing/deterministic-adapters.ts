import type { Clock, UuidGenerator } from '../application/ports.js';

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date): void {
    this.current = new Date(instant);
  }
}

export class SequenceUuidGenerator implements UuidGenerator {
  #position = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.#position];
    if (value === undefined) {
      throw new Error('The deterministic UUID sequence is exhausted.');
    }

    this.#position += 1;
    return value;
  }
}
