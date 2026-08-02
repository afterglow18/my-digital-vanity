/**
 * Stripe webhook handlers removed.
 * Payments are handled exclusively via RevenueCat / Apple In-App Purchases.
 */
export class WebhookHandlers {
  static async processWebhook(_payload: Buffer, _signature: string): Promise<void> {
    throw new Error("Stripe webhooks have been removed.");
  }
}
