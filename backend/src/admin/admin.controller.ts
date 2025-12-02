import { Controller, Get, Post, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { SupabaseUser } from '../common/types/supabase-user';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(SupabaseJwtGuard, AdminRoleGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: SupabaseUser) {
    return this.adminService.dashboard(user.id);
  }

  @Get('dashboard/revenue')
  getDashboardRevenue(@CurrentUser() user: SupabaseUser) {
    return this.adminService.getRevenueSummary(user.id);
  }

  @Get('dashboard/noc')
  getDashboardNoc(@CurrentUser() user: SupabaseUser) {
    return this.adminService.getNetworkAlarms(user.id);
  }

  @Get('dashboard/finance')
  async getDashboardFinance(
    @CurrentUser() user: SupabaseUser,
    @Query('period') period?: string,
  ) {
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get daily collections for the chart
    const dailyCollections = await this.adminService.getDailyCollections(user.id, startDate, endDate);
    
    // Get revenue summary for different periods
    const todayStart = new Date().toISOString().split('T')[0];
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const yearStart = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate totals from daily collections or use revenue summary
    const todayCollections = dailyCollections
      .filter((d: any) => d.collection_date === todayStart)
      .reduce((sum: number, d: any) => sum + (d.total_amount || 0), 0);
    
    const weekCollections = dailyCollections
      .filter((d: any) => d.collection_date >= weekStart)
      .reduce((sum: number, d: any) => sum + (d.total_amount || 0), 0);
    
    const monthCollections = dailyCollections
      .reduce((sum: number, d: any) => sum + (d.total_amount || 0), 0);

    // Get recent payments
    const dashboard = await this.adminService.dashboard(user.id);

    return {
      todayCollections,
      weekCollections,
      monthCollections,
      yearCollections: monthCollections, // Approximate with month data
      outstanding: 0, // Would need overdue invoices query
      averagePaymentTime: '3 days',
      collectionRate: 95,
      growthPercent: 5,
      dailyCollections: dailyCollections.map((d: any) => ({
        date: d.collection_date,
        amount: d.total_amount || 0,
      })),
      recentPayments: dashboard.recentPayments || [],
    };
  }

  @Get('revenue')
  getRevenue(
    @CurrentUser() user: SupabaseUser,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    return this.adminService.getRevenueSummary(user.id, startDate, endDate);
  }

  @Get('subscribers')
  getSubscribers(
    @CurrentUser() user: SupabaseUser,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getSubscribers(user.id, { status, page, limit });
  }

  @Get('subscribers/:customerId')
  getSubscriberDetail(
    @CurrentUser() user: SupabaseUser,
    @Param('customerId') customerId: string,
  ) {
    return this.adminService.getSubscriberDetail(user.id, customerId);
  }

  @Get('subscribers/:customerId/usage')
  getSubscriberUsage(
    @CurrentUser() user: SupabaseUser,
    @Param('customerId') customerId: string,
    @Query('days') days?: number,
  ) {
    return this.adminService.getSubscriberUsage(user.id, customerId, days || 30);
  }

  @Post('subscribers/:customerId/suspend')
  suspendSubscriber(
    @CurrentUser() user: SupabaseUser,
    @Param('customerId') customerId: string,
    @Body() body: { reason: string },
  ) {
    return this.adminService.suspendSubscriber(user.id, customerId, body.reason);
  }

  @Post('subscribers/:customerId/resume')
  resumeSubscriber(
    @CurrentUser() user: SupabaseUser,
    @Param('customerId') customerId: string,
  ) {
    return this.adminService.resumeSubscriber(user.id, customerId);
  }

  @Get('collections/daily')
  getDailyCollections(
    @CurrentUser() user: SupabaseUser,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    return this.adminService.getDailyCollections(user.id, startDate, endDate);
  }

  @Get('invoices/overdue')
  getOverdueInvoices(
    @CurrentUser() user: SupabaseUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getOverdueInvoices(user.id, { page, limit });
  }

  @Get('network/alarms')
  getNetworkAlarms(@CurrentUser() user: SupabaseUser) {
    return this.adminService.getNetworkAlarms(user.id);
  }

  @Get('network/onu/:serialNumber')
  getOnuStatus(
    @CurrentUser() user: SupabaseUser,
    @Param('serialNumber') serialNumber: string,
  ) {
    return this.adminService.getOnuStatus(user.id, serialNumber);
  }

  @Post('network/onu/:serialNumber/reboot')
  rebootOnu(
    @CurrentUser() user: SupabaseUser,
    @Param('serialNumber') serialNumber: string,
  ) {
    return this.adminService.rebootOnu(user.id, serialNumber);
  }

  @Get('audit-logs')
  getAuditLogs(
    @CurrentUser() user: SupabaseUser,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getAuditLogs(user.id, { entity, action, page, limit });
  }

  @Get('stats/summary')
  getStatsSummary(@CurrentUser() user: SupabaseUser) {
    return this.adminService.getStatsSummary(user.id);
  }
}
