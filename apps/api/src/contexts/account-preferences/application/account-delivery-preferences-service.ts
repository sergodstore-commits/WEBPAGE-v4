import type { AccountDeliveryPreferences } from '@sergod/contracts';

export interface AccountDeliveryPreferencesView extends AccountDeliveryPreferences {
  readonly accountId: string;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface AccountDeliveryPreferencesRepository {
  get(accountId: string): Promise<AccountDeliveryPreferencesView | null>;
  save(
    accountId: string,
    preferences: AccountDeliveryPreferences,
  ): Promise<AccountDeliveryPreferencesView>;
}

export class AccountDeliveryPreferencesService {
  constructor(private readonly repository: AccountDeliveryPreferencesRepository) {}

  async get(accountId: string) {
    const item = await this.repository.get(accountId);
    return { item: item === null ? null : serialize(item) };
  }

  async save(accountId: string, preferences: AccountDeliveryPreferences) {
    return { item: serialize(await this.repository.save(accountId, preferences)) };
  }
}

function serialize(value: AccountDeliveryPreferencesView) {
  return { ...value, updatedAt: value.updatedAt.toISOString() };
}
