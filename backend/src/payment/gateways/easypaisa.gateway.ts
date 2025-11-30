import { createHmac, createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EasyPaisaPaymentData {
  amount: number;
  orderId: string;
  accountNumber?: string;
  emailAddress?: string;
  mobileNumber?: string;
  returnUrl: string;
}

export interface EasyPaisaWebhookPayload {
  orderId: string;
  transactionId: string;
  transactionStatus: string;
  transactionAmount: string;
  transactionDateTime: string;
  responseCode: string;
  responseDesc: string;
  token: string;
}

@Injectable()
export class EasyPaisaGateway {
  private readonly logger = new Logger(EasyPaisaGateway.name);
  private readonly sandboxUrl = 'https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction';
  private readonly productionUrl = 'https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction';
  private readonly hostedCheckoutUrl = 'https://easypay.easypaisa.com.pk/tpg';

  constructor(private readonly configService: ConfigService) {}

  generatePaymentRequest(data: EasyPaisaPaymentData): { url: string; formData: Record<string, string> } {
    const storeId = this.configService.get<string>('EASYPAISA_STORE_ID') || '';
    const hashKey = this.configService.get<string>('EASYPAISA_HASH_KEY') || '';

    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const formattedExpiry = this.formatExpiryDate(expiryDate);

    const formData: Record<string, string> = {
      storeId,
      amount: data.amount.toFixed(2),
      postBackURL: data.returnUrl,
      orderRefNum: data.orderId,
      expiryDate: formattedExpiry,
      autoRedirect: '1',
      paymentMethod: 'MA_PAYMENT_METHOD', // Mobile Account
      emailAddr: data.emailAddress || '',
      mobileNum: data.mobileNumber || '',
    };

    // Generate hash
    const hashString = `${storeId}${data.amount.toFixed(2)}${data.orderId}${formattedExpiry}${hashKey}`;
    formData.merchantHashedReq = createHash('sha256').update(hashString).digest('hex');

    return {
      url: this.hostedCheckoutUrl,
      formData,
    };
  }

  verifyWebhookSignature(payload: EasyPaisaWebhookPayload): boolean {
    const hashKey = this.configService.get<string>('EASYPAISA_HASH_KEY') || '';
    
    // EasyPaisa uses token-based verification
    const expectedToken = this.generateResponseToken(payload, hashKey);
    
    const isValid = expectedToken === payload.token;

    if (!isValid) {
      this.logger.warn('EasyPaisa signature verification failed', {
        expected: expectedToken,
        received: payload.token,
      });
    }

    return isValid;
  }

  private generateResponseToken(payload: EasyPaisaWebhookPayload, hashKey: string): string {
    const hashString = `${payload.orderId}${payload.transactionId}${payload.transactionAmount}${payload.transactionStatus}${hashKey}`;
    return createHash('sha256').update(hashString).digest('hex');
  }

  parseWebhookPayload(body: Record<string, any>): EasyPaisaWebhookPayload {
    return {
      orderId: body.orderId || body.orderRefNum,
      transactionId: body.transactionId,
      transactionStatus: body.transactionStatus,
      transactionAmount: body.transactionAmount,
      transactionDateTime: body.transactionDateTime,
      responseCode: body.responseCode,
      responseDesc: body.responseDesc,
      token: body.token,
    };
  }

  isPaymentSuccessful(status: string): boolean {
    return status === '0000' || status.toUpperCase() === 'SUCCESS';
  }

  isPaymentPending(status: string): boolean {
    return status === '0001' || status.toUpperCase() === 'PENDING';
  }

  isPaymentFailed(status: string): boolean {
    return !this.isPaymentSuccessful(status) && !this.isPaymentPending(status);
  }

  private formatExpiryDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day} ${hours}${minutes}${seconds}`;
  }
}
