/**
 * CTDISR-2025 Incident Response & Forensics Types
 * PTA Regulation: Chapter 7 - Incident Management & Digital Forensics
 */

// ============ Enums ============

export enum IncidentSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFORMATIONAL = 'informational',
}

export enum IncidentStatus {
  DETECTED = 'detected',
  TRIAGED = 'triaged',
  CONTAINED = 'contained',
  ERADICATED = 'eradicated',
  RECOVERED = 'recovered',
  CLOSED = 'closed',
  REOPENED = 'reopened',
}

export enum IncidentCategory {
  MALWARE = 'malware',
  PHISHING = 'phishing',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  DATA_BREACH = 'data_breach',
  DOS_DDOS = 'dos_ddos',
  INSIDER_THREAT = 'insider_threat',
  PHYSICAL_SECURITY = 'physical_security',
  POLICY_VIOLATION = 'policy_violation',
  SYSTEM_COMPROMISE = 'system_compromise',
  NETWORK_INTRUSION = 'network_intrusion',
  FRAUD = 'fraud',
  OTHER = 'other',
}

export enum EvidenceType {
  LOG_FILE = 'log_file',
  MEMORY_DUMP = 'memory_dump',
  DISK_IMAGE = 'disk_image',
  NETWORK_CAPTURE = 'network_capture',
  MALWARE_SAMPLE = 'malware_sample',
  SCREENSHOT = 'screenshot',
  EMAIL = 'email',
  DOCUMENT = 'document',
  DATABASE_RECORD = 'database_record',
  CONFIGURATION = 'configuration',
  OTHER = 'other',
}

export enum CustodyAction {
  COLLECTED = 'collected',
  TRANSFERRED = 'transferred',
  ANALYZED = 'analyzed',
  STORED = 'stored',
  RETRIEVED = 'retrieved',
  RETURNED = 'returned',
  DESTROYED = 'destroyed',
}

export enum ForensicStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
  CANCELLED = 'cancelled',
}

export enum CommunicationType {
  EMAIL = 'email',
  CALL = 'call',
  MEETING = 'meeting',
  NOTIFICATION = 'notification',
  SMS = 'sms',
  TICKET = 'ticket',
}

export enum CommunicationDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  INTERNAL = 'internal',
}

// ============ Interfaces ============

export interface IndicatorOfCompromise {
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'file' | 'registry' | 'other';
  value: string;
  confidence: number;
  source?: string;
  firstSeen?: Date;
  lastSeen?: Date;
}

export interface RemediationAction {
  action: string;
  assignedTo?: string;
  dueDate?: Date;
  completedAt?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  notes?: string;
}

export interface SecurityIncident {
  id: string;
  incidentNumber: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  category: IncidentCategory;
  title: string;
  description?: string;
  
  // Affected Resources
  affectedAssets: string[];
  affectedSystems: string[];
  affectedUsers: string[];
  affectedDataTypes: string[];
  
  // Impact Assessment
  businessImpact?: string;
  dataCompromised: boolean;
  dataExfiltrated: boolean;
  serviceDisruption: boolean;
  estimatedFinancialImpact?: number;
  
  // Detection
  detectionMethod?: string;
  detectionSource?: string;
  initialIndicators: Record<string, unknown>;
  
  // Timeline
  detectedAt: Date;
  reportedAt?: Date;
  triagedAt?: Date;
  containedAt?: Date;
  eradicatedAt?: Date;
  recoveredAt?: Date;
  closedAt?: Date;
  
  // SLAs
  responseSlaMinutes?: number;
  containmentSlaMinutes?: number;
  slaBreached: boolean;
  
  // Attribution
  threatActor?: string;
  attackVector?: string;
  ttps: string[];
  iocs: IndicatorOfCompromise[];
  
  // Team
  incidentCommander?: string;
  assignedTeam: string[];
  escalationLevel: number;
  
  // External Reporting
  ptaReported: boolean;
  ptaReportDate?: Date;
  ptaReference?: string;
  lawEnforcementNotified: boolean;
  customersNotified: boolean;
  
  // Documentation
  rootCause?: string;
  lessonsLearned?: string;
  remediationActions: RemediationAction[];
  
  // Metadata
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
  recordHash?: string;
}

export interface IncidentTimelineEvent {
  id: string;
  incidentId: string;
  eventTime: Date;
  eventType: string;
  description: string;
  performedBy?: string;
  automated: boolean;
  details: Record<string, unknown>;
  attachments: string[];
  verified: boolean;
  verifiedBy?: string;
  createdAt: Date;
}

export interface PlaybookStep {
  stepNumber: number;
  title: string;
  description: string;
  isAutomated: boolean;
  automationScript?: string;
  requiredRole?: string;
  estimatedMinutes?: number;
  dependencies?: number[];
}

export interface ResponsePlaybook {
  id: string;
  name: string;
  description?: string;
  category: IncidentCategory;
  severityLevels: IncidentSeverity[];
  steps: PlaybookStep[];
  automatedActions: Record<string, unknown>[];
  escalationMatrix: Record<string, unknown>;
  communicationTemplates: Record<string, string>;
  initialResponseMinutes: number;
  containmentTargetMinutes?: number;
  resolutionTargetMinutes?: number;
  requiredTools: string[];
  requiredSkills: string[];
  requiredApprovals: string[];
  isActive: boolean;
  version: number;
  lastTestedAt?: Date;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface DigitalEvidence {
  id: string;
  evidenceNumber: string;
  incidentId?: string;
  evidenceType: EvidenceType;
  name: string;
  description?: string;
  
  // Source
  sourceSystem?: string;
  sourceIp?: string;
  sourceHostname?: string;
  sourceUser?: string;
  
  // Collection
  collectedAt: Date;
  collectedBy: string;
  collectionMethod?: string;
  collectionTool?: string;
  
  // Storage
  storageLocation: string;
  storageEncrypted: boolean;
  encryptionKeyId?: string;
  
  // Integrity
  originalHashMd5?: string;
  originalHashSha256: string;
  originalHashSha512?: string;
  currentHashSha256?: string;
  integrityVerified: boolean;
  lastIntegrityCheck?: Date;
  
  // Size and Format
  fileSizeBytes?: number;
  fileFormat?: string;
  mimeType?: string;
  
  // Classification
  classification: string;
  legalHold: boolean;
  retentionUntil?: Date;
  
  // Status
  isAvailable: boolean;
  isAnalyzed: boolean;
  
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChainOfCustodyEntry {
  id: string;
  evidenceId: string;
  action: CustodyAction;
  actionTime: Date;
  fromCustodian?: string;
  toCustodian?: string;
  reason: string;
  location?: string;
  hashVerified: boolean;
  hashAtTransfer?: string;
  fromSignatureHash?: string;
  toSignatureHash?: string;
  witnessedBy?: string;
  notes?: string;
  createdAt: Date;
}

export interface ForensicCase {
  id: string;
  caseNumber: string;
  incidentId?: string;
  title: string;
  objective: string;
  scope?: string;
  status: ForensicStatus;
  priority: IncidentSeverity;
  openedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  deadline?: Date;
  leadInvestigator: string;
  teamMembers: string[];
  evidenceIds: string[];
  findings?: string;
  conclusions?: string;
  recommendations?: string;
  reportLocation?: string;
  reportHash?: string;
  externalConsultant?: string;
  lawEnforcementCaseNumber?: string;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
}

export interface ForensicActivity {
  id: string;
  caseId: string;
  evidenceId?: string;
  activityType: string;
  description: string;
  performedBy: string;
  performedAt: Date;
  durationMinutes?: number;
  toolsUsed: string[];
  methodology?: string;
  findings?: string;
  artifactsFound: Record<string, unknown>[];
  peerReviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export interface IncidentResponseTeamMember {
  id: string;
  userId: string;
  role: string;
  skills: string[];
  certifications: string[];
  isActive: boolean;
  isOnCall: boolean;
  contactPhone?: string;
  contactEmail?: string;
  escalationLevel: number;
  canBeCommander: boolean;
  incidentsHandled: number;
  avgResponseTimeMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IncidentCommunication {
  id: string;
  incidentId: string;
  communicationType: CommunicationType;
  direction: CommunicationDirection;
  fromParty: string;
  toParties: string[];
  subject?: string;
  summary: string;
  fullContentHash?: string;
  sentAt: Date;
  acknowledgedAt?: Date;
  hasAttachments: boolean;
  attachmentCount: number;
  isRegulatory: boolean;
  regulatoryBody?: string;
  createdBy?: string;
  createdAt: Date;
}

// ============ DTOs ============

export interface CreateIncidentDto {
  severity: IncidentSeverity;
  category: IncidentCategory;
  title: string;
  description?: string;
  affectedAssets?: string[];
  affectedSystems?: string[];
  detectionMethod?: string;
  detectionSource?: string;
  initialIndicators?: Record<string, unknown>;
}

export interface UpdateIncidentStatusDto {
  status: IncidentStatus;
  notes?: string;
}

export interface AssignIncidentDto {
  incidentCommander: string;
  assignedTeam?: string[];
}

export interface EscalateIncidentDto {
  newLevel: number;
  reason: string;
  notifyParties?: string[];
}

export interface AddTimelineEventDto {
  incidentId: string;
  eventType: string;
  description: string;
  details?: Record<string, unknown>;
  attachments?: string[];
}

export interface CollectEvidenceDto {
  incidentId?: string;
  evidenceType: EvidenceType;
  name: string;
  description?: string;
  sourceSystem?: string;
  sourceIp?: string;
  sourceHostname?: string;
  collectionMethod?: string;
  collectionTool?: string;
  storageLocation: string;
  originalHashSha256: string;
  originalHashMd5?: string;
  fileSizeBytes?: number;
  fileFormat?: string;
  mimeType?: string;
  classification?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferCustodyDto {
  evidenceId: string;
  toCustodian: string;
  reason: string;
  location?: string;
  witnessedBy?: string;
  notes?: string;
}

export interface CreateForensicCaseDto {
  incidentId?: string;
  title: string;
  objective: string;
  scope?: string;
  priority: IncidentSeverity;
  leadInvestigator: string;
  teamMembers?: string[];
  evidenceIds?: string[];
  deadline?: Date;
}

export interface AddForensicActivityDto {
  caseId: string;
  evidenceId?: string;
  activityType: string;
  description: string;
  durationMinutes?: number;
  toolsUsed?: string[];
  methodology?: string;
  findings?: string;
  artifactsFound?: Record<string, unknown>[];
}

export interface ReportToPtaDto {
  incidentId: string;
  reportType: 'initial' | 'update' | 'final';
  summary: string;
  details: Record<string, unknown>;
}

export interface PtaIncidentReport {
  incidentNumber: string;
  reportType: string;
  submittedAt: Date;
  severity: IncidentSeverity;
  category: IncidentCategory;
  affectedCustomers: number;
  dataBreachScope?: string;
  containmentStatus: string;
  remediationPlan: string;
  timeline: {
    detected: Date;
    contained?: Date;
    reported: Date;
  };
  contactPerson: {
    name: string;
    designation: string;
    phone: string;
    email: string;
  };
}

// ============ Statistics & Reporting ============

export interface IncidentStatistics {
  total: number;
  bySeverity: Record<IncidentSeverity, number>;
  byStatus: Record<IncidentStatus, number>;
  byCategory: Record<IncidentCategory, number>;
  avgTimeToContain: number;
  avgTimeToResolve: number;
  slaBreachRate: number;
  ptaReportingRate: number;
}

export interface ForensicStatistics {
  totalCases: number;
  byStatus: Record<ForensicStatus, number>;
  avgDurationDays: number;
  totalEvidence: number;
  pendingAnalysis: number;
}

export interface IncidentTrend {
  period: string;
  incidents: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avgResponseTime: number;
}
