import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';
import { CreateTicketDto, AddMessageDto, UpdateTicketStatusDto } from './dto/support.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly supabase: SupabaseClientService) {}

  async createTicket(userId: string, dto: CreateTicketDto) {
    const client = this.supabase.getClient();

    // Get customer ID
    const { data: customer, error: customerError } = await client
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (customerError || !customer) {
      throw new NotFoundException('Customer not found');
    }

    // Create ticket using RPC function
    const { data: ticketId, error } = await client.rpc('create_support_ticket', {
      p_customer_id: customer.id,
      p_subject: dto.subject,
      p_category: dto.category,
      p_priority: dto.priority || 'normal',
      p_message: dto.message,
    });

    if (error) {
      this.logger.error('Failed to create ticket', error);
      throw error;
    }

    // Fetch the created ticket
    const { data: ticket } = await client
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    return ticket;
  }

  async getTickets(userId: string, status?: string) {
    const client = this.supabase.getClient();

    // Get customer ID
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!customer) {
      return [];
    }

    let query = client
      .from('support_tickets')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  async getTicketDetail(userId: string, ticketId: string) {
    const client = this.supabase.getClient();

    // Get customer ID
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Get ticket
    const { data: ticket, error } = await client
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .eq('customer_id', customer.id)
      .single();

    if (error || !ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Get messages (excluding internal notes for customers)
    const { data: messages } = await client
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });

    return {
      ticket,
      messages: messages || [],
    };
  }

  async addMessage(userId: string, ticketId: string, dto: AddMessageDto) {
    const client = this.supabase.getClient();

    // Get customer ID
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Verify ticket belongs to customer
    const { data: ticket, error: ticketError } = await client
      .from('support_tickets')
      .select('id, status')
      .eq('id', ticketId)
      .eq('customer_id', customer.id)
      .single();

    if (ticketError || !ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.status === 'closed') {
      throw new ForbiddenException('Cannot add message to closed ticket');
    }

    // Add message
    const { data: message, error } = await client
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: customer.id,
        sender_type: 'customer',
        message: dto.message,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // Update ticket status if it was waiting for customer
    if (ticket.status === 'waiting_customer') {
      await client
        .from('support_tickets')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', ticketId);
    }

    return message;
  }

  // Admin methods
  async getAllTickets(adminUserId: string, options: { status?: string; page?: number; limit?: number }) {
    const client = this.supabase.getClient();

    // Verify admin role
    const { data: role } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .maybeSingle();

    if (!role) {
      throw new ForbiddenException('Admin access required');
    }

    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    let query = client
      .from('support_tickets_view')
      .select('*', { count: 'exact' });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getTicketDetailAdmin(adminUserId: string, ticketId: string) {
    const client = this.supabase.getClient();

    // Verify admin role
    const { data: role } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .maybeSingle();

    if (!role) {
      throw new ForbiddenException('Admin access required');
    }

    const { data: ticket, error } = await client
      .from('support_tickets_view')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (error || !ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const { data: messages } = await client
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    return {
      ticket,
      messages: messages || [],
    };
  }

  async addAgentMessage(adminUserId: string, ticketId: string, message: string, isInternal: boolean = false) {
    const client = this.supabase.getClient();

    // Verify admin role
    const { data: role } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .maybeSingle();

    if (!role) {
      throw new ForbiddenException('Admin access required');
    }

    const { data: messageData, error } = await client
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: adminUserId,
        sender_type: 'agent',
        message,
        is_internal: isInternal,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // Update ticket status to waiting_customer if responding to customer
    if (!isInternal) {
      await client
        .from('support_tickets')
        .update({ status: 'waiting_customer', updated_at: new Date().toISOString() })
        .eq('id', ticketId);
    }

    return messageData;
  }

  async updateTicketStatus(adminUserId: string, ticketId: string, dto: UpdateTicketStatusDto) {
    const client = this.supabase.getClient();

    // Verify admin role
    const { data: role } = await client
      .from('admin_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .maybeSingle();

    if (!role) {
      throw new ForbiddenException('Admin access required');
    }

    const updates: Record<string, any> = {
      status: dto.status,
      updated_at: new Date().toISOString(),
    };

    if (dto.assignedTo) {
      updates.assigned_to = dto.assignedTo;
    }

    if (dto.status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
    }

    if (dto.status === 'closed') {
      updates.closed_at = new Date().toISOString();
    }

    const { data, error } = await client
      .from('support_tickets')
      .update(updates)
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // Audit log
    await client.from('audit_logs').insert({
      actor_user_id: adminUserId,
      action: 'ticket_status_updated',
      entity: 'support_ticket',
      entity_id: ticketId,
      metadata: { new_status: dto.status },
    });

    return data;
  }
}
