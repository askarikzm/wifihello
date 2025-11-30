import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { SupabaseUser } from '../common/types/supabase-user';
import { SupportService } from './support.service';
import { CreateTicketDto, AddMessageDto, UpdateTicketStatusDto } from './dto/support.dto';

@Controller('support')
@UseGuards(SupabaseJwtGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // Customer endpoints
  @Post('tickets')
  createTicket(@CurrentUser() user: SupabaseUser, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(user.id, dto);
  }

  @Get('tickets')
  getTickets(@CurrentUser() user: SupabaseUser, @Query('status') status?: string) {
    return this.supportService.getTickets(user.id, status);
  }

  @Get('tickets/:ticketId')
  getTicketDetail(@CurrentUser() user: SupabaseUser, @Param('ticketId') ticketId: string) {
    return this.supportService.getTicketDetail(user.id, ticketId);
  }

  @Post('tickets/:ticketId/messages')
  addMessage(
    @CurrentUser() user: SupabaseUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: AddMessageDto,
  ) {
    return this.supportService.addMessage(user.id, ticketId, dto);
  }

  // Admin endpoints
  @Get('admin/tickets')
  getAllTickets(
    @CurrentUser() user: SupabaseUser,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.supportService.getAllTickets(user.id, { status, page, limit });
  }

  @Get('admin/tickets/:ticketId')
  getTicketDetailAdmin(@CurrentUser() user: SupabaseUser, @Param('ticketId') ticketId: string) {
    return this.supportService.getTicketDetailAdmin(user.id, ticketId);
  }

  @Post('admin/tickets/:ticketId/messages')
  addAgentMessage(
    @CurrentUser() user: SupabaseUser,
    @Param('ticketId') ticketId: string,
    @Body() body: { message: string; isInternal?: boolean },
  ) {
    return this.supportService.addAgentMessage(user.id, ticketId, body.message, body.isInternal);
  }

  @Post('admin/tickets/:ticketId/status')
  updateTicketStatus(
    @CurrentUser() user: SupabaseUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateTicketStatus(user.id, ticketId, dto);
  }
}
