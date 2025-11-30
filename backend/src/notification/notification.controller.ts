import { Controller, Post, Body, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { NotificationService, NotificationType } from './notification.service';

@Controller('notifications')
@UseGuards(SupabaseJwtGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('send')
  async sendNotification(
    @CurrentUser() user: any,
    @Body() body: {
      recipient: string;
      type: NotificationType;
      subject?: string;
      body: string;
      customerId?: string;
    },
  ) {
    // This endpoint should be admin-only in production
    const success = await this.notificationService.send({
      recipient: body.recipient,
      type: body.type,
      subject: body.subject,
      body: body.body,
      customerId: body.customerId,
    });

    return { success };
  }

  @Post('trigger')
  async triggerNotification(
    @CurrentUser() user: any,
    @Body() body: {
      trigger: string;
      data: Record<string, any>;
    },
  ) {
    await this.notificationService.triggerNotification(
      body.trigger as any,
      body.data,
    );
    return { success: true };
  }

  @Post('send-overdue-reminders')
  async sendOverdueReminders(@CurrentUser() user: any) {
    const count = await this.notificationService.sendOverdueReminders();
    return { success: true, count };
  }
}
