/**
 * WANCOM ISP - CTDISR-2025 Network Security Types
 */

// ============================================
// NETWORK ZONE TYPES
// ============================================

export enum ZoneType {
  DMZ = 'dmz',
  INTERNAL = 'internal',
  EXTERNAL = 'external',
  MANAGEMENT = 'management',
  RESTRICTED = 'restricted',
  GUEST = 'guest',
}

export interface NetworkZone {
  id: string;
  zoneName: string;
  zoneType: ZoneType;
  description?: string;
  cidrBlocks: string[];
  vlanIds?: number[];
  securityLevel: number;
  parentZoneId?: string;
  allowedProtocols: string[];
  defaultPolicy: 'allow' | 'deny';
  isolationEnabled: boolean;
  monitoringEnabled: boolean;
  zoneMetadata: Record<string, unknown>;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNetworkZoneDto {
  zoneName: string;
  zoneType: ZoneType;
  description?: string;
  cidrBlocks: string[];
  vlanIds?: number[];
  securityLevel: number;
  parentZoneId?: string;
  allowedProtocols?: string[];
  defaultPolicy?: 'allow' | 'deny';
  isolationEnabled?: boolean;
  monitoringEnabled?: boolean;
}

// ============================================
// FIREWALL RULE TYPES
// ============================================

export enum FirewallAction {
  ALLOW = 'allow',
  DENY = 'deny',
  DROP = 'drop',
  REJECT = 'reject',
  LOG = 'log',
}

export interface FirewallRule {
  id: string;
  ruleName: string;
  ruleNumber: number;
  description?: string;
  sourceZoneId?: string;
  sourceAddresses?: string[];
  sourcePorts?: string[];
  destinationZoneId?: string;
  destinationAddresses?: string[];
  destinationPorts?: string[];
  protocols: string[];
  action: FirewallAction;
  logEnabled: boolean;
  rateLimit?: number;
  scheduleStart?: string;
  scheduleEnd?: string;
  scheduleDays?: number[];
  expiresAt?: Date;
  isActive: boolean;
  hitCount: number;
  lastHitAt?: Date;
  changeTicket?: string;
  approvedBy?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFirewallRuleDto {
  ruleName: string;
  ruleNumber: number;
  description?: string;
  sourceZoneId?: string;
  sourceAddresses?: string[];
  sourcePorts?: string[];
  destinationZoneId?: string;
  destinationAddresses?: string[];
  destinationPorts?: string[];
  protocols?: string[];
  action: FirewallAction;
  logEnabled?: boolean;
  rateLimit?: number;
  scheduleStart?: string;
  scheduleEnd?: string;
  scheduleDays?: number[];
  expiresAt?: Date;
  changeTicket?: string;
}

// ============================================
// IDS/IPS TYPES
// ============================================

export enum IdsSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IdsAction {
  ALERT = 'alert',
  BLOCK = 'block',
  DROP = 'drop',
  RESET = 'reset',
}

export interface IdsSignature {
  id: string;
  signatureId: string;
  signatureName: string;
  category: string;
  severity: IdsSeverity;
  description?: string;
  pattern?: string;
  protocol?: string;
  sourcePortRange?: string;
  destinationPortRange?: string;
  action: IdsAction;
  cveIds?: string[];
  references?: string[];
  isEnabled: boolean;
  falsePositiveRate?: number;
  lastUpdated?: Date;
  createdAt: Date;
}

export interface IdsEvent {
  id: string;
  eventTimestamp: Date;
  signatureId?: string;
  sensorId: string;
  sourceIp: string;
  sourcePort?: number;
  destinationIp: string;
  destinationPort?: number;
  protocol?: string;
  severity: IdsSeverity;
  actionTaken: string;
  packetPayload?: Buffer;
  rawEvent?: string;
  geoSource?: GeoInfo;
  geoDestination?: GeoInfo;
  isInvestigated: boolean;
  investigatedBy?: string;
  investigationNotes?: string;
  falsePositive: boolean;
  createdAt: Date;
}

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  asn?: number;
  org?: string;
}

// ============================================
// DDOS TYPES
// ============================================

export enum DdosProtectionMode {
  DETECT = 'detect',
  MITIGATE = 'mitigate',
  AGGRESSIVE = 'aggressive',
}

export enum DdosAttackStatus {
  ONGOING = 'ongoing',
  MITIGATED = 'mitigated',
  ENDED = 'ended',
}

export interface DdosProtectionProfile {
  id: string;
  profileName: string;
  description?: string;
  protectedResources: string[];
  protectionMode: DdosProtectionMode;
  thresholdPps: number;
  thresholdBps: number;
  thresholdCps: number;
  synFloodProtection: boolean;
  udpFloodProtection: boolean;
  icmpFloodProtection: boolean;
  dnsAmplificationProtection: boolean;
  ntpAmplificationProtection: boolean;
  slowlorisProtection: boolean;
  autoBlacklist: boolean;
  blacklistDurationMinutes: number;
  whitelist?: string[];
  notificationEmails?: string[];
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DdosAttack {
  id: string;
  attackStart: Date;
  attackEnd?: Date;
  attackType: string;
  targetResource: string;
  peakPps?: number;
  peakBps?: number;
  totalPackets?: number;
  totalBytes?: number;
  sourceCount?: number;
  topSources?: Array<{
    ip: string;
    country?: string;
    packets: number;
    bytes: number;
  }>;
  attackVectors?: Record<string, unknown>;
  mitigationActions?: Record<string, unknown>;
  protectionProfileId?: string;
  status: DdosAttackStatus;
  impactAssessment?: string;
  createdAt: Date;
}

export interface DdosBlacklistEntry {
  id: string;
  ipAddress: string;
  reason: string;
  attackId?: string;
  blockedAt: Date;
  expiresAt?: Date;
  isPermanent: boolean;
  autoBlocked: boolean;
  blockedBy?: string;
  createdAt: Date;
}

// ============================================
// VPN TYPES
// ============================================

export enum VpnType {
  IPSEC = 'ipsec',
  OPENVPN = 'openvpn',
  WIREGUARD = 'wireguard',
  SSL_VPN = 'ssl_vpn',
}

export interface VpnProfile {
  id: string;
  profileName: string;
  vpnType: VpnType;
  description?: string;
  serverEndpoint: string;
  allowedNetworks: string[];
  encryptionAlgorithm: string;
  authenticationMethod: string;
  keyExchangeMethod?: string;
  dhGroup?: string;
  pfsEnabled: boolean;
  mfaRequired: boolean;
  idleTimeoutMinutes: number;
  maxSessionHours: number;
  splitTunneling: boolean;
  allowedRoles?: string[];
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VpnSession {
  id: string;
  profileId: string;
  userId: string;
  sessionStart: Date;
  sessionEnd?: Date;
  clientIp: string;
  assignedIp?: string;
  clientDevice?: string;
  clientOs?: string;
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  disconnectReason?: string;
  isActive: boolean;
  createdAt: Date;
}

// ============================================
// NETWORK FLOW TYPES
// ============================================

export interface NetworkFlowLog {
  id: string;
  flowTimestamp: Date;
  sourceIp: string;
  sourcePort?: number;
  destinationIp: string;
  destinationPort?: number;
  protocol: string;
  packets: number;
  bytes: number;
  tcpFlags?: number;
  flowDirection?: 'inbound' | 'outbound' | 'internal';
  zonePair?: string;
  application?: string;
  isEncrypted?: boolean;
  threatScore?: number;
  createdAt: Date;
}

// ============================================
// SUMMARY TYPES
// ============================================

export interface NetworkSecuritySummary {
  activeZones: number;
  activeFirewallRules: number;
  idsEvents24h: number;
  criticalIdsEvents: number;
  uninvestigatedIdsEvents: number;
  activeDdosAttacks: number;
  ddosAttacks24h: number;
  activeVpnSessions: number;
  blacklistedIps: number;
  generatedAt: Date;
}

export interface ThreatSource {
  sourceIp: string;
  eventCount: number;
  severityBreakdown: Record<string, number>;
  firstSeen: Date;
  lastSeen: Date;
}
