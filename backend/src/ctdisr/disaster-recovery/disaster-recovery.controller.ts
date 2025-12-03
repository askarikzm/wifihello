/**
 * CTDISR-2025 Disaster Recovery Controller
 * PTA Regulation: Chapter 8 - DR & BCP REST API
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DisasterRecoveryService } from './disaster-recovery.service';
import { BackupService } from './backup.service';
import {
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
} from './types';

// Mock guard for compilation
const SupabaseJwtGuard = class {};
const CurrentUser = () => (target: unknown, key: string, index: number) => {};

@ApiTags('CTDISR - Business Continuity')
@ApiBearerAuth()
@Controller('ctdisr/bcp')
@UseGuards(SupabaseJwtGuard)
export class BcpController {
  constructor(private readonly drService: DisasterRecoveryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a Business Continuity Plan' })
  async createBcp(
    @Body() dto: CreateBcpDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.createBcp(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List Business Continuity Plans' })
  @ApiQuery({ name: 'status', required: false, enum: DrPlanStatus, isArray: true })
  @ApiQuery({ name: 'department', required: false, type: String })
  @ApiQuery({ name: 'overdueReview', required: false, type: Boolean })
  async listBcps(
    @Query('status') status?: DrPlanStatus[],
    @Query('department') department?: string,
    @Query('overdueReview') overdueReview?: boolean,
  ) {
    return this.drService.listBcps({
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      department,
      overdueReview,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Business Continuity Plan by ID' })
  async getBcp(@Param('id') id: string) {
    return this.drService.getBcp(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a Business Continuity Plan' })
  @HttpCode(HttpStatus.OK)
  async approveBcp(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.approveBcp(id, user.id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a Business Continuity Plan' })
  async activateBcp(
    @Param('id') id: string,
    @Body() dto: Omit<ActivateBcpDto, 'bcpId'>,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.activateBcp({ ...dto, bcpId: id }, user.id);
  }

  @Post('activations/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a BCP activation' })
  @HttpCode(HttpStatus.OK)
  async deactivateBcp(
    @Param('id') id: string,
    @Body('lessonsLearned') lessonsLearned?: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.deactivateBcp(id, user.id, lessonsLearned);
  }
}

@ApiTags('CTDISR - Disaster Recovery')
@ApiBearerAuth()
@Controller('ctdisr/drp')
@UseGuards(SupabaseJwtGuard)
export class DrpController {
  constructor(private readonly drService: DisasterRecoveryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a Disaster Recovery Plan' })
  async createDrp(
    @Body() dto: CreateDrpDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.createDrp(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List Disaster Recovery Plans' })
  @ApiQuery({ name: 'status', required: false, enum: DrPlanStatus, isArray: true })
  @ApiQuery({ name: 'priority', required: false, enum: RecoveryPriority, isArray: true })
  @ApiQuery({ name: 'bcpId', required: false, type: String })
  @ApiQuery({ name: 'overdueTest', required: false, type: Boolean })
  async listDrps(
    @Query('status') status?: DrPlanStatus[],
    @Query('priority') priority?: RecoveryPriority[],
    @Query('bcpId') bcpId?: string,
    @Query('overdueTest') overdueTest?: boolean,
  ) {
    return this.drService.listDrps({
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      priority: priority ? (Array.isArray(priority) ? priority : [priority]) : undefined,
      bcpId,
      overdueTest,
    });
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get DR statistics' })
  async getStatistics() {
    return this.drService.getDrStatistics();
  }

  @Get('recovery-capabilities')
  @ApiOperation({ summary: 'Get system recovery capabilities' })
  async getRecoveryCapabilities() {
    return this.drService.getRecoveryCapabilities();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Disaster Recovery Plan by ID' })
  async getDrp(@Param('id') id: string) {
    return this.drService.getDrp(id);
  }

  // ============ DR Testing ============

  @Post('tests')
  @ApiOperation({ summary: 'Schedule a DR test' })
  async scheduleDrTest(
    @Body() dto: ScheduleDrTestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.scheduleDrTest(dto, user.id);
  }

  @Get('tests')
  @ApiOperation({ summary: 'List DR tests' })
  @ApiQuery({ name: 'drPlanId', required: false, type: String })
  @ApiQuery({ name: 'testType', required: false, enum: DrTestType, isArray: true })
  @ApiQuery({ name: 'result', required: false, enum: DrTestResult, isArray: true })
  async listDrTests(
    @Query('drPlanId') drPlanId?: string,
    @Query('testType') testType?: DrTestType[],
    @Query('result') result?: DrTestResult[],
  ) {
    return this.drService.listDrTests({
      drPlanId,
      testType: testType ? (Array.isArray(testType) ? testType : [testType]) : undefined,
      result: result ? (Array.isArray(result) ? result : [result]) : undefined,
    });
  }

  @Get('tests/:id')
  @ApiOperation({ summary: 'Get DR test by ID' })
  async getDrTest(@Param('id') id: string) {
    return this.drService.getDrTest(id);
  }

  @Post('tests/:id/start')
  @ApiOperation({ summary: 'Start a scheduled DR test' })
  @HttpCode(HttpStatus.OK)
  async startDrTest(@Param('id') id: string) {
    return this.drService.startDrTest(id);
  }

  @Post('tests/:id/complete')
  @ApiOperation({ summary: 'Complete a DR test with results' })
  @HttpCode(HttpStatus.OK)
  async completeDrTest(
    @Param('id') id: string,
    @Body('result') result: DrTestResult,
    @Body('actualRtoMinutes') actualRtoMinutes: number,
    @Body('actualRpoMinutes') actualRpoMinutes: number,
    @Body('findings') findings?: string,
  ) {
    return this.drService.completeDrTest(id, result, actualRtoMinutes, actualRpoMinutes, findings);
  }

  // ============ Failover ============

  @Post('failover')
  @ApiOperation({ summary: 'Initiate a failover event' })
  async initiateFailover(
    @Body() dto: InitiateFailoverDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.initiateFailover(dto, user.id);
  }

  @Get('failover')
  @ApiOperation({ summary: 'List failover events' })
  @ApiQuery({ name: 'drPlanId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: FailoverStatus, isArray: true })
  @ApiQuery({ name: 'eventType', required: false, type: String })
  async listFailoverEvents(
    @Query('drPlanId') drPlanId?: string,
    @Query('status') status?: FailoverStatus[],
    @Query('eventType') eventType?: string,
  ) {
    return this.drService.listFailoverEvents({
      drPlanId,
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      eventType,
    });
  }

  @Get('failover/:id')
  @ApiOperation({ summary: 'Get failover event by ID' })
  async getFailoverEvent(@Param('id') id: string) {
    return this.drService.getFailoverEvent(id);
  }

  @Patch('failover/:id/status')
  @ApiOperation({ summary: 'Update failover event status' })
  async updateFailoverStatus(
    @Param('id') id: string,
    @Body('status') status: FailoverStatus,
    @Body('message') message: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.drService.updateFailoverStatus(id, status, message, user.id);
  }
}

@ApiTags('CTDISR - Backup Management')
@ApiBearerAuth()
@Controller('ctdisr/backup')
@UseGuards(SupabaseJwtGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('schedules')
  @ApiOperation({ summary: 'Create a backup schedule' })
  async createSchedule(
    @Body() dto: CreateBackupScheduleDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.backupService.createBackupSchedule(dto, user.id);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'List backup schedules' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'targetType', required: false, type: String })
  @ApiQuery({ name: 'priority', required: false, enum: RecoveryPriority, isArray: true })
  async listSchedules(
    @Query('isActive') isActive?: boolean,
    @Query('targetType') targetType?: string,
    @Query('priority') priority?: RecoveryPriority[],
  ) {
    return this.backupService.listBackupSchedules({
      isActive,
      targetType,
      priority: priority ? (Array.isArray(priority) ? priority : [priority]) : undefined,
    });
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get backup schedule by ID' })
  async getSchedule(@Param('id') id: string) {
    return this.backupService.getBackupSchedule(id);
  }

  @Patch('schedules/:id/toggle')
  @ApiOperation({ summary: 'Toggle backup schedule active state' })
  async toggleSchedule(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.backupService.toggleSchedule(id, isActive);
  }

  @Post('schedules/:id/run')
  @ApiOperation({ summary: 'Manually trigger a backup' })
  async triggerBackup(@Param('id') id: string) {
    return this.backupService.startBackup(id);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get backup statistics' })
  async getStatistics() {
    return this.backupService.getBackupStatistics();
  }

  // ============ Executions ============

  @Get('executions')
  @ApiOperation({ summary: 'List backup executions' })
  @ApiQuery({ name: 'scheduleId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: BackupStatus, isArray: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listExecutions(
    @Query('scheduleId') scheduleId?: string,
    @Query('status') status?: BackupStatus[],
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.backupService.listBackupExecutions({
      scheduleId,
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      limit,
      offset,
    });
  }

  @Get('executions/:id')
  @ApiOperation({ summary: 'Get backup execution by ID' })
  async getExecution(@Param('id') id: string) {
    return this.backupService.getBackupExecution(id);
  }

  @Post('executions/:id/verify')
  @ApiOperation({ summary: 'Verify a backup' })
  @HttpCode(HttpStatus.OK)
  async verifyBackup(
    @Param('id') id: string,
    @Body('verificationMethod') verificationMethod: string,
    @Body('result') result: string,
  ) {
    return this.backupService.verifyBackup(id, verificationMethod, result);
  }

  @Post('executions/:id/test-restore')
  @ApiOperation({ summary: 'Record a restore test' })
  @HttpCode(HttpStatus.OK)
  async testRestore(
    @Param('id') id: string,
    @Body('restoreDurationSeconds') restoreDurationSeconds: number,
  ) {
    return this.backupService.testRestore(id, restoreDurationSeconds);
  }

  // ============ Recovery Points ============

  @Get('recovery-points')
  @ApiOperation({ summary: 'List recovery points for a system' })
  @ApiQuery({ name: 'systemIdentifier', required: true, type: String })
  async listRecoveryPoints(@Query('systemIdentifier') systemIdentifier: string) {
    return this.backupService.listRecoveryPoints(systemIdentifier);
  }

  @Get('recovery-points/current')
  @ApiOperation({ summary: 'Get current recovery point for a system' })
  @ApiQuery({ name: 'systemIdentifier', required: true, type: String })
  async getCurrentRecoveryPoint(@Query('systemIdentifier') systemIdentifier: string) {
    return this.backupService.getCurrentRecoveryPoint(systemIdentifier);
  }

  @Patch('recovery-points/:id/protect')
  @ApiOperation({ summary: 'Set or remove protection on a recovery point' })
  async protectRecoveryPoint(
    @Param('id') id: string,
    @Body('protect') protect: boolean,
  ) {
    return this.backupService.protectRecoveryPoint(id, protect);
  }
}
