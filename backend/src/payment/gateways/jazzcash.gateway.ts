import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface JazzCashPaymentData {
  amount: number;
  billReference: string;
  description: string;
  mobileNumber?: string;
  cnic?: string;
  returnUrl: string;
}

export interface JazzCashWebhookPayload {
  pp_ResponseCode: string;
  pp_ResponseMessage: string;
  pp_Amount: string;
  pp_TxnRefNo: string;
  pp_BillReference: string;
  pp_SecureHash: string;
  pp_TxnDateTime: string;
  pp_MerchantID: string;
}

@Injectable()
export class JazzCashGateway {
  private readonly logger = new Logger(JazzCashGateway.name);
  private readonly sandboxUrl = 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform';
  private readonly productionUrl = 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform';

  constructor(private readonly configService: ConfigService) {}

  generatePaymentForm(data: JazzCashPaymentData): { url: string; formData: Record<string, string> } {
    const merchantId = this.configService.get<string>('JAZZCASH_MERCHANT_ID') || '';
    const password = this.configService.get<string>('JAZZCASH_PASSWORD') || '';
    const integritySalt = this.configService.get<string>('JAZZCASH_INTEGRITY_SALT') || '';

    const txnDateTime = this.formatDateTime(new Date());
    const expiryDateTime = this.formatDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 hours

    const formData: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: merchantId,
      pp_Password: password,
      pp_TxnRefNo: `T${Date.now()}`,
      pp_Amount: Math.round(data.amount * 100).toString(), // Amount in paisa
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: txnDateTime,
      pp_TxnExpiryDateTime: expiryDateTime,
      pp_BillReference: data.billReference,
      pp_Description: data.description,
      pp_ReturnURL: data.returnUrl,
    };

    if (data.mobileNumber) {
      formData.pp_MobileNumber = data.mobileNumber;
    }
    if (data.cnic) {
      formData.pp_CNIC = data.cnic;
    }

    // Generate secure hash
    formData.pp_SecureHash = this.generateSecureHash(formData, integritySalt);

    return {
      url: this.isProduction() ? this.productionUrl : this.sandboxUrl,
      formData,
    };
  }

  generateSecureHash(params: Record<string, string>, integritySalt: string): string {
    // JazzCash requires sorted parameters for hash
    const sortedKeys = Object.keys(params)
      .filter(key => key.startsWith('pp_') && key !== 'pp_SecureHash')
      .sort();

    const hashString = integritySalt + '&' + sortedKeys.map(key => params[key]).join('&');
    
    return createHmac('sha256', integritySalt)
      .update(hashString)
      .digest('hex')
      .toUpperCase();
  }

  verifyWebhookSignature(payload: JazzCashWebhookPayload): boolean {
    const integritySalt = this.configService.get<string>('JAZZCASH_INTEGRITY_SALT') || '';
    const { pp_SecureHash, ...params } = payload;

    const calculatedHash = this.generateSecureHash(params as unknown as Record<string, string>, integritySalt);
    
    const isValid = calculatedHash === pp_SecureHash;

    if (!isValid) {
      this.logger.warn('JazzCash signature verification failed', {
        expected: calculatedHash,
        received: pp_SecureHash,
      });
    }

    return isValid;
  }

  parseWebhookPayload(body: Record<string, any>): JazzCashWebhookPayload {
    return {
      pp_ResponseCode: body.pp_ResponseCode,
      pp_ResponseMessage: body.pp_ResponseMessage,
      pp_Amount: body.pp_Amount,
      pp_TxnRefNo: body.pp_TxnRefNo,
      pp_BillReference: body.pp_BillReference,
      pp_SecureHash: body.pp_SecureHash,
      pp_TxnDateTime: body.pp_TxnDateTime,
      pp_MerchantID: body.pp_MerchantID,
    };
  }

  isPaymentSuccessful(responseCode: string): boolean {
    return responseCode === '000';
  }

  isPaymentPending(responseCode: string): boolean {
    return responseCode === '124'; // Pending
  }

  isPaymentFailed(responseCode: string): boolean {
    return !this.isPaymentSuccessful(responseCode) && !this.isPaymentPending(responseCode);
  }

  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
