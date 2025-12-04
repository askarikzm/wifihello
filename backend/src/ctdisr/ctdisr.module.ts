/**
 * NetAxis ISP - CTDISR-2025 Module
 * Critical Telecom Data & Infrastructure Security Regulations 2025
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CtdisrService } from './ctdisr.service';
import { SecurityEventsService } from './security-events.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { CtdisrAdminController } from './ctdisr-admin.controller';
import { CtdisrPolicyGuard } from './ctdisr-policy.guard';
import { CtdisrComplianceInterceptor } from './ctdisr-compliance.interceptor';
import { AssetService } from './assets/asset.service';
import { AssetController } from './assets/asset.controller';
import { AccessControlService } from './access-control/access-control.service';
import { AccessControlController } from './access-control/access-control.controller';
import { EncryptionService } from './cryptography/encryption.service';
import { CertificateService } from './cryptography/certificate.service';
import { KeyRotationCron } from './cryptography/key-rotation.cron';
import { CryptographyController } from './cryptography/cryptography.controller';
import { AuditLoggingService } from './logging/audit-logging.service';
import { SiemForwarderService } from './logging/siem-forwarder.service';
import { AlertService } from './logging/alert.service';
import { LoggingController } from './logging/logging.controller';
import { NetworkSecurityService } from './network-security/network-security.service';
import { NetworkSecurityController } from './network-security/network-security.controller';
import { IncidentResponseService } from './incident-response/incident-response.service';
import { ForensicsService } from './incident-response/forensics.service';
import { IncidentResponseController, ForensicsController } from './incident-response/incident-response.controller';
import { DisasterRecoveryService } from './disaster-recovery/disaster-recovery.service';
import { BackupService } from './disaster-recovery/backup.service';
import { BcpController, DrpController, BackupController } from './disaster-recovery/disaster-recovery.controller';
import { VendorService } from './vendor-security/vendor.service';
import { VendorAssessmentService } from './vendor-security/vendor-assessment.service';
import { VendorController, VendorAssessmentController } from './vendor-security/vendor-security.controller';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [
    CtdisrAdminController,
    AssetController,
    AccessControlController,
    CryptographyController,
    LoggingController,
    NetworkSecurityController,
    IncidentResponseController,
    ForensicsController,
    BcpController,
    DrpController,
    BackupController,
    VendorController,
    VendorAssessmentController,
  ],
  providers: [
    CtdisrService,
    SecurityEventsService,
    ApprovalWorkflowService,
    AssetService,
    AccessControlService,
    EncryptionService,
    CertificateService,
    KeyRotationCron,
    AuditLoggingService,
    SiemForwarderService,
    AlertService,
    NetworkSecurityService,
    IncidentResponseService,
    ForensicsService,
    DisasterRecoveryService,
    BackupService,
    VendorService,
    VendorAssessmentService,
    CtdisrPolicyGuard,
    CtdisrComplianceInterceptor,
  ],
  exports: [
    CtdisrService,
    SecurityEventsService,
    ApprovalWorkflowService,
    AssetService,
    AccessControlService,
    EncryptionService,
    CertificateService,
    AuditLoggingService,
    SiemForwarderService,
    AlertService,
    NetworkSecurityService,
    IncidentResponseService,
    ForensicsService,
    DisasterRecoveryService,
    BackupService,
    VendorService,
    VendorAssessmentService,
    CtdisrPolicyGuard,
    CtdisrComplianceInterceptor,
  ],
})
export class CtdisrModule {}
