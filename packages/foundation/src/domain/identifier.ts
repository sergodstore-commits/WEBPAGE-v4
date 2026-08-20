const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

declare const entityIdBrand: unique symbol;

export type EntityId<Entity extends string> = string & {
  readonly [entityIdBrand]: Entity;
};

export function entityId<Entity extends string>(value: string): EntityId<Entity> {
  if (!UUID_PATTERN.test(value)) {
    throw new RangeError('Entity identifiers must be valid UUID values.');
  }

  return value.toLowerCase() as EntityId<Entity>;
}
