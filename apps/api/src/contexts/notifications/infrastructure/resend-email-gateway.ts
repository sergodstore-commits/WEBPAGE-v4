import type { EmailGateway } from '../application/notification-service.js';

export class ResendEmailGateway implements EmailGateway {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | null,
  ) {}

  async send(input: {
    readonly html: string;
    readonly idempotencyKey: string;
    readonly subject: string;
    readonly text: string;
    readonly to: string;
  }): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: this.from,
        html: input.html,
        ...(this.replyTo === null ? {} : { reply_to: this.replyTo }),
        subject: input.subject,
        text: input.text,
        to: [input.to],
      }),
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Transactional email provider returned HTTP ${response.status}.`);
  }
}
