export type NotificationEventType =
  | 'ACCOUNT_VERIFICATION'
  | 'PASSWORD_RESET'
  | 'ORDER_CREATED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY_FOR_PICKUP'
  | 'ORDER_SHIPPED'
  | 'ORDER_FULFILLED'
  | 'PREORDER_UPDATE';

export interface NotificationJob {
  readonly notificationId: string;
  readonly eventType: NotificationEventType;
  readonly recipientEmail: string;
  readonly payload: Record<string, unknown>;
}

export interface NotificationQueue {
  claim(limit: number): Promise<readonly NotificationJob[]>;
  markFailed(notificationId: string, errorCode: string, retryAt: Date): Promise<void>;
  markSent(notificationId: string): Promise<void>;
}

export interface EmailGateway {
  send(input: {
    readonly html: string;
    readonly subject: string;
    readonly text: string;
    readonly to: string;
  }): Promise<void>;
}

export class NotificationWorker {
  constructor(
    private readonly queue: NotificationQueue,
    private readonly email: EmailGateway,
    private readonly now: () => Date,
  ) {}

  async run(limit = 50): Promise<{ readonly failed: number; readonly sent: number }> {
    const jobs = await this.queue.claim(limit);
    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        const message = renderNotification(job.eventType, job.payload);
        await this.email.send({ ...message, to: job.recipientEmail });
        await this.queue.markSent(job.notificationId);
        sent += 1;
      } catch {
        await this.queue.markFailed(
          job.notificationId,
          'EMAIL_DELIVERY_FAILED',
          new Date(this.now().getTime() + 5 * 60_000),
        );
        failed += 1;
      }
    }
    return { failed, sent };
  }
}

export function renderNotification(type: NotificationEventType, payload: Record<string, unknown>) {
  const order = safe(payload.orderPublicNumber);
  const tracking = safe(payload.trackingCode);
  const subjects: Record<NotificationEventType, string> = {
    ACCOUNT_VERIFICATION: 'Confirma tu cuenta Sergod Store',
    PASSWORD_RESET: 'Recupera tu acceso a Sergod Store',
    ORDER_CREATED: `Pedido ${order} creado`,
    PAYMENT_SUCCEEDED: `Pago confirmado para ${order}`,
    PAYMENT_FAILED: `No pudimos confirmar el pago de ${order}`,
    ORDER_PREPARING: `${order} está en preparación`,
    ORDER_READY_FOR_PICKUP: `${order} está listo para retirar`,
    ORDER_SHIPPED: `${order} fue despachado${tracking === '' ? '' : ` · ${tracking}`}`,
    ORDER_FULFILLED: `${order} fue completado`,
    PREORDER_UPDATE: 'Actualización de tu preventa Sergod Store',
  };
  const text = `${subjects[type]}. Revisa el estado actualizado en tu cuenta.`;
  return {
    html: `<p>${escapeHtml(text)}</p>`,
    subject: subjects[type],
    text,
  };
}

function safe(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
