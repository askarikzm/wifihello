import { createHash, createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PayFastPaymentData {
  merchantId: string;
  merchantKey: string;
  amount: number;
  itemName: string;
  itemDescription: string;
  emailAddress?: string;
  cellNumber?: string;
  mPaymentId: string; // Our internal payment ID
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}

export interface PayFastWebhookPayload {
  m_payment_id: string;
  pf_payment_id: string;
  payment_status: string;
  item_name: string;
  amount_gross: string;
  amount_fee: string;
  amount_net: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  merchant_id: string;
  signature: string;
}

@Injectable()
export class PayFastGateway {
  private readonly logger = new Logger(PayFastGateway.name);
  private readonly sandboxUrl = 'https://sandbox.payfast.co.za/eng/process';
  private readonly productionUrl = 'https://www.payfast.co.za/eng/process';
  private readonly validateUrl = 'https://www.payfast.co.za/eng/query/validate';

  constructor(private readonly configService: ConfigService) {}

  generatePaymentUrl(data: PayFastPaymentData): string {
    const params: Record<string, string> = {
      merchant_id: data.merchantId,
      merchant_key: data.merchantKey,
      return_url: data.returnUrl,
      cancel_url: data.cancelUrl,
      notify_url: data.notifyUrl,
      m_payment_id: data.mPaymentId,
      amount: data.amount.toFixed(2),
      item_name: data.itemName,
      item_description: data.itemDescription,
    };

    if (data.emailAddress) {
      params.email_address = data.emailAddress;
    }
    if (data.cellNumber) {
      params.cell_number = data.cellNumber;
    }

    // Generate signature
    const signature = this.generateSignature(params);
    params.signature = signature;

    // Build URL
    const baseUrl = this.isProduction() ? this.productionUrl : this.sandboxUrl;
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return `${baseUrl}?${queryString}`;
  }

  generateSignature(params: Record<string, string>): string {
    const passphrase = this.configService.get<string>('payment.payfast.passphrase') || '';
    
    // Sort parameters alphabetically and create param string
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
      .filter(key => key !== 'signature' && params[key] !== '')
      .map(key => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
      .join('&');

    // Add passphrase if set
    const stringToSign = passphrase ? `${paramString}&passphrase=${encodeURIComponent(passphrase)}` : paramString;

    return createHash('md5').update(stringToSign).digest('hex');
  }

  verifyWebhookSignature(payload: PayFastWebhookPayload): boolean {
    const { signature, ...params } = payload;
    
    // Recreate the signature from payload
    const calculatedSignature = this.generateSignature(params as unknown as Record<string, string>);
    
    const isValid = calculatedSignature === signature;
    
    if (!isValid) {
      this.logger.warn('PayFast signature verification failed', {
        expected: calculatedSignature,
        received: signature,
      });
    }

    return isValid;
  }

  parseWebhookPayload(body: Record<string, any>): PayFastWebhookPayload {
    return {
      m_payment_id: body.m_payment_id,
      pf_payment_id: body.pf_payment_id,
      payment_status: body.payment_status,
      item_name: body.item_name,
      amount_gross: body.amount_gross,
      amount_fee: body.amount_fee,
      amount_net: body.amount_net,
      name_first: body.name_first,
      name_last: body.name_last,
      email_address: body.email_address,
      merchant_id: body.merchant_id,
      signature: body.signature,
    };
  }

  isPaymentSuccessful(status: string): boolean {
    return status === 'COMPLETE';
  }

  isPaymentPending(status: string): boolean {
    return status === 'PENDING';
  }

  isPaymentFailed(status: string): boolean {
    return ['FAILED', 'CANCELLED'].includes(status);
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
