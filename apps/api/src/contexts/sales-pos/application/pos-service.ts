import type { ExecutionContext } from '@sergod/foundation';
export class PosError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PosError';
  }
}
export interface PosRepository {
  create(c: ExecutionContext, i: ReturnType<JSON['parse']>): Promise<ReturnType<JSON['parse']>>;
  get(c: ExecutionContext, id: string): Promise<ReturnType<JSON['parse']>>;
  list(c: ExecutionContext, q: ReturnType<JSON['parse']>): Promise<ReturnType<JSON['parse']>>;
  findSku(c: ExecutionContext, sku: string): Promise<ReturnType<JSON['parse']>>;
  addLine(
    c: ExecutionContext,
    id: string,
    i: ReturnType<JSON['parse']>,
  ): Promise<ReturnType<JSON['parse']>>;
  removeLine(c: ExecutionContext, id: string, line: string): Promise<ReturnType<JSON['parse']>>;
  updateLine(
    c: ExecutionContext,
    id: string,
    line: string,
    quantity: number,
  ): Promise<ReturnType<JSON['parse']>>;
  setBuyer(
    c: ExecutionContext,
    id: string,
    i: ReturnType<JSON['parse']>,
  ): Promise<ReturnType<JSON['parse']>>;
  setCoupon(
    c: ExecutionContext,
    id: string,
    code: string | null,
  ): Promise<ReturnType<JSON['parse']>>;
  setLoyalty(c: ExecutionContext, id: string, points: number): Promise<ReturnType<JSON['parse']>>;
  prepare(c: ExecutionContext, id: string): Promise<ReturnType<JSON['parse']>>;
  returnToDraft(
    c: ExecutionContext,
    id: string,
    reason: string,
  ): Promise<ReturnType<JSON['parse']>>;
  settleAndComplete(
    c: ExecutionContext,
    id: string,
    i: ReturnType<JSON['parse']> | null,
  ): Promise<ReturnType<JSON['parse']>>;
  discard(c: ExecutionContext, id: string, reason: string): Promise<ReturnType<JSON['parse']>>;
  createMethod(
    c: ExecutionContext,
    i: ReturnType<JSON['parse']>,
  ): Promise<ReturnType<JSON['parse']>>;
  getMethod(c: ExecutionContext, id: string): Promise<ReturnType<JSON['parse']>>;
  editMethod(
    c: ExecutionContext,
    id: string,
    i: ReturnType<JSON['parse']>,
  ): Promise<ReturnType<JSON['parse']>>;
  deleteMethod(c: ExecutionContext, id: string): Promise<ReturnType<JSON['parse']>>;
  transitionMethod(
    c: ExecutionContext,
    id: string,
    next: string,
    reason: string,
  ): Promise<ReturnType<JSON['parse']>>;
  listMethods(c: ExecutionContext): Promise<ReturnType<JSON['parse']>>;
  daily(c: ExecutionContext, branch: string, date: string): Promise<ReturnType<JSON['parse']>>;
}
export class PosService {
  constructor(private readonly r: PosRepository) {}
  create(c: ExecutionContext, i: ReturnType<JSON['parse']>) {
    return this.r.create(c, i);
  }
  get(c: ExecutionContext, id: string) {
    return this.r.get(c, id);
  }
  list(c: ExecutionContext, q: ReturnType<JSON['parse']>) {
    return this.r.list(c, q);
  }
  findSku(c: ExecutionContext, s: string) {
    return this.r.findSku(c, s);
  }
  addLine(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']>) {
    return this.r.addLine(c, id, i);
  }
  removeLine(c: ExecutionContext, id: string, l: string) {
    return this.r.removeLine(c, id, l);
  }
  updateLine(c: ExecutionContext, id: string, l: string, q: number) {
    return this.r.updateLine(c, id, l, q);
  }
  setBuyer(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']>) {
    return this.r.setBuyer(c, id, i);
  }
  setCoupon(c: ExecutionContext, id: string, x: string | null) {
    return this.r.setCoupon(c, id, x);
  }
  setLoyalty(c: ExecutionContext, id: string, p: number) {
    return this.r.setLoyalty(c, id, p);
  }
  prepare(c: ExecutionContext, id: string) {
    return this.r.prepare(c, id);
  }
  returnToDraft(c: ExecutionContext, id: string, reason: string) {
    return this.r.returnToDraft(c, id, reason);
  }
  complete(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']> | null) {
    return this.r.settleAndComplete(c, id, i);
  }
  discard(c: ExecutionContext, id: string, r: string) {
    return this.r.discard(c, id, r);
  }
  createMethod(c: ExecutionContext, i: ReturnType<JSON['parse']>) {
    return this.r.createMethod(c, i);
  }
  getMethod(c: ExecutionContext, id: string) {
    return this.r.getMethod(c, id);
  }
  editMethod(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']>) {
    return this.r.editMethod(c, id, i);
  }
  deleteMethod(c: ExecutionContext, id: string) {
    return this.r.deleteMethod(c, id);
  }
  transitionMethod(c: ExecutionContext, id: string, n: string, r: string) {
    return this.r.transitionMethod(c, id, n, r);
  }
  listMethods(c: ExecutionContext) {
    return this.r.listMethods(c);
  }
  daily(c: ExecutionContext, b: string, d: string) {
    return this.r.daily(c, b, d);
  }
}
