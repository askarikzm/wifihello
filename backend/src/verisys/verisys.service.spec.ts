import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { VerisysService } from './verisys.service';
import { SupabaseClientService } from '../database/supabase-client.service';
import { VerificationStatus, KycStatus } from './interfaces';

describe('VerisysService', () => {
  let service: VerisysService;
  let httpService: HttpService;
  let supabaseService: SupabaseClientService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        VERISYS_BASE_URL: 'https://test-nadra.example.com',
        VERISYS_CLIENT_ID: 'test-client-id',
        VERISYS_CLIENT_SECRET: 'test-secret',
        VERISYS_TIMEOUT_MS: 5000,
        VERISYS_VERIFY_ENDPOINT: '/cnic/verify',
        VERISYS_MAX_RETRIES: 2,
        VERISYS_RETRY_DELAY_MS: 100,
        VERISYS_MAX_ATTEMPTS_PER_DAY: 3,
        KYC_REQUIRED_FOR_ACTIVATION: true,
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    rpc: jest.fn(),
  };

  const mockSupabaseService = {
    getClient: jest.fn(() => mockSupabaseClient),
  };

  const mockHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerisysService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: SupabaseClientService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = module.get<VerisysService>(VerisysService);
    httpService = module.get<HttpService>(HttpService);
    supabaseService = module.get<SupabaseClientService>(SupabaseClientService);

    // Initialize the module
    service.onModuleInit();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Module Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report module as enabled when configured', () => {
      expect(service.isModuleEnabled()).toBe(true);
    });

    it('should return KYC config', () => {
      const config = service.getKycConfig();
      expect(config.isEnabled).toBe(true);
      expect(config.kycRequiredForActivation).toBe(true);
      expect(config.maxAttemptsPerDay).toBe(3);
    });
  });

  describe('CNIC Hashing', () => {
    it('should hash CNIC consistently', () => {
      // Access private method via any
      const hash1 = (service as any).hashCnic('42101-1234567-1');
      const hash2 = (service as any).hashCnic('4210112345671');
      
      // Both should produce same hash (dashes removed)
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it('should get last 4 digits of CNIC', () => {
      const last4 = (service as any).getCnicLast4('42101-1234567-1');
      expect(last4).toBe('5671');
    });

    it('should normalize CNIC by removing dashes', () => {
      const normalized = (service as any).normalizeCnic('42101-1234567-1');
      expect(normalized).toBe('4210112345671');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow verification when under limit', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });
      
      const result = await service.canAttemptVerification('user-123');
      
      expect(result.allowed).toBe(true);
    });

    it('should block verification when limit exceeded', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: false, error: null });
      mockSupabaseClient.single.mockResolvedValue({
        data: { attempt_count: 3, blocked_until: null },
        error: null,
      });
      
      const result = await service.canAttemptVerification('user-123');
      
      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
    });
  });

  describe('KYC Status', () => {
    it('should return UNVERIFIED for new user', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

      const status = await service.getKycStatus('user-123');

      expect(status.kycStatus).toBe(KycStatus.UNVERIFIED);
      expect(status.canVerify).toBe(true);
    });

    it('should return VERIFIED for verified user', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { 
          kyc_status: 'VERIFIED', 
          kyc_verified_at: '2024-01-01T00:00:00Z',
          kyc_verification_id: 'ver-123',
        },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { cnic_last4: '5671', verified_at: '2024-01-01T00:00:00Z' },
        error: null,
      });
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

      const status = await service.getKycStatus('user-123');

      expect(status.kycStatus).toBe(KycStatus.VERIFIED);
      expect(status.cnicLast4).toBe('5671');
    });
  });

  describe('CNIC Verification', () => {
    const mockVerifyDto = {
      cnic: '42101-1234567-1',
      consent: true,
    };

    const mockRequestContext = {
      ip: '192.168.1.1',
      userAgent: 'test-agent',
      source: 'test',
    };

    beforeEach(() => {
      // Setup common mocks
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 'customer-123' },
        error: null,
      });
    });

    it('should reject verification without consent', async () => {
      await expect(
        service.verifyCnic('user-123', { ...mockVerifyDto, consent: false }, mockRequestContext)
      ).rejects.toThrow('Consent is required');
    });

    it('should create verification record on initiation', async () => {
      // Mock rate limit check
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });
      
      // Mock customer lookup
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'customer-123' },
        error: null,
      });

      // Mock rate limit upsert
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { attempt_count: 1 },
        error: null,
      });

      // Mock verification insert
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'ver-123', user_id: 'user-123' },
        error: null,
      });

      // Mock audit log insert
      mockSupabaseClient.insert.mockResolvedValue({ error: null });

      // Mock NADRA API response
      mockHttpService.post.mockReturnValue(of({
        data: {
          responseCode: '00',
          responseMessage: 'Success',
          referenceId: 'NADRA-REF-123',
          data: {
            name: 'Test User',
            fatherHusbandName: 'Test Father',
            dateOfBirth: '1990-01-01',
            gender: 'M',
            permanentAddress: 'Test Address',
          },
          timestamp: new Date().toISOString(),
        },
      }));

      // Mock update calls
      mockSupabaseClient.update.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();

      const result = await service.verifyCnic('user-123', mockVerifyDto, mockRequestContext);

      expect(result.success).toBe(true);
      expect(result.status).toBe(VerificationStatus.VERIFIED);
      expect(result.nadraReferenceId).toBe('NADRA-REF-123');
    });

    it('should handle NADRA API failure gracefully', async () => {
      // Setup mocks for failure scenario
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'customer-123' },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { attempt_count: 1 },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'ver-123', user_id: 'user-123' },
        error: null,
      });
      mockSupabaseClient.insert.mockResolvedValue({ error: null });

      // Mock NADRA API error
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      await expect(
        service.verifyCnic('user-123', mockVerifyDto, mockRequestContext)
      ).rejects.toThrow('Verification service temporarily unavailable');
    });

    it('should handle NADRA verification failure (non-00 code)', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'customer-123' },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { attempt_count: 1 },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'ver-123', user_id: 'user-123' },
        error: null,
      });
      mockSupabaseClient.insert.mockResolvedValue({ error: null });
      mockSupabaseClient.update.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();

      // Mock NADRA API failure response
      mockHttpService.post.mockReturnValue(of({
        data: {
          responseCode: '02',
          responseMessage: 'CNIC not found',
          referenceId: 'NADRA-REF-456',
          timestamp: new Date().toISOString(),
        },
      }));

      const result = await service.verifyCnic('user-123', mockVerifyDto, mockRequestContext);

      expect(result.success).toBe(false);
      expect(result.status).toBe(VerificationStatus.FAILED);
      expect(result.message).toContain('could not be verified');
    });
  });

  describe('KYC Verification Check', () => {
    it('should return true when KYC not required', async () => {
      // Override config to disable KYC requirement
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'KYC_REQUIRED_FOR_ACTIVATION') return false;
        return defaultValue;
      });

      // Reinitialize service
      service.onModuleInit();

      const result = await service.isKycVerified('user-123');
      expect(result).toBe(true);
    });

    it('should check customer KYC status when required', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: { kyc_status: 'VERIFIED' },
        error: null,
      });

      const result = await service.isKycVerified('user-123');
      expect(result).toBe(true);
    });

    it('should return false for unverified customer', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: { kyc_status: 'UNVERIFIED' },
        error: null,
      });

      const result = await service.isKycVerified('user-123');
      expect(result).toBe(false);
    });
  });
});
