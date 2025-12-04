/**
 * NetAxis ISP - CTDISR-2025 Key Rotation Cron
 * Automated key rotation scheduler
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EncryptionService } from './encryption.service';
import { CertificateService } from './certificate.service';
import { SecurityEventsService } from '../security-events.service';
import { RotationReason } from './types';
import { CtdisrDomain, IncidentSeverity } from '../types';

@Injectable()
export class KeyRotationCron {
  private readonly logger = new Logger(KeyRotationCron.name);
  private isRunning = false;

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly certificateService: CertificateService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  /**
   * Check for keys needing rotation every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkKeyRotation(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Key rotation check already running, skipping');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting scheduled key rotation check');

    try {
      const keysNeedingRotation = await this.encryptionService.getKeysNeedingRotation();

      if (keysNeedingRotation.length === 0) {
        this.logger.log('No keys require rotation');
        return;
      }

      this.logger.warn(`Found ${keysNeedingRotation.length} keys requiring rotation`);

      for (const key of keysNeedingRotation) {
        try {
          await this.encryptionService.rotateKey({
            keyId: key.key_id,
            reason: RotationReason.SCHEDULED,
            details: {
              daysOverdue: key.days_overdue,
              automated: true,
            },
          });

          this.logger.log(`Successfully rotated key: ${key.key_alias}`);

          // Log security event
          await this.securityEventsService.logSecurityEvent({
            eventType: 'key_rotated',
            source: 'key_rotation_cron',
            severity: 'info',
            domain: CtdisrDomain.CRYPTOGRAPHY,
            description: `Automated key rotation completed for ${key.key_alias}`,
            metadata: {
              keyId: key.key_id,
              keyAlias: key.key_alias,
              daysOverdue: key.days_overdue,
            },
          });
        } catch (err) {
          this.logger.error(`Failed to rotate key ${key.key_alias}: ${err.message}`);

          // Log security incident
          await this.securityEventsService.logSecurityEvent({
            eventType: 'key_rotation_failed',
            source: 'key_rotation_cron',
            severity: 'high',
            domain: CtdisrDomain.CRYPTOGRAPHY,
            description: `Failed to rotate key ${key.key_alias}: ${err.message}`,
            metadata: {
              keyId: key.key_id,
              keyAlias: key.key_alias,
              error: err.message,
            },
          });
        }
      }
    } catch (err) {
      this.logger.error(`Key rotation check failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check for expiring certificates daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkCertificateExpiry(): Promise<void> {
    this.logger.log('Starting certificate expiry check');

    try {
      // Check certificates expiring in 30 days
      const expiringCerts = await this.certificateService.getExpiringCertificates(30);

      if (expiringCerts.length === 0) {
        this.logger.log('No certificates expiring within 30 days');
        return;
      }

      this.logger.warn(`Found ${expiringCerts.length} certificates expiring within 30 days`);

      for (const cert of expiringCerts) {
        const severity = cert.days_until_expiry <= 7 ? 'critical' : 
                        cert.days_until_expiry <= 14 ? 'high' : 'medium';

        await this.securityEventsService.logSecurityEvent({
          eventType: 'certificate_expiring',
          source: 'key_rotation_cron',
          severity,
          domain: CtdisrDomain.CRYPTOGRAPHY,
          description: `Certificate ${cert.cert_alias} expires in ${cert.days_until_expiry} days`,
          metadata: {
            certId: cert.cert_id,
            certAlias: cert.cert_alias,
            subjectCn: cert.subject_cn,
            expiresAt: cert.expires_at,
            daysUntilExpiry: cert.days_until_expiry,
          },
        });

        // Auto-initiate renewal for certificates with auto_renew enabled
        if (cert.days_until_expiry <= 30) {
          try {
            await this.certificateService.initiateCertificateRenewal(cert.cert_id);
            this.logger.log(`Initiated renewal for certificate: ${cert.cert_alias}`);
          } catch (err) {
            this.logger.error(`Failed to initiate renewal for ${cert.cert_alias}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Certificate expiry check failed: ${err.message}`);
    }
  }

  /**
   * Generate daily crypto compliance report
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailyComplianceReport(): Promise<void> {
    this.logger.log('Generating daily crypto compliance report');

    try {
      const summary = await this.encryptionService.getComplianceSummary();

      // Check for compliance issues
      const issues: string[] = [];

      if (summary.keysNeedingRotation > 0) {
        issues.push(`${summary.keysNeedingRotation} keys overdue for rotation`);
      }

      if (summary.certificatesExpiring30Days > 0) {
        issues.push(`${summary.certificatesExpiring30Days} certificates expiring within 30 days`);
      }

      if (summary.failedOperationsToday > 0) {
        issues.push(`${summary.failedOperationsToday} failed crypto operations today`);
      }

      // Log compliance status
      const severity = issues.length > 0 ? 'warning' : 'info';
      await this.securityEventsService.logSecurityEvent({
        eventType: 'crypto_compliance_report',
        source: 'key_rotation_cron',
        severity,
        domain: CtdisrDomain.CRYPTOGRAPHY,
        description: issues.length > 0 
          ? `Crypto compliance issues found: ${issues.join('; ')}`
          : 'Daily crypto compliance check passed',
        metadata: {
          ...summary,
          issues,
        },
      });

      this.logger.log(`Daily crypto compliance report generated: ${issues.length} issues found`);
    } catch (err) {
      this.logger.error(`Failed to generate compliance report: ${err.message}`);
    }
  }

  /**
   * Weekly key inventory audit
   */
  @Cron(CronExpression.EVERY_WEEK)
  async weeklyKeyInventoryAudit(): Promise<void> {
    this.logger.log('Starting weekly key inventory audit');

    try {
      const summary = await this.encryptionService.getComplianceSummary();

      await this.securityEventsService.logSecurityEvent({
        eventType: 'weekly_key_audit',
        source: 'key_rotation_cron',
        severity: 'info',
        domain: CtdisrDomain.CRYPTOGRAPHY,
        description: 'Weekly key inventory audit completed',
        metadata: {
          totalActiveKeys: summary.totalActiveKeys,
          totalActiveCertificates: summary.totalActiveCertificates,
          escrowedKeys: summary.escrowedKeys,
          activePolicies: summary.activePolicies,
        },
      });

      this.logger.log('Weekly key inventory audit completed');
    } catch (err) {
      this.logger.error(`Weekly key audit failed: ${err.message}`);
    }
  }
}
