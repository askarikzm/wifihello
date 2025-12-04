/**
 * NetAxis ISP - CTDISR-2025 Cryptography Module
 */

import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { CertificateService } from './certificate.service';
import { KeyRotationCron } from './key-rotation.cron';
import { CryptographyController } from './cryptography.controller';

@Module({
  controllers: [CryptographyController],
  providers: [
    EncryptionService,
    CertificateService,
    KeyRotationCron,
  ],
  exports: [
    EncryptionService,
    CertificateService,
  ],
})
export class CryptographyModule {}

export * from './encryption.service';
export * from './certificate.service';
export * from './types';
