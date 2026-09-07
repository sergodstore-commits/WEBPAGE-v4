import { shortIdentifier } from '../admin/presentation.js';

export type StoreSummary = Readonly<{
  branchId: string;
  name: string;
  openingHours?: string;
  publicAddress?: string;
}>;

type Item = Readonly<Record<string, unknown>>;

export function firstStore(value: unknown): StoreSummary | null {
  if (!isItem(value)) return null;
  const branchId = value.branchId ?? value.branch_id;
  if (typeof branchId !== 'string' || branchId === '') return null;
  const name = value.name;
  const publicAddress = value.publicAddress ?? value.public_address;
  const openingHours = value.openingHours ?? value.opening_hours;
  return {
    branchId,
    name:
      typeof name === 'string' && name.trim() !== ''
        ? name
        : typeof publicAddress === 'string' && publicAddress.trim() !== ''
          ? publicAddress
          : `Tienda ${shortIdentifier(branchId)}`,
    ...(typeof openingHours === 'string' && openingHours.trim() !== '' ? { openingHours } : {}),
    ...(typeof publicAddress === 'string' && publicAddress.trim() !== '' ? { publicAddress } : {}),
  };
}

export function firstStoreFromCoverage(value: unknown): StoreSummary | null {
  if (!isItem(value)) return null;
  const branches = Array.isArray(value.branches) ? value.branches : [];
  for (const branch of branches) {
    const store = firstStore(branch);
    if (store !== null) return store;
  }
  const information = Array.isArray(value.serviceInfo) ? value.serviceInfo : [];
  for (const item of information) {
    const store = firstStore(item);
    if (store !== null) return store;
  }
  return null;
}

function isItem(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
