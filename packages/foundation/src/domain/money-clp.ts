export class MoneyClp {
  readonly #amount: number;

  private constructor(amount: number) {
    this.#amount = amount;
  }

  static fromInteger(amount: number): MoneyClp {
    if (!Number.isSafeInteger(amount)) {
      throw new RangeError('CLP money must be represented by a safe integer.');
    }

    return new MoneyClp(amount);
  }

  static zero(): MoneyClp {
    return new MoneyClp(0);
  }

  add(other: MoneyClp): MoneyClp {
    return MoneyClp.fromInteger(this.#amount + other.#amount);
  }

  subtract(other: MoneyClp): MoneyClp {
    return MoneyClp.fromInteger(this.#amount - other.#amount);
  }

  equals(other: MoneyClp): boolean {
    return this.#amount === other.#amount;
  }

  toInteger(): number {
    return this.#amount;
  }

  toJSON(): number {
    return this.#amount;
  }
}
