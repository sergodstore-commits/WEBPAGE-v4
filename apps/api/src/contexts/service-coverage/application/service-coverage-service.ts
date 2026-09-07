import type { ExecutionContext } from '@sergod/foundation';
import {
  checkoutDeliveryIntentSchema,
  deliverySnapshotInputSchema,
  type CheckoutDeliveryIntent,
  type deliverySnapshotSchema,
} from '@sergod/contracts';
import type { z } from 'zod';

export class ServiceCoverageError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceCoverageError';
  }
}
export interface ServiceCoverageRepository {
  saveServiceInfo(context: ExecutionContext, input: unknown): Promise<unknown>;
  transitionServiceInfo(
    context: ExecutionContext,
    id: string,
    next: string,
    reason: string,
  ): Promise<unknown>;
  list(): Promise<unknown>;
  publicStore(): Promise<unknown>;
  buildDeliverySnapshot(
    input: unknown,
    orderTotalWithoutShippingClp: number,
  ): Promise<z.infer<typeof deliverySnapshotSchema>>;
  validateProvisionalIntent(input: CheckoutDeliveryIntent): Promise<{
    readonly branchId: string | null;
    readonly errorCodes: readonly string[];
  }>;
}
export class ServiceCoverageService {
  constructor(private readonly repository: ServiceCoverageRepository) {}
  saveInfo(c: ExecutionContext, i: unknown) {
    return this.repository.saveServiceInfo(c, i);
  }
  transitionInfo(c: ExecutionContext, id: string, n: string, r: string) {
    return this.repository.transitionServiceInfo(c, id, n, r);
  }
  list() {
    return this.repository.list();
  }
  publicStore() {
    return this.repository.publicStore();
  }
  buildDeliverySnapshot(i: unknown, orderTotalWithoutShippingClp = 0) {
    return this.repository.buildDeliverySnapshot(
      deliverySnapshotInputSchema.parse(i),
      orderTotalWithoutShippingClp,
    );
  }
  validateProvisionalIntent(i: CheckoutDeliveryIntent) {
    return this.repository.validateProvisionalIntent(checkoutDeliveryIntentSchema.parse(i));
  }
}
