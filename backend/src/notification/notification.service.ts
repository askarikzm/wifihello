import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { SupabaseClientService } from '../database/supabase-client.service';

export type NotificationType = 'sms' | 'email' | 'push';
export type NotificationTrigger =
  | 'invoice_generated'
  | 'payment_received'
  | 'payment_failed'
  | 'payment_overdue'
  | 'service_suspended'
  | 'service_resumed'
  | 'high_usage_alert'
  | 'onu_down'
  | 'ticket_created'
  | 'ticket_updated';

interface SendNotificationParams {
  customerId?: string;
  recipient: string;
  type: NotificationType;
  templateName?: string;
  subject?: string;
  body: string;
  variables?: Record<string, string>;
}

interface SMSProviderResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface EmailProviderResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly configService: ConfigService,
    private readonly http: HttpService,
  ) {}

  async send(params: SendNotificationParams): Promise<boolean> {
    const client = this.supabase.getClient();

    // Apply template variables
    let body = params.body;
    let subject = params.subject;
    if (params.variables) {
      for (const [key, value] of Object.entries(params.variables)) {
        body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
        if (subject) {
          subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
      }
    }

    // Create notification log
    const { data: log, error: logError } = await client
      .from('notification_logs')
      .insert({
        customer_id: params.customerId,
        type: params.type,
        recipient: params.recipient,
        subject,
        body,
        status: 'pending',
      })
      .select('id')
      .single();

    if (logError) {
      this.logger.error('Failed to create notification log', logError);
      return false;
    }

    try {
      let result: boolean;

      switch (params.type) {
        case 'sms':
          result = await this.sendSMS(params.recipient, body, log.id);
          break;
        case 'email':
          result = await this.sendEmail(params.recipient, subject || '', body, log.id);
          break;
        case 'push':
          result = await this.sendPush(params.recipient, subject || '', body, log.id);
          break;
        default:
          result = false;
      }

      return result;
    } catch (error) {
      this.logger.error('Notification send failed', error);
      await this.updateNotificationStatus(log.id, 'failed', { error: String(error) });
      return false;
    }
  }

  private async sendSMS(recipient: string, message: string, logId: string): Promise<boolean> {
    const provider = this.configService.get<string>('SMS_PROVIDER') || 'mock';

    this.logger.log('Sending SMS', { recipient, provider, logId });

    let response: SMSProviderResponse;

    switch (provider) {
      case 'zong':
        response = await this.sendViaCMPak(recipient, message);
        break;
      case 'twilio':
        response = await this.sendViaTwilio(recipient, message);
        break;
      default:
        // Mock provider for development
        response = { success: true, messageId: `mock-${Date.now()}` };
        this.logger.log('Mock SMS sent', { recipient, message: message.substring(0, 50) });
    }

    if (response.success) {
      await this.updateNotificationStatus(logId, 'sent', {
        messageId: response.messageId,
        sentAt: new Date().toISOString(),
      });
    } else {
      await this.updateNotificationStatus(logId, 'failed', { error: response.error });
    }

    return response.success;
  }

  private async sendViaCMPak(recipient: string, message: string): Promise<SMSProviderResponse> {
    const apiUrl = this.configService.get<string>('CMPAK_API_URL') || '';
    const username = this.configService.get<string>('CMPAK_USERNAME') || '';
    const password = this.configService.get<string>('CMPAK_PASSWORD') || '';
    const mask = this.configService.get<string>('CMPAK_MASK') || 'WANCOM';

    try {
      const response = await firstValueFrom(
        this.http.post(apiUrl, {
          username,
          password,
          to: recipient,
          text: message,
          mask,
        }),
      );

      return {
        success: response.data?.status === 'success',
        messageId: response.data?.messageId,
        error: response.data?.error,
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async sendViaTwilio(recipient: string, message: string): Promise<SMSProviderResponse> {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID') || '';
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || '';
    const fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER') || '';

    try {
      const response = await firstValueFrom(
        this.http.post(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          new URLSearchParams({
            To: recipient,
            From: fromNumber,
            Body: message,
          }),
          {
            auth: { username: accountSid, password: authToken },
          },
        ),
      );

      return {
        success: true,
        messageId: response.data?.sid,
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async sendEmail(recipient: string, subject: string, body: string, logId: string): Promise<boolean> {
    const provider = this.configService.get<string>('EMAIL_PROVIDER') || 'mock';

    this.logger.log('Sending email', { recipient, provider, logId });

    let response: EmailProviderResponse;

    switch (provider) {
      case 'sendgrid':
        response = await this.sendViaSendGrid(recipient, subject, body);
        break;
      case 'smtp':
        response = await this.sendViaSMTP(recipient, subject, body);
        break;
      default:
        response = { success: true, messageId: `mock-email-${Date.now()}` };
        this.logger.log('Mock email sent', { recipient, subject });
    }

    if (response.success) {
      await this.updateNotificationStatus(logId, 'sent', {
        messageId: response.messageId,
        sentAt: new Date().toISOString(),
      });
    } else {
      await this.updateNotificationStatus(logId, 'failed', { error: response.error });
    }

    return response.success;
  }

  private async sendViaSendGrid(recipient: string, subject: string, body: string): Promise<EmailProviderResponse> {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY') || '';
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@wancom.pk';

    try {
      const response = await firstValueFrom(
        this.http.post(
          'https://api.sendgrid.com/v3/mail/send',
          {
            personalizations: [{ to: [{ email: recipient }] }],
            from: { email: fromEmail },
            subject,
            content: [{ type: 'text/html', value: body }],
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        ),
      );

      return { success: true, messageId: response.headers['x-message-id'] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async sendViaSMTP(recipient: string, subject: string, body: string): Promise<EmailProviderResponse> {
    // Placeholder for nodemailer implementation
    this.logger.warn('SMTP provider not fully implemented');
    return { success: true, messageId: `smtp-${Date.now()}` };
  }

  private async sendPush(recipient: string, title: string, body: string, logId: string): Promise<boolean> {
    // Placeholder for push notification (FCM/APNS)
    this.logger.log('Push notification placeholder', { recipient, title });
    await this.updateNotificationStatus(logId, 'sent', { sentAt: new Date().toISOString() });
    return true;
  }

  private async updateNotificationStatus(
    logId: string,
    status: string,
    response: Record<string, any>,
  ): Promise<void> {
    const client = this.supabase.getClient();
    await client
      .from('notification_logs')
      .update({
        status,
        provider_response: response,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', logId);
  }

  // Trigger-based notifications
  async triggerNotification(trigger: NotificationTrigger, data: Record<string, any>): Promise<void> {
    const client = this.supabase.getClient();

    // Get template for trigger
    const { data: template } = await client
      .from('notification_templates')
      .select('*')
      .eq('name', trigger)
      .eq('is_active', true)
      .single();

    if (!template) {
      this.logger.warn('No active template for trigger', { trigger });
      return;
    }

    // Get customer contact info
    if (data.customerId) {
      const { data: customer } = await client
        .from('customers')
        .select('full_name, phone, user_id')
        .eq('id', data.customerId)
        .single();

      if (customer) {
        const variables = {
          customer_name: customer.full_name || 'Valued Customer',
          ...data,
        };

        if (template.type === 'sms' && customer.phone) {
          await this.send({
            customerId: data.customerId,
            recipient: customer.phone,
            type: 'sms',
            templateName: trigger,
            body: template.body,
            variables,
          });
        }

        if (template.type === 'email') {
          // Get email from auth.users if available
          const { data: authUser } = await client.auth.admin.getUserById(customer.user_id);
          if (authUser?.user?.email) {
            await this.send({
              customerId: data.customerId,
              recipient: authUser.user.email,
              type: 'email',
              templateName: trigger,
              subject: template.subject,
              body: template.body,
              variables,
            });
          }
        }
      }
    }
  }

  // Bulk notification for overdue invoices
  async sendOverdueReminders(): Promise<number> {
    const client = this.supabase.getClient();

    const { data: overdueInvoices } = await client
      .from('billing_invoices_view')
      .select('id, customer_id, customer_name, account_no, invoice_no, amount, due_date')
      .eq('status', 'overdue');

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return 0;
    }

    let sentCount = 0;

    for (const invoice of overdueInvoices) {
      await this.triggerNotification('payment_overdue', {
        customerId: invoice.customer_id,
        invoice_no: invoice.invoice_no,
        amount: invoice.amount,
        due_date: invoice.due_date,
      });
      sentCount++;
    }

    return sentCount;
  }
}
