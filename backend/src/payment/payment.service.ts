import { createHmac } from 'node:crypto';

import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import axios from 'axios';

import configuration from '../config/configuration';
import { SupabaseClientService } from '../database/supabase-client.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly supabase: SupabaseClientService,
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
  ) {}

  async createIntent(dto: CreatePaymentIntentDto, userId: string) {
    const client = this.supabase.getClient();
    const { data: invoice, error } = await client
      .from('billing_invoices_view')
      .select('*')
      .eq('id', dto.invoiceId)
      .eq('user_id', userId)
      .single();
    if (error || !invoice) {
      throw new UnprocessableEntityException('Invoice not accessible');
    }

    // Persist payment intent row (RLS enforced via service role key)
    const { data: intent } = await client
      .from('payments')
      .insert({
        invoice_id: dto.invoiceId,
        gateway: dto.gateway,
        status: 'initiated',
        amount: invoice.amount_due,
      })
      .select('*')
      .single();

    const redirectUrl = this.buildGatewayRedirect(dto.gateway, intent.id, invoice.amount_due);
    return { redirectUrl, paymentId: intent.id };
  }

  async handleWebhook(payload: { rawBody: any; signature: string; headers: any }) {
    if (!this.verifySignature(payload.rawBody, payload.signature)) {
      throw new UnprocessableEntityException('Invalid gateway signature');
    }
    // TODO: Map gateway payload -> internal payment/invoice update with idempotency lock.
  }

  private verifySignature(body: any, signature?: string) {
    if (!signature) return false;
    const secret = this.config.payment.webhookSecret;
    const digest = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    return digest === signature;
  }

  private buildGatewayRedirect(gateway: string, paymentId: string, amount: number) {
    // TODO: integrate real gateway SDKs. Placeholder for PayFast signature
    const base = this.config.payment.payfast.merchantId;
    return `https://secure.payfast.co.za/eng/process?merchant_id=${base}&amount=${amount}&custom_str1=${paymentId}&signature=tbd`;
  }
}
