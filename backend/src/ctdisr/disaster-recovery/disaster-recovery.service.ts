/**
 * CTDISR-2025 Disaster Recovery Service
 * PTA Regulation: Chapter 8 - Business Continuity & Disaster Recovery
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  BusinessContinuityPlan,
  DisasterRecoveryPlan,
  BackupSchedule,
  BackupExecution,
  DrTest,
  FailoverEvent,
  RecoveryPoint,
  BcpActivation,
  DrPlanStatus,
  RecoveryPriority,
  BackupType,
  BackupStatus,
  DrTestType,
  DrTestResult,
  FailoverStatus,
  CreateBcpDto,
  CreateDrpDto,
  CreateBackupScheduleDto,
  ScheduleDrTestDto,
  InitiateFailoverDto,
  ActivateBcpDto,
  DrStatistics,
  BackupStatistics,
  RecoveryCapability,
  RecoveryStep,
  ContactInfo,
} from './types';

@Injectable()
export class DisasterRecoveryService {
  private readonly logger = new Logger(DisasterRecoveryService.name);
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============ Business Continuity Plans ============

  async createBcp(dto: CreateBcpDto, createdBy: string): Promise<BusinessContinuityPlan> {
    this.logger.log(`Creating BCP: ${dto.name}`);

    const { data: planNumber } = await this.supabase.rpc('generate_bcp_number');

    const bcpData = {
      plan_number: planNumber,
      name: dto.name,
      description: dto.description,
      status: DrPlanStatus.DRAFT,
      department: dto.department,
      scope: dto.scope,
      covered_systems: dto.coveredSystems || [],
      covered_processes: dto.coveredProcesses || [],
      rto_hours: dto.rtoHours,
      rpo_hours: dto.rpoHours,
      mtpd_hours: dto.mtpdHours,
      review_frequency_days: dto.reviewFrequencyDays || 365,
      next_review_at: new Date(Date.now() + (dto.reviewFrequencyDays || 365) * 24 * 60 * 60 * 1000).toISOString(),
      created_by: createdBy,
    };

    const { data, error } = await this.supabase
      .from('ctdisr.business_continuity_plans')
      .insert(bcpData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create BCP: ${error.message}`);
    }

    this.logger.log(`Created BCP ${planNumber}`);
    return this.mapToBcp(data);
  }

  async getBcp(id: string): Promise<BusinessContinuityPlan> {
    const { data, error } = await this.supabase
      .from('ctdisr.business_continuity_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`BCP not found: ${id}`);
    }

    return this.mapToBcp(data);
  }

  async listBcps(filters?: {
    status?: DrPlanStatus[];
    department?: string;
    overdueReview?: boolean;
  }): Promise<BusinessContinuityPlan[]> {
    let query = this.supabase.from('ctdisr.business_continuity_plans').select('*');

    if (filters?.status?.length) {
      query = query.in('status', filters.status);
    }
    if (filters?.department) {
      query = query.eq('department', filters.department);
    }
    if (filters?.overdueReview) {
      query = query.lt('next_review_at', new Date().toISOString());
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list BCPs: ${error.message}`);
    }

    return (data || []).map(this.mapToBcp);
  }

  async approveBcp(id: string, approvedBy: string): Promise<BusinessContinuityPlan> {
    const bcp = await this.getBcp(id);

    if (bcp.status !== DrPlanStatus.UNDER_REVIEW) {
      throw new BadRequestException('BCP must be under review to approve');
    }

    const { data, error } = await this.supabase
      .from('ctdisr.business_continuity_plans')
      .update({
        status: DrPlanStatus.APPROVED,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to approve BCP: ${error.message}`);
    }

    return this.mapToBcp(data);
  }

  async activateBcp(dto: ActivateBcpDto, activatedBy: string): Promise<BcpActivation> {
    const bcp = await this.getBcp(dto.bcpId);

    if (![DrPlanStatus.APPROVED, DrPlanStatus.ACTIVE].includes(bcp.status)) {
      throw new BadRequestException('BCP must be approved or active to activate');
    }

    // Update BCP status
    await this.supabase
      .from('ctdisr.business_continuity_plans')
      .update({
        status: DrPlanStatus.ACTIVE,
        last_activated_at: new Date().toISOString(),
        activation_count: bcp.activationCount + 1,
      })
      .eq('id', dto.bcpId);

    // Create activation record
    const { data, error } = await this.supabase
      .from('ctdisr.bcp_activations')
      .insert({
        bcp_id: dto.bcpId,
        activation_reason: dto.activationReason,
        severity: dto.severity,
        activated_by: activatedBy,
        affected_departments: dto.affectedDepartments || [],
        affected_processes: dto.affectedProcesses || [],
        estimated_impact: dto.estimatedImpact,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to activate BCP: ${error.message}`);
    }

    this.logger.warn(`BCP ${bcp.planNumber} activated: ${dto.activationReason}`);
    return this.mapToBcpActivation(data);
  }

  async deactivateBcp(activationId: string, deactivatedBy: string, lessonsLearned?: string): Promise<BcpActivation> {
    const { data: activation } = await this.supabase
      .from('ctdisr.bcp_activations')
      .select('*')
      .eq('id', activationId)
      .single();

    if (!activation) {
      throw new NotFoundException(`Activation not found: ${activationId}`);
    }

    const activatedAt = new Date(activation.activated_at);
    const durationHours = (Date.now() - activatedAt.getTime()) / (1000 * 60 * 60);

    const { data, error } = await this.supabase
      .from('ctdisr.bcp_activations')
      .update({
        deactivated_at: new Date().toISOString(),
        deactivated_by: deactivatedBy,
        duration_hours: Math.round(durationHours * 100) / 100,
        lessons_learned: lessonsLearned,
      })
      .eq('id', activationId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to deactivate BCP: ${error.message}`);
    }

    // Update BCP status back to approved
    await this.supabase
      .from('ctdisr.business_continuity_plans')
      .update({ status: DrPlanStatus.APPROVED })
      .eq('id', activation.bcp_id);

    this.logger.log(`BCP deactivated after ${durationHours.toFixed(2)} hours`);
    return this.mapToBcpActivation(data);
  }

  // ============ Disaster Recovery Plans ============

  async createDrp(dto: CreateDrpDto, createdBy: string): Promise<DisasterRecoveryPlan> {
    this.logger.log(`Creating DRP: ${dto.name}`);

    const { data: planNumber } = await this.supabase.rpc('generate_drp_number');

    const drpData = {
      plan_number: planNumber,
      bcp_id: dto.bcpId,
      name: dto.name,
      description: dto.description,
      status: DrPlanStatus.DRAFT,
      priority: dto.priority,
      target_systems: dto.targetSystems,
      target_assets: dto.targetAssets || [],
      primary_site: dto.primarySite,
      secondary_site: dto.secondarySite,
      rto_minutes: dto.rtoMinutes,
      rpo_minutes: dto.rpoMinutes,
      recovery_procedures: dto.recoveryProcedures,
      rollback_procedures: dto.rollbackProcedures || [],
      primary_contact: dto.primaryContact,
      escalation_contacts: dto.escalationContacts || [],
      test_frequency_days: dto.testFrequencyDays || 90,
      next_test_date: new Date(Date.now() + (dto.testFrequencyDays || 90) * 24 * 60 * 60 * 1000).toISOString(),
      created_by: createdBy,
    };

    const { data, error } = await this.supabase
      .from('ctdisr.disaster_recovery_plans')
      .insert(drpData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create DRP: ${error.message}`);
    }

    this.logger.log(`Created DRP ${planNumber}`);
    return this.mapToDrp(data);
  }

  async getDrp(id: string): Promise<DisasterRecoveryPlan> {
    const { data, error } = await this.supabase
      .from('ctdisr.disaster_recovery_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`DRP not found: ${id}`);
    }

    return this.mapToDrp(data);
  }

  async listDrps(filters?: {
    status?: DrPlanStatus[];
    priority?: RecoveryPriority[];
    bcpId?: string;
    overdueTest?: boolean;
  }): Promise<DisasterRecoveryPlan[]> {
    let query = this.supabase.from('ctdisr.disaster_recovery_plans').select('*');

    if (filters?.status?.length) {
      query = query.in('status', filters.status);
    }
    if (filters?.priority?.length) {
      query = query.in('priority', filters.priority);
    }
    if (filters?.bcpId) {
      query = query.eq('bcp_id', filters.bcpId);
    }
    if (filters?.overdueTest) {
      query = query.lt('next_test_date', new Date().toISOString());
    }

    const { data, error } = await query.order('priority').order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list DRPs: ${error.message}`);
    }

    return (data || []).map(this.mapToDrp);
  }

  // ============ DR Testing ============

  async scheduleDrTest(dto: ScheduleDrTestDto, createdBy: string): Promise<DrTest> {
    this.logger.log(`Scheduling DR test for plan ${dto.drPlanId}`);

    const { data: testNumber } = await this.supabase.rpc('generate_dr_test_number');

    const testData = {
      test_number: testNumber,
      dr_plan_id: dto.drPlanId,
      test_type: dto.testType,
      name: dto.name,
      description: dto.description,
      objectives: dto.objectives,
      scheduled_at: dto.scheduledAt.toISOString(),
      test_lead: dto.testLead,
      participants: dto.participants || [],
      scenario_description: dto.scenarioDescription,
      simulated_disaster_type: dto.simulatedDisasterType,
      created_by: createdBy,
    };

    const { data, error } = await this.supabase
      .from('ctdisr.dr_tests')
      .insert(testData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to schedule DR test: ${error.message}`);
    }

    this.logger.log(`Scheduled DR test ${testNumber} for ${dto.scheduledAt}`);
    return this.mapToDrTest(data);
  }

  async startDrTest(testId: string): Promise<DrTest> {
    const test = await this.getDrTest(testId);

    const { data, error } = await this.supabase
      .from('ctdisr.dr_tests')
      .update({
        started_at: new Date().toISOString(),
      })
      .eq('id', testId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to start DR test: ${error.message}`);
    }

    this.logger.log(`Started DR test ${test.testNumber}`);
    return this.mapToDrTest(data);
  }

  async completeDrTest(
    testId: string,
    result: DrTestResult,
    actualRtoMinutes: number,
    actualRpoMinutes: number,
    findings?: string,
  ): Promise<DrTest> {
    const test = await this.getDrTest(testId);
    const drp = await this.getDrp(test.drPlanId);

    const startedAt = test.startedAt || new Date();
    const durationMinutes = Math.round((Date.now() - startedAt.getTime()) / 60000);

    const { data, error } = await this.supabase
      .from('ctdisr.dr_tests')
      .update({
        completed_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        result,
        actual_rto_minutes: actualRtoMinutes,
        actual_rpo_minutes: actualRpoMinutes,
        rto_met: actualRtoMinutes <= drp.rtoMinutes,
        rpo_met: actualRpoMinutes <= drp.rpoMinutes,
        findings,
      })
      .eq('id', testId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to complete DR test: ${error.message}`);
    }

    // Update DRP with test results
    await this.supabase
      .from('ctdisr.disaster_recovery_plans')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_result: result,
        next_test_date: new Date(Date.now() + drp.testFrequencyDays * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', test.drPlanId);

    this.logger.log(`Completed DR test ${test.testNumber} with result: ${result}`);
    return this.mapToDrTest(data);
  }

  async getDrTest(id: string): Promise<DrTest> {
    const { data, error } = await this.supabase
      .from('ctdisr.dr_tests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`DR test not found: ${id}`);
    }

    return this.mapToDrTest(data);
  }

  async listDrTests(filters?: {
    drPlanId?: string;
    testType?: DrTestType[];
    result?: DrTestResult[];
    fromDate?: Date;
    toDate?: Date;
  }): Promise<DrTest[]> {
    let query = this.supabase.from('ctdisr.dr_tests').select('*');

    if (filters?.drPlanId) {
      query = query.eq('dr_plan_id', filters.drPlanId);
    }
    if (filters?.testType?.length) {
      query = query.in('test_type', filters.testType);
    }
    if (filters?.result?.length) {
      query = query.in('result', filters.result);
    }
    if (filters?.fromDate) {
      query = query.gte('scheduled_at', filters.fromDate.toISOString());
    }
    if (filters?.toDate) {
      query = query.lte('scheduled_at', filters.toDate.toISOString());
    }

    const { data, error } = await query.order('scheduled_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list DR tests: ${error.message}`);
    }

    return (data || []).map(this.mapToDrTest);
  }

  // ============ Failover Management ============

  async initiateFailover(dto: InitiateFailoverDto, triggeredBy: string): Promise<FailoverEvent> {
    this.logger.warn(`Initiating failover for DRP ${dto.drPlanId}`);

    const drp = await this.getDrp(dto.drPlanId);

    const { data: eventNumber } = await this.supabase.rpc('generate_failover_event_number');

    const eventData = {
      event_number: eventNumber,
      dr_plan_id: dto.drPlanId,
      event_type: dto.eventType,
      status: FailoverStatus.INITIATING,
      source_site: drp.primarySite,
      target_site: dto.targetSite,
      initiated_at: new Date().toISOString(),
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      trigger_reason: dto.triggerReason,
      systems_affected: drp.targetSystems,
      services_affected: [],
      status_updates: [{
        timestamp: new Date().toISOString(),
        status: FailoverStatus.INITIATING,
        message: `Failover initiated: ${dto.triggerReason}`,
        updatedBy: triggeredBy,
      }],
    };

    const { data, error } = await this.supabase
      .from('ctdisr.failover_events')
      .insert(eventData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to initiate failover: ${error.message}`);
    }

    this.logger.warn(`Failover ${eventNumber} initiated from ${drp.primarySite} to ${dto.targetSite}`);
    return this.mapToFailoverEvent(data);
  }

  async updateFailoverStatus(
    eventId: string,
    status: FailoverStatus,
    message: string,
    updatedBy: string,
  ): Promise<FailoverEvent> {
    const event = await this.getFailoverEvent(eventId);

    const statusUpdate = {
      timestamp: new Date().toISOString(),
      status,
      message,
      updatedBy,
    };

    const updateData: Record<string, unknown> = {
      status,
      status_updates: [...event.statusUpdates, statusUpdate],
    };

    if (status === FailoverStatus.ACTIVE) {
      updateData.activated_at = new Date().toISOString();
    }
    if (status === FailoverStatus.STANDBY && event.status === FailoverStatus.FAILING_BACK) {
      updateData.failback_at = new Date().toISOString();
      updateData.completed_at = new Date().toISOString();
      
      // Calculate downtime
      if (event.initiatedAt) {
        updateData.actual_downtime_seconds = Math.round(
          (Date.now() - event.initiatedAt.getTime()) / 1000
        );
      }
    }

    const { data, error } = await this.supabase
      .from('ctdisr.failover_events')
      .update(updateData)
      .eq('id', eventId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update failover status: ${error.message}`);
    }

    this.logger.log(`Updated failover ${event.eventNumber} to status: ${status}`);
    return this.mapToFailoverEvent(data);
  }

  async getFailoverEvent(id: string): Promise<FailoverEvent> {
    const { data, error } = await this.supabase
      .from('ctdisr.failover_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Failover event not found: ${id}`);
    }

    return this.mapToFailoverEvent(data);
  }

  async listFailoverEvents(filters?: {
    drPlanId?: string;
    status?: FailoverStatus[];
    eventType?: string;
  }): Promise<FailoverEvent[]> {
    let query = this.supabase.from('ctdisr.failover_events').select('*');

    if (filters?.drPlanId) {
      query = query.eq('dr_plan_id', filters.drPlanId);
    }
    if (filters?.status?.length) {
      query = query.in('status', filters.status);
    }
    if (filters?.eventType) {
      query = query.eq('event_type', filters.eventType);
    }

    const { data, error } = await query.order('initiated_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list failover events: ${error.message}`);
    }

    return (data || []).map(this.mapToFailoverEvent);
  }

  // ============ Statistics ============

  async getDrStatistics(): Promise<DrStatistics> {
    const [bcps, drps, tests] = await Promise.all([
      this.supabase.from('ctdisr.business_continuity_plans').select('*'),
      this.supabase.from('ctdisr.disaster_recovery_plans').select('*'),
      this.supabase.from('ctdisr.dr_tests')
        .select('*')
        .gte('scheduled_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const bcpData = bcps.data || [];
    const drpData = drps.data || [];
    const testData = tests.data || [];

    const completedTests = testData.filter((t) => t.result);
    const passedTests = completedTests.filter((t) => 
      [DrTestResult.PASSED, DrTestResult.PASSED_WITH_ISSUES].includes(t.result)
    );

    const rtoAchievements = completedTests
      .filter((t) => t.rto_met !== null)
      .map((t) => t.rto_met ? 100 : 0);
    
    const rpoAchievements = completedTests
      .filter((t) => t.rpo_met !== null)
      .map((t) => t.rpo_met ? 100 : 0);

    return {
      totalBcps: bcpData.length,
      activeBcps: bcpData.filter((b) => b.status === DrPlanStatus.ACTIVE).length,
      totalDrps: drpData.length,
      activeDrps: drpData.filter((d) => [DrPlanStatus.APPROVED, DrPlanStatus.ACTIVE].includes(d.status)).length,
      testsThisYear: testData.length,
      testPassRate: completedTests.length > 0 
        ? Math.round((passedTests.length / completedTests.length) * 100) 
        : 0,
      avgRtoAchievement: rtoAchievements.length > 0
        ? Math.round(rtoAchievements.reduce((a, b) => a + b, 0) / rtoAchievements.length)
        : 0,
      avgRpoAchievement: rpoAchievements.length > 0
        ? Math.round(rpoAchievements.reduce((a, b) => a + b, 0) / rpoAchievements.length)
        : 0,
      overduePlansReview: bcpData.filter((b) => 
        b.next_review_at && new Date(b.next_review_at) < new Date()
      ).length,
      overdueTests: drpData.filter((d) => 
        d.next_test_date && new Date(d.next_test_date) < new Date()
      ).length,
    };
  }

  async getRecoveryCapabilities(): Promise<RecoveryCapability[]> {
    const [drps, points] = await Promise.all([
      this.supabase.from('ctdisr.disaster_recovery_plans').select('*').eq('status', DrPlanStatus.ACTIVE),
      this.supabase.from('ctdisr.recovery_points').select('*').eq('is_valid', true),
    ]);

    const drpData = drps.data || [];
    const pointData = points.data || [];

    return drpData.flatMap((drp) => 
      drp.target_systems.map((system: string) => {
        const systemPoints = pointData.filter((p) => p.system_identifier === system);
        const latestPoint = systemPoints.sort((a, b) => 
          new Date(b.recovery_point_time).getTime() - new Date(a.recovery_point_time).getTime()
        )[0];

        const currentRpo = latestPoint 
          ? Math.round((Date.now() - new Date(latestPoint.recovery_point_time).getTime()) / 60000)
          : Infinity;

        return {
          systemIdentifier: system,
          currentRpo,
          targetRpo: drp.rpo_minutes,
          rpoCompliant: currentRpo <= drp.rpo_minutes,
          estimatedRto: latestPoint?.estimated_recovery_time_minutes || drp.rto_minutes,
          targetRto: drp.rto_minutes,
          rtoCompliant: (latestPoint?.estimated_recovery_time_minutes || drp.rto_minutes) <= drp.rto_minutes,
          lastBackup: latestPoint ? new Date(latestPoint.recovery_point_time) : new Date(0),
          lastSuccessfulTest: latestPoint?.last_recovery_test ? new Date(latestPoint.last_recovery_test) : undefined,
          recoveryPointsAvailable: systemPoints.length,
        };
      })
    );
  }

  // ============ Mappers ============

  private mapToBcp(data: Record<string, unknown>): BusinessContinuityPlan {
    return {
      id: data.id as string,
      planNumber: data.plan_number as string,
      name: data.name as string,
      description: data.description as string,
      version: data.version as string,
      status: data.status as DrPlanStatus,
      ownerId: data.owner_id as string,
      department: data.department as string,
      scope: data.scope as string,
      coveredSystems: data.covered_systems as string[] || [],
      coveredProcesses: data.covered_processes as string[] || [],
      rtoHours: data.rto_hours as number,
      rpoHours: data.rpo_hours as number,
      mtpdHours: data.mtpd_hours as number,
      planDocumentUrl: data.plan_document_url as string,
      planDocumentHash: data.plan_document_hash as string,
      lastReviewedAt: data.last_reviewed_at ? new Date(data.last_reviewed_at as string) : undefined,
      nextReviewAt: data.next_review_at ? new Date(data.next_review_at as string) : undefined,
      reviewFrequencyDays: data.review_frequency_days as number,
      approvedBy: data.approved_by as string,
      approvedAt: data.approved_at ? new Date(data.approved_at as string) : undefined,
      lastActivatedAt: data.last_activated_at ? new Date(data.last_activated_at as string) : undefined,
      activationCount: data.activation_count as number,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToDrp(data: Record<string, unknown>): DisasterRecoveryPlan {
    return {
      id: data.id as string,
      planNumber: data.plan_number as string,
      bcpId: data.bcp_id as string,
      name: data.name as string,
      description: data.description as string,
      version: data.version as string,
      status: data.status as DrPlanStatus,
      priority: data.priority as RecoveryPriority,
      targetSystems: data.target_systems as string[],
      targetAssets: data.target_assets as string[] || [],
      primarySite: data.primary_site as string,
      secondarySite: data.secondary_site as string,
      tertiarySite: data.tertiary_site as string,
      rtoMinutes: data.rto_minutes as number,
      rpoMinutes: data.rpo_minutes as number,
      recoveryProcedures: data.recovery_procedures as RecoveryStep[],
      rollbackProcedures: data.rollback_procedures as RecoveryStep[] || [],
      dependencies: data.dependencies as Record<string, unknown>,
      upstreamSystems: data.upstream_systems as string[] || [],
      downstreamSystems: data.downstream_systems as string[] || [],
      primaryContact: data.primary_contact as ContactInfo,
      escalationContacts: data.escalation_contacts as ContactInfo[] || [],
      vendorContacts: data.vendor_contacts as ContactInfo[] || [],
      lastTestedAt: data.last_tested_at ? new Date(data.last_tested_at as string) : undefined,
      lastTestResult: data.last_test_result as DrTestResult,
      nextTestDate: data.next_test_date ? new Date(data.next_test_date as string) : undefined,
      testFrequencyDays: data.test_frequency_days as number,
      runbookUrl: data.runbook_url as string,
      architectureDiagramUrl: data.architecture_diagram_url as string,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToDrTest(data: Record<string, unknown>): DrTest {
    return {
      id: data.id as string,
      testNumber: data.test_number as string,
      drPlanId: data.dr_plan_id as string,
      testType: data.test_type as DrTestType,
      name: data.name as string,
      description: data.description as string,
      objectives: data.objectives as string[],
      scheduledAt: new Date(data.scheduled_at as string),
      startedAt: data.started_at ? new Date(data.started_at as string) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at as string) : undefined,
      durationMinutes: data.duration_minutes as number,
      testLead: data.test_lead as string,
      participants: data.participants as string[] || [],
      observers: data.observers as string[] || [],
      scenarioDescription: data.scenario_description as string,
      simulatedDisasterType: data.simulated_disaster_type as string,
      affectedSystems: data.affected_systems as string[] || [],
      result: data.result as DrTestResult,
      actualRtoMinutes: data.actual_rto_minutes as number,
      actualRpoMinutes: data.actual_rpo_minutes as number,
      rtoMet: data.rto_met as boolean,
      rpoMet: data.rpo_met as boolean,
      findings: data.findings as string,
      issuesFound: data.issues_found as DrTest['issuesFound'] || [],
      recommendations: data.recommendations as string[] || [],
      actionItems: data.action_items as DrTest['actionItems'] || [],
      testReportUrl: data.test_report_url as string,
      evidenceUrls: data.evidence_urls as string[] || [],
      followUpDate: data.follow_up_date ? new Date(data.follow_up_date as string) : undefined,
      followUpCompleted: data.follow_up_completed as boolean,
      createdAt: new Date(data.created_at as string),
      createdBy: data.created_by as string,
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToFailoverEvent(data: Record<string, unknown>): FailoverEvent {
    return {
      id: data.id as string,
      eventNumber: data.event_number as string,
      drPlanId: data.dr_plan_id as string,
      incidentId: data.incident_id as string,
      eventType: data.event_type as FailoverEvent['eventType'],
      status: data.status as FailoverStatus,
      sourceSite: data.source_site as string,
      targetSite: data.target_site as string,
      initiatedAt: data.initiated_at ? new Date(data.initiated_at as string) : undefined,
      activatedAt: data.activated_at ? new Date(data.activated_at as string) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at as string) : undefined,
      failbackAt: data.failback_at ? new Date(data.failback_at as string) : undefined,
      triggerType: data.trigger_type as FailoverEvent['triggerType'],
      triggeredBy: data.triggered_by as string,
      triggerReason: data.trigger_reason as string,
      systemsAffected: data.systems_affected as string[],
      servicesAffected: data.services_affected as string[],
      actualDowntimeSeconds: data.actual_downtime_seconds as number,
      dataLossSeconds: data.data_loss_seconds as number,
      statusUpdates: data.status_updates as FailoverEvent['statusUpdates'] || [],
      issuesEncountered: data.issues_encountered as FailoverEvent['issuesEncountered'] || [],
      resolutionSteps: data.resolution_steps as string[] || [],
      postMortemUrl: data.post_mortem_url as string,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private mapToBcpActivation(data: Record<string, unknown>): BcpActivation {
    return {
      id: data.id as string,
      bcpId: data.bcp_id as string,
      activationReason: data.activation_reason as string,
      severity: data.severity as RecoveryPriority,
      activatedAt: new Date(data.activated_at as string),
      deactivatedAt: data.deactivated_at ? new Date(data.deactivated_at as string) : undefined,
      durationHours: data.duration_hours as number,
      activatedBy: data.activated_by as string,
      deactivatedBy: data.deactivated_by as string,
      affectedDepartments: data.affected_departments as string[] || [],
      affectedProcesses: data.affected_processes as string[] || [],
      estimatedImpact: data.estimated_impact as string,
      actualImpact: data.actual_impact as string,
      actionsTaken: data.actions_taken as BcpActivation['actionsTaken'] || [],
      lessonsLearned: data.lessons_learned as string,
      improvementsIdentified: data.improvements_identified as string[] || [],
      ptaNotified: data.pta_notified as boolean,
      ptaNotificationTime: data.pta_notification_time ? new Date(data.pta_notification_time as string) : undefined,
      createdAt: new Date(data.created_at as string),
    };
  }
}
