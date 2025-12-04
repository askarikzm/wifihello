/**
 * NetAxis ISP - CTDISR-2025 Certificate Service
 * X.509 Certificate management and lifecycle
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Certificate,
  CertificateStatus,
  CertificateType,
  CreateCertificateDto,
  RevokeCertificateDto,
  CryptoOperationType,
  CryptoAuditStatus,
} from './types';

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ============================================
  // CERTIFICATE MANAGEMENT
  // ============================================

  /**
   * Get all active certificates
   */
  async getActiveCertificates(): Promise<Certificate[]> {
    const { data, error } = await this.supabase
      .from('ctdisr.certificates')
      .select('*')
      .eq('status', CertificateStatus.ACTIVE)
      .order('not_after', { ascending: true });

    if (error) {
      throw new Error(`Failed to get certificates: ${error.message}`);
    }

    return (data || []).map(this.mapCertFromDb);
  }

  /**
   * Get certificate by alias
   */
  async getCertificateByAlias(alias: string): Promise<Certificate | null> {
    const { data, error } = await this.supabase
      .from('ctdisr.certificates')
      .select('*')
      .eq('cert_alias', alias)
      .single();

    if (error || !data) return null;
    return this.mapCertFromDb(data);
  }

  /**
   * Get certificate by fingerprint
   */
  async getCertificateByFingerprint(fingerprint: string): Promise<Certificate | null> {
    const { data, error } = await this.supabase
      .from('ctdisr.certificates')
      .select('*')
      .eq('fingerprint_sha256', fingerprint.toLowerCase())
      .single();

    if (error || !data) return null;
    return this.mapCertFromDb(data);
  }

  /**
   * Import a certificate
   */
  async importCertificate(
    certPem: string,
    alias: string,
    certType: CertificateType,
    userId?: string,
  ): Promise<Certificate> {
    const certInfo = this.parseCertificate(certPem);
    
    const { data, error } = await this.supabase
      .from('ctdisr.certificates')
      .insert({
        cert_alias: alias,
        subject_cn: certInfo.subjectCn,
        subject_dn: certInfo.subjectDn,
        issuer_dn: certInfo.issuerDn,
        serial_number: certInfo.serialNumber,
        cert_type: certType,
        key_algorithm: certInfo.keyAlgorithm,
        signature_algorithm: certInfo.signatureAlgorithm,
        key_size: certInfo.keySize,
        not_before: certInfo.notBefore,
        not_after: certInfo.notAfter,
        certificate_pem: certPem,
        fingerprint_sha256: certInfo.fingerprint,
        status: CertificateStatus.ACTIVE,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      await this.logCertOperation(CryptoOperationType.CERT_ISSUE, {
        status: CryptoAuditStatus.FAILED,
        userId,
        failureReason: error.message,
      });
      throw new Error(`Failed to import certificate: ${error.message}`);
    }

    await this.logCertOperation(CryptoOperationType.CERT_ISSUE, {
      certificateId: data.id,
      status: CryptoAuditStatus.SUCCESS,
      userId,
      operationDetails: { alias, certType },
    });

    this.logger.log(`Imported certificate: ${alias}`);
    return this.mapCertFromDb(data);
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(dto: RevokeCertificateDto, userId?: string): Promise<void> {
    const { error } = await this.supabase
      .from('ctdisr.certificates')
      .update({
        status: CertificateStatus.REVOKED,
        revocation_reason: dto.reason,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', dto.certificateId);

    if (error) {
      await this.logCertOperation(CryptoOperationType.CERT_REVOKE, {
        certificateId: dto.certificateId,
        status: CryptoAuditStatus.FAILED,
        userId,
        failureReason: error.message,
      });
      throw new Error(`Failed to revoke certificate: ${error.message}`);
    }

    await this.logCertOperation(CryptoOperationType.CERT_REVOKE, {
      certificateId: dto.certificateId,
      status: CryptoAuditStatus.SUCCESS,
      userId,
      operationDetails: { reason: dto.reason },
    });

    this.logger.warn(`Revoked certificate: ${dto.certificateId}`);
  }

  /**
   * Get expiring certificates
   */
  async getExpiringCertificates(daysAhead: number = 30): Promise<Certificate[]> {
    const { data, error } = await this.supabase
      .rpc('ctdisr.get_expiring_certificates', { p_days_ahead: daysAhead });

    if (error) {
      throw new Error(`Failed to get expiring certificates: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Initiate certificate renewal
   */
  async initiateCertificateRenewal(certificateId: string, userId?: string): Promise<string> {
    const cert = await this.getCertificateById(certificateId);
    if (!cert) {
      throw new Error('Certificate not found');
    }

    const { data, error } = await this.supabase
      .from('ctdisr.certificate_renewals')
      .insert({
        certificate_id: certificateId,
        old_fingerprint: cert.fingerprintSha256,
        renewal_status: 'pending',
        initiated_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to initiate renewal: ${error.message}`);
    }

    this.logger.log(`Initiated renewal for certificate: ${cert.certAlias}`);
    return data.id;
  }

  /**
   * Complete certificate renewal
   */
  async completeCertificateRenewal(
    renewalId: string,
    newCertPem: string,
    userId?: string,
  ): Promise<Certificate> {
    const { data: renewal, error: renewalError } = await this.supabase
      .from('ctdisr.certificate_renewals')
      .select('*, certificates(*)')
      .eq('id', renewalId)
      .single();

    if (renewalError || !renewal) {
      throw new Error('Renewal record not found');
    }

    const oldCert = renewal.certificates;
    const newCertInfo = this.parseCertificate(newCertPem);

    // Update the existing certificate with new data
    const { data: updatedCert, error: updateError } = await this.supabase
      .from('ctdisr.certificates')
      .update({
        not_before: newCertInfo.notBefore,
        not_after: newCertInfo.notAfter,
        certificate_pem: newCertPem,
        fingerprint_sha256: newCertInfo.fingerprint,
        serial_number: newCertInfo.serialNumber,
        status: CertificateStatus.ACTIVE,
      })
      .eq('id', oldCert.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update certificate: ${updateError.message}`);
    }

    // Mark renewal as completed
    await this.supabase
      .from('ctdisr.certificate_renewals')
      .update({
        new_fingerprint: newCertInfo.fingerprint,
        renewal_status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', renewalId);

    this.logger.log(`Completed renewal for certificate: ${oldCert.cert_alias}`);
    return this.mapCertFromDb(updatedCert);
  }

  // ============================================
  // CERTIFICATE VALIDATION
  // ============================================

  /**
   * Validate certificate chain
   */
  validateCertificateChain(certPem: string, caCertPem?: string): boolean {
    try {
      // This would typically use OpenSSL or a certificate validation library
      // For now, we perform basic validation
      const cert = this.parseCertificate(certPem);
      
      // Check expiry
      const now = new Date();
      if (now < cert.notBefore || now > cert.notAfter) {
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error(`Certificate validation failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Check if certificate is about to expire
   */
  isCertificateExpiring(cert: Certificate, daysThreshold: number = 30): boolean {
    const expiryDate = new Date(cert.notAfter);
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + daysThreshold);
    return expiryDate <= warningDate;
  }

  // ============================================
  // HELPERS
  // ============================================

  private async getCertificateById(id: string): Promise<Certificate | null> {
    const { data, error } = await this.supabase
      .from('ctdisr.certificates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapCertFromDb(data);
  }

  private parseCertificate(certPem: string): {
    subjectCn: string;
    subjectDn: string;
    issuerDn: string;
    serialNumber: string;
    keyAlgorithm: string;
    signatureAlgorithm: string;
    keySize: number;
    notBefore: Date;
    notAfter: Date;
    fingerprint: string;
  } {
    // Create X509Certificate from PEM
    const x509 = new crypto.X509Certificate(certPem);
    
    return {
      subjectCn: this.extractCN(x509.subject),
      subjectDn: x509.subject,
      issuerDn: x509.issuer,
      serialNumber: x509.serialNumber,
      keyAlgorithm: x509.publicKey.asymmetricKeyType || 'RSA',
      signatureAlgorithm: x509.sigAlgName || 'SHA256withRSA',
      keySize: this.getKeySize(x509.publicKey),
      notBefore: new Date(x509.validFrom),
      notAfter: new Date(x509.validTo),
      fingerprint: x509.fingerprint256.replace(/:/g, '').toLowerCase(),
    };
  }

  private extractCN(subject: string): string {
    const cnMatch = subject.match(/CN=([^,]+)/);
    return cnMatch ? cnMatch[1] : '';
  }

  private getKeySize(publicKey: crypto.KeyObject): number {
    // Get key size in bits
    const keyDetails = publicKey.asymmetricKeyDetails;
    return keyDetails?.modulusLength || keyDetails?.namedCurve ? 256 : 2048;
  }

  private mapCertFromDb(data: any): Certificate {
    return {
      id: data.id,
      certAlias: data.cert_alias,
      subjectCn: data.subject_cn,
      subjectDn: data.subject_dn,
      issuerDn: data.issuer_dn,
      serialNumber: data.serial_number,
      certType: data.cert_type,
      keyAlgorithm: data.key_algorithm,
      signatureAlgorithm: data.signature_algorithm,
      keySize: data.key_size,
      notBefore: new Date(data.not_before),
      notAfter: new Date(data.not_after),
      certificatePem: data.certificate_pem,
      fingerprintSha256: data.fingerprint_sha256,
      status: data.status,
      revocationReason: data.revocation_reason,
      revokedAt: data.revoked_at ? new Date(data.revoked_at) : undefined,
      autoRenew: data.auto_renew,
      renewalDaysBefore: data.renewal_days_before,
      associatedDomains: data.associated_domains,
      certificateMetadata: data.certificate_metadata,
      createdBy: data.created_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private async logCertOperation(
    operationType: CryptoOperationType,
    params: {
      certificateId?: string;
      userId?: string;
      status: CryptoAuditStatus;
      failureReason?: string;
      operationDetails?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.supabase.from('ctdisr.crypto_audit_log').insert({
        operation_type: operationType,
        certificate_id: params.certificateId,
        user_id: params.userId,
        status: params.status,
        failure_reason: params.failureReason,
        operation_details: params.operationDetails || {},
      });
    } catch (err) {
      this.logger.error(`Failed to log certificate operation: ${err.message}`);
    }
  }
}
