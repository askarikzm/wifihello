/**
 * CTDISR-2025 Incident Response Controller
 * PTA Regulation: Chapter 7 - Security Incident Management REST API
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
import { IncidentResponseService } from './incident-response.service';
import { ForensicsService } from './forensics.service';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentCategory,
  EvidenceType,
  ForensicStatus,
  CreateIncidentDto,
  UpdateIncidentStatusDto,
  AssignIncidentDto,
  EscalateIncidentDto,
  AddTimelineEventDto,
  ReportToPtaDto,
  CollectEvidenceDto,
  TransferCustodyDto,
  CreateForensicCaseDto,
  AddForensicActivityDto,
  IndicatorOfCompromise,
  RemediationAction,
} from './types';

// Mock guard for compilation - should be imported from auth module
const SupabaseJwtGuard = class {};
const CurrentUser = () => (target: unknown, key: string, index: number) => {};

@ApiTags('CTDISR - Incident Response')
@ApiBearerAuth()
@Controller('ctdisr/incidents')
@UseGuards(SupabaseJwtGuard)
export class IncidentResponseController {
  constructor(
    private readonly incidentService: IncidentResponseService,
    private readonly forensicsService: ForensicsService,
  ) {}

  // ============ Incident Management ============

  @Post()
  @ApiOperation({ summary: 'Create a new security incident' })
  async createIncident(
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.createIncident(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List security incidents with filters' })
  @ApiQuery({ name: 'status', required: false, enum: IncidentStatus, isArray: true })
  @ApiQuery({ name: 'severity', required: false, enum: IncidentSeverity, isArray: true })
  @ApiQuery({ name: 'category', required: false, enum: IncidentCategory, isArray: true })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'ptaReported', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listIncidents(
    @Query('status') status?: IncidentStatus[],
    @Query('severity') severity?: IncidentSeverity[],
    @Query('category') category?: IncidentCategory[],
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('ptaReported') ptaReported?: boolean,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.incidentService.listIncidents({
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      severity: severity ? (Array.isArray(severity) ? severity : [severity]) : undefined,
      category: category ? (Array.isArray(category) ? category : [category]) : undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      ptaReported,
      limit,
      offset,
    });
  }

  @Get('unreported')
  @ApiOperation({ summary: 'Get critical/high incidents not yet reported to PTA' })
  async getUnreportedIncidents() {
    return this.incidentService.getUnreportedCriticalIncidents();
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get incident statistics' })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  async getStatistics(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.incidentService.getIncidentStatistics(
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get incident trends over time' })
  @ApiQuery({ name: 'months', required: false, type: Number })
  async getTrends(@Query('months') months?: number) {
    return this.incidentService.getIncidentTrends(months || 12);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get incident by ID' })
  async getIncident(@Param('id') id: string) {
    return this.incidentService.getIncident(id);
  }

  @Get('number/:incidentNumber')
  @ApiOperation({ summary: 'Get incident by incident number' })
  async getIncidentByNumber(@Param('incidentNumber') incidentNumber: string) {
    return this.incidentService.getIncidentByNumber(incidentNumber);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update incident status' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.updateIncidentStatus(id, dto, user.id);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign incident to team' })
  async assignIncident(
    @Param('id') id: string,
    @Body() dto: AssignIncidentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.assignIncident(id, dto, user.id);
  }

  @Post(':id/escalate')
  @ApiOperation({ summary: 'Escalate incident to higher level' })
  async escalateIncident(
    @Param('id') id: string,
    @Body() dto: EscalateIncidentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.escalateIncident(id, dto, user.id);
  }

  @Post(':id/iocs')
  @ApiOperation({ summary: 'Add indicators of compromise to incident' })
  async addIocs(
    @Param('id') id: string,
    @Body() iocs: IndicatorOfCompromise[],
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.addIndicatorsOfCompromise(id, iocs, user.id);
  }

  @Post(':id/remediation')
  @ApiOperation({ summary: 'Add remediation action to incident' })
  async addRemediation(
    @Param('id') id: string,
    @Body() action: RemediationAction,
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.addRemediationAction(id, action, user.id);
  }

  // ============ Timeline ============

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get incident timeline' })
  async getTimeline(@Param('id') id: string) {
    return this.incidentService.getIncidentTimeline(id);
  }

  @Post(':id/timeline')
  @ApiOperation({ summary: 'Add timeline event to incident' })
  async addTimelineEvent(
    @Param('id') id: string,
    @Body() dto: Omit<AddTimelineEventDto, 'incidentId'>,
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.addTimelineEvent({ ...dto, incidentId: id }, user.id);
  }

  // ============ Communications ============

  @Get(':id/communications')
  @ApiOperation({ summary: 'Get incident communications' })
  async getCommunications(@Param('id') id: string) {
    return this.incidentService.getIncidentCommunications(id);
  }

  // ============ PTA Reporting ============

  @Post(':id/report-pta')
  @ApiOperation({ summary: 'Report incident to PTA' })
  async reportToPta(
    @Param('id') id: string,
    @Body() dto: Omit<ReportToPtaDto, 'incidentId'>,
    @CurrentUser() user: { id: string },
  ) {
    return this.incidentService.reportToPta({ ...dto, incidentId: id }, user.id);
  }

  // ============ Playbooks ============

  @Get('playbooks')
  @ApiOperation({ summary: 'List all active response playbooks' })
  async listPlaybooks() {
    return this.incidentService.listPlaybooks();
  }

  // ============ Team ============

  @Get('team/on-call')
  @ApiOperation({ summary: 'Get on-call incident response team' })
  async getOnCallTeam() {
    return this.incidentService.getOnCallTeam();
  }

  @Get('team/escalation/:level')
  @ApiOperation({ summary: 'Get team members by escalation level' })
  async getTeamByLevel(@Param('level') level: number) {
    return this.incidentService.getTeamByEscalationLevel(level);
  }
}

@ApiTags('CTDISR - Digital Forensics')
@ApiBearerAuth()
@Controller('ctdisr/forensics')
@UseGuards(SupabaseJwtGuard)
export class ForensicsController {
  constructor(private readonly forensicsService: ForensicsService) {}

  // ============ Evidence Management ============

  @Post('evidence')
  @ApiOperation({ summary: 'Collect and register digital evidence' })
  async collectEvidence(
    @Body() dto: CollectEvidenceDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.forensicsService.collectEvidence(dto, user.id);
  }

  @Get('evidence')
  @ApiOperation({ summary: 'List digital evidence with filters' })
  @ApiQuery({ name: 'incidentId', required: false, type: String })
  @ApiQuery({ name: 'evidenceType', required: false, enum: EvidenceType, isArray: true })
  @ApiQuery({ name: 'legalHold', required: false, type: Boolean })
  @ApiQuery({ name: 'isAnalyzed', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listEvidence(
    @Query('incidentId') incidentId?: string,
    @Query('evidenceType') evidenceType?: EvidenceType[],
    @Query('legalHold') legalHold?: boolean,
    @Query('isAnalyzed') isAnalyzed?: boolean,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.forensicsService.listEvidence({
      incidentId,
      evidenceType: evidenceType ? (Array.isArray(evidenceType) ? evidenceType : [evidenceType]) : undefined,
      legalHold,
      isAnalyzed,
      limit,
      offset,
    });
  }

  @Get('evidence/:id')
  @ApiOperation({ summary: 'Get evidence by ID' })
  async getEvidence(@Param('id') id: string) {
    return this.forensicsService.getEvidence(id);
  }

  @Get('evidence/number/:evidenceNumber')
  @ApiOperation({ summary: 'Get evidence by evidence number' })
  async getEvidenceByNumber(@Param('evidenceNumber') evidenceNumber: string) {
    return this.forensicsService.getEvidenceByNumber(evidenceNumber);
  }

  @Post('evidence/:id/verify')
  @ApiOperation({ summary: 'Verify evidence integrity' })
  @HttpCode(HttpStatus.OK)
  async verifyIntegrity(
    @Param('id') id: string,
    @Body('currentHash') currentHash: string,
  ) {
    const isValid = await this.forensicsService.verifyEvidenceIntegrity(id, currentHash);
    return { evidenceId: id, integrityVerified: isValid };
  }

  @Patch('evidence/:id/legal-hold')
  @ApiOperation({ summary: 'Set or remove legal hold on evidence' })
  async setLegalHold(
    @Param('id') id: string,
    @Body('legalHold') legalHold: boolean,
    @Body('retentionUntil') retentionUntil?: string,
  ) {
    return this.forensicsService.setLegalHold(
      id,
      legalHold,
      retentionUntil ? new Date(retentionUntil) : undefined,
    );
  }

  // ============ Chain of Custody ============

  @Get('evidence/:id/chain-of-custody')
  @ApiOperation({ summary: 'Get evidence chain of custody' })
  async getChainOfCustody(@Param('id') id: string) {
    return this.forensicsService.getChainOfCustody(id);
  }

  @Post('evidence/:id/transfer')
  @ApiOperation({ summary: 'Transfer evidence custody' })
  async transferCustody(
    @Param('id') id: string,
    @Body() dto: Omit<TransferCustodyDto, 'evidenceId'>,
    @CurrentUser() user: { id: string },
  ) {
    return this.forensicsService.transferCustody({ ...dto, evidenceId: id }, user.id);
  }

  @Get('evidence/:id/custody-report')
  @ApiOperation({ summary: 'Generate chain of custody report' })
  async getCustodyReport(@Param('id') id: string) {
    return this.forensicsService.generateChainOfCustodyReport(id);
  }

  // ============ Forensic Cases ============

  @Post('cases')
  @ApiOperation({ summary: 'Create a forensic investigation case' })
  async createCase(
    @Body() dto: CreateForensicCaseDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.forensicsService.createForensicCase(dto, user.id);
  }

  @Get('cases')
  @ApiOperation({ summary: 'List forensic cases with filters' })
  @ApiQuery({ name: 'status', required: false, enum: ForensicStatus, isArray: true })
  @ApiQuery({ name: 'priority', required: false, enum: IncidentSeverity, isArray: true })
  @ApiQuery({ name: 'leadInvestigator', required: false, type: String })
  @ApiQuery({ name: 'incidentId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listCases(
    @Query('status') status?: ForensicStatus[],
    @Query('priority') priority?: IncidentSeverity[],
    @Query('leadInvestigator') leadInvestigator?: string,
    @Query('incidentId') incidentId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.forensicsService.listForensicCases({
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      priority: priority ? (Array.isArray(priority) ? priority : [priority]) : undefined,
      leadInvestigator,
      incidentId,
      limit,
      offset,
    });
  }

  @Get('cases/statistics')
  @ApiOperation({ summary: 'Get forensic statistics' })
  async getStatistics() {
    return this.forensicsService.getForensicStatistics();
  }

  @Get('cases/:id')
  @ApiOperation({ summary: 'Get forensic case by ID' })
  async getCase(@Param('id') id: string) {
    return this.forensicsService.getForensicCase(id);
  }

  @Patch('cases/:id/status')
  @ApiOperation({ summary: 'Update forensic case status' })
  async updateCaseStatus(
    @Param('id') id: string,
    @Body('status') status: ForensicStatus,
    @CurrentUser() user: { id: string },
  ) {
    return this.forensicsService.updateForensicCaseStatus(id, status, user.id);
  }

  @Post('cases/:id/evidence')
  @ApiOperation({ summary: 'Add evidence to forensic case' })
  async addEvidenceToCase(
    @Param('id') id: string,
    @Body('evidenceIds') evidenceIds: string[],
  ) {
    return this.forensicsService.addEvidenceToCase(id, evidenceIds);
  }

  @Patch('cases/:id/findings')
  @ApiOperation({ summary: 'Update case findings and conclusions' })
  async updateFindings(
    @Param('id') id: string,
    @Body('findings') findings: string,
    @Body('conclusions') conclusions?: string,
    @Body('recommendations') recommendations?: string,
  ) {
    return this.forensicsService.updateCaseFindings(id, findings, conclusions, recommendations);
  }

  @Get('cases/:id/report')
  @ApiOperation({ summary: 'Generate forensic case report' })
  async getCaseReport(@Param('id') id: string) {
    return this.forensicsService.generateForensicReport(id);
  }

  // ============ Forensic Activities ============

  @Get('cases/:id/activities')
  @ApiOperation({ summary: 'Get forensic case activities' })
  async getCaseActivities(@Param('id') id: string) {
    return this.forensicsService.getCaseActivities(id);
  }

  @Post('cases/:id/activities')
  @ApiOperation({ summary: 'Add forensic activity to case' })
  async addActivity(
    @Param('id') id: string,
    @Body() dto: Omit<AddForensicActivityDto, 'caseId'>,
    @CurrentUser() user: { id: string },
  ) {
    return this.forensicsService.addForensicActivity({ ...dto, caseId: id }, user.id);
  }

  @Post('activities/:id/peer-review')
  @ApiOperation({ summary: 'Peer review a forensic activity' })
  @HttpCode(HttpStatus.OK)
  async peerReview(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.forensicsService.peerReviewActivity(id, user.id);
  }
}
