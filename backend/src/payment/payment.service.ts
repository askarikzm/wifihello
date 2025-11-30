import { createHmac } from 'node:crypto';

import {
  Injectable,
  UnprocessableEntityException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SupabaseClientService } from '../database/supabase-client.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PayFastGateway, PayFastWebhookPayload } from './gateways/payfast.gateway';
import { JazzCashGateway, JazzCashWebhookPayload } from './gateways/jazzcash.gateway';
import { EasyPaisaGateway, EasyPaisaWebhookPayload } from './gateways/easypaisa.gateway';

export type PaymentStatus = 'initiated' | 'pending' | 'success' | 'failed' | 'refunded';
export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';

interface PaymentRecord {
  id: string;
  invoice_id: string;
  customer_id: string;
  gateway: string;
  amount: number;
  status: PaymentStatus;
  reference?: string;
  gateway_reference?: string;
  initiated_at: string;
  completed_at?: string;
}

interface WebhookPayload {
  rawBody: any;
  signature?: string;
  headers: Record<string, string>;
  gateway: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly configService: ConfigService,
    private readonly payFastGateway: PayFastGateway,
    private readonly jazzCashGateway: JazzCashGateway,
    private readonly easyPaisaGateway: EasyPaisaGateway,
  ) {}

  async createIntent(dto: CreatePaymentIntentDto, userId: string) {
    const client = this.supabase.getClient();

    // Fetch invoice with user verification via RLS view
    const { data: invoice, error: invoiceError } = await client
      .from('billing_invoices_view')
      .select('*')
      .eq('id', dto.invoiceId)
      .eq('user_id', userId)
      .single();

    if (invoiceError || !invoice) {
      this.logger.warn('Invoice not accessible', { invoiceId: dto.invoiceId, userId });
      throw new UnprocessableEntityException('Invoice not accessible');
    }

    if (invoice.status === 'paid') {
      throw new ConflictException('Invoice already paid');
    }

    // Get customer info
    const { data: customer } = await client
      .from('customers')
      .select('id, full_name, phone')
      .eq('user_id', userId)
      .single();

    if (!customer) {
      throw new UnprocessableEntityException('Customer not found');
    }

    // Check for existing pending payment (idempotency)
    const { data: existingPayment } = await client
      .from('payments')
      .select('*')
      .eq('invoice_id', dto.invoiceId)
      .eq('gateway', dto.gateway)
      .in('status', ['initiated', 'pending'])
      .single();

    if (existingPayment) {
      const redirectUrl = await this.buildGatewayRedirect(
        dto.gateway,
        existingPayment.id,
        existingPayment.amount,
        invoice,
        customer,
        dto.callbackUrl,
      );
      return { redirectUrl, paymentId: existingPayment.id, existing: true };
    }

    // Create new payment record
    const { data: payment, error: paymentError } = await client
      .from('payments')
      .insert({
        invoice_id: dto.invoiceId,
        customer_id: customer.id,
        gateway: dto.gateway,
        status: 'initiated',
        amount: invoice.amount,
        reference: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })
      .select('*')
      .single();

    if (paymentError) {
      this.logger.error('Failed to create payment', paymentError);
      throw new UnprocessableEntityException('Failed to create payment');
    }

    // Write audit log
    await this.writeAuditLog(userId, 'payment_initiated', 'payment', payment.id, {
      invoice_id: dto.invoiceId,
      gateway: dto.gateway,
      amount: invoice.amount,
    });

    const redirectUrl = await this.buildGatewayRedirect(
      dto.gateway,
      payment.id,
      invoice.amount,
      invoice,
      customer,
      dto.callbackUrl,
    );

    return { redirectUrl, paymentId: payment.id };
  }

  async handleWebhook(payload: WebhookPayload) {
    const { gateway, rawBody, signature } = payload;
    this.logger.log('Received webhook', { gateway, hasSignature: !!signature });

    switch (gateway) {
      case 'payfast':
        return this.handlePayFastWebhook(rawBody);
      case 'jazzcash':
        return this.handleJazzCashWebhook(rawBody);
      case 'easypaisa':
        return this.handleEasyPaisaWebhook(rawBody);
      default:
        throw new BadRequestException('Unknown gateway');
    }
  }

  private async handlePayFastWebhook(body: Record<string, any>) {
    const payload = this.payFastGateway.parseWebhookPayload(body);

    if (!this.payFastGateway.verifyWebhookSignature(payload)) {
      this.logger.warn('PayFast signature verification failed');
      throw new UnprocessableEntityException('Invalid signature');
    }

    const paymentId = payload.m_payment_id;
    const gatewayReference = payload.pf_payment_id;

    const payment = await this.getPaymentWithLock(paymentId);
    if (!payment) {
      throw new UnprocessableEntityException('Payment not found');
    }

    if (payment.status === 'success' || payment.status === 'failed') {
      this.logger.log('Payment already processed', { paymentId, status: payment.status });
      return { status: 'already_processed' };
    }

    const webhookAmount = parseFloat(payload.amount_gross);
    if (Math.abs(webhookAmount - payment.amount) > 0.01) {
      this.logger.error('Amount mismatch', { expected: payment.amount, received: webhookAmount });
      throw new UnprocessableEntityException('Amount mismatch');
    }

    let newStatus: PaymentStatus = 'pending';
    if (this.payFastGateway.isPaymentSuccessful(payload.payment_status)) {
      newStatus = 'success';
    } else if (this.payFastGateway.isPaymentFailed(payload.payment_status)) {
      newStatus = 'failed';
    }

    await this.updatePaymentAndInvoice(payment, newStatus, gatewayReference);
    return { status: 'processed', paymentId, newStatus };
  }

  private async handleJazzCashWebhook(body: Record<string, any>) {
    const payload = this.jazzCashGateway.parseWebhookPayload(body);

    if (!this.jazzCashGateway.verifyWebhookSignature(payload)) {
      this.logger.warn('JazzCash signature verification failed');
      throw new UnprocessableEntityException('Invalid signature');
    }

    const paymentId = payload.pp_BillReference;
    const gatewayReference = payload.pp_TxnRefNo;

    const payment = await this.getPaymentWithLock(paymentId);
    if (!payment) {
      throw new UnprocessableEntityException('Payment not found');
    }

    if (payment.status === 'success' || payment.status === 'failed') {
      return { status: 'already_processed' };
    }

    const webhookAmount = parseInt(payload.pp_Amount, 10) / 100;
    if (Math.abs(webhookAmount - payment.amount) > 0.01) {
      throw new UnprocessableEntityException('Amount mismatch');
    }

    let newStatus: PaymentStatus = 'pending';
    if (this.jazzCashGateway.isPaymentSuccessful(payload.pp_ResponseCode)) {
      newStatus = 'success';
    } else if (this.jazzCashGateway.isPaymentFailed(payload.pp_ResponseCode)) {
      newStatus = 'failed';
    }

    await this.updatePaymentAndInvoice(payment, newStatus, gatewayReference);
    return { status: 'processed', paymentId, newStatus };
  }

  private async handleEasyPaisaWebhook(body: Record<string, any>) {
    const payload = this.easyPaisaGateway.parseWebhookPayload(body);

    if (!this.easyPaisaGateway.verifyWebhookSignature(payload)) {
      throw new UnprocessableEntityException('Invalid signature');
    }

    const paymentId = payload.orderId;
    const gatewayReference = payload.transactionId;

    const payment = await this.getPaymentWithLock(paymentId);
    if (!payment) {
      throw new UnprocessableEntityException('Payment not found');
    }

    if (payment.status === 'success' || payment.status === 'failed') {
      return { status: 'already_processed' };
    }

    const webhookAmount = parseFloat(payload.transactionAmount);
    if (Math.abs(webhookAmount - payment.amount) > 0.01) {
      throw new UnprocessableEntityException('Amount mismatch');
    }

    let newStatus: PaymentStatus = 'pending';
    if (this.easyPaisaGateway.isPaymentSuccessful(payload.transactionStatus)) {
      newStatus = 'success';
    } else if (this.easyPaisaGateway.isPaymentFailed(payload.transactionStatus)) {
      newStatus = 'failed';
    }

    await this.updatePaymentAndInvoice(payment, newStatus, gatewayReference);
    return { status: 'processed', paymentId, newStatus };
  }

  private async getPaymentWithLock(paymentId: string): Promise<PaymentRecord | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (error) return null;
    return data;
  }

  private async updatePaymentAndInvoice(
    payment: PaymentRecord,
    newStatus: PaymentStatus,
    gatewayReference: string,
  ) {
    const client = this.supabase.getClient();
    const now = new Date().toISOString();

    await client
      .from('payments')
      .update({
        status: newStatus,
        gateway_reference: gatewayReference,
        completed_at: newStatus === 'success' || newStatus === 'failed' ? now : null,
      })
      .eq('id', payment.id);

    if (newStatus === 'success') {
      await client.from('invoices').update({ status: 'paid' }).eq('id', payment.invoice_id);
      await client.from('transactions').insert({
        payment_id: payment.id,
        ledger_side: 'credit',
        amount: payment.amount,
        currency: 'PKR',
        description: `Payment received via ${payment.gateway}`,
      });
    }

    await this.writeAuditLog(null, 'payment_webhook_processed', 'payment', payment.id, {
      previous_status: payment.status,
      new_status: newStatus,
      gateway: payment.gateway,
      gateway_reference: gatewayReference,
    });
  }

  private async buildGatewayRedirect(
    gateway: string,
    paymentId: string,
    amount: number,
    invoice: any,
    customer: any,
    callbackUrl?: string,
  ): Promise<string> {
    const baseUrl = this.configService.get<string>('APP_BASE_URL') || 'https://localhost:3100';
    const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 'https://localhost:9000';
    const returnUrl = callbackUrl || `${baseUrl}/payments/callback`;
    const cancelUrl = `${baseUrl}/payments/cancelled`;
    const notifyUrl = `${apiBaseUrl}/payments/webhook/${gateway}`;

    switch (gateway) {
      case 'payfast': {
        const merchantId = this.configService.get<string>('PAYFAST_MERCHANT_ID') || '';
        const merchantKey = this.configService.get<string>('PAYFAST_MERCHANT_KEY') || '';
        return this.payFastGateway.generatePaymentUrl({
          merchantId,
          merchantKey,
          amount,
          itemName: `Invoice ${invoice.invoice_no}`,
          itemDescription: `Payment for ${invoice.service_name || 'ISP Services'}`,
          emailAddress: customer.email,
          cellNumber: customer.phone,
          mPaymentId: paymentId,
          returnUrl,
          cancelUrl,
          notifyUrl,
        });
      }
      case 'jazzcash': {
        const { url, formData } = this.jazzCashGateway.generatePaymentForm({
          amount,
          billReference: paymentId,
          description: `Invoice ${invoice.invoice_no}`,
          mobileNumber: customer.phone,
          returnUrl: notifyUrl,
        });
        return `${url}?${new URLSearchParams(formData).toString()}`;
      }
      case 'easypaisa': {
        const { url, formData } = this.easyPaisaGateway.generatePaymentRequest({
          amount,
          orderId: paymentId,
          emailAddress: customer.email,
          mobileNumber: customer.phone,
          returnUrl: notifyUrl,
        });
        return `${url}?${new URLSearchParams(formData).toString()}`;
      }
      default:
        throw new BadRequestException('Unsupported payment gateway');
    }
  }

  private async writeAuditLog(
    userId: string | null,
    action: string,
    entity: string,
    entityId: string,
    metadata: Record<string, any>,
  ) {
    const client = this.supabase.getClient();
    await client.from('audit_logs').insert({
      actor_user_id: userId,
      action,
      entity,
      entity_id: entityId,
      metadata,
    });
  }

  async getPaymentHistory(userId: string) {
    const client = this.supabase.getClient();
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!customer) return [];

    const { data, error } = await client
      .from('payments')
      .select(`id, gateway, amount, status, reference, gateway_reference, initiated_at, completed_at`)
      .eq('customer_id', customer.id)
      .order('initiated_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data;
  }

  async getPaymentStatus(paymentId: string, userId: string) {
    const client = this.supabase.getClient();
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!customer) throw new UnprocessableEntityException('Customer not found');

    const { data, error } = await client
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('customer_id', customer.id)
      .single();

    if (error || !data) throw new UnprocessableEntityException('Payment not found');
    return data;
  }
}
