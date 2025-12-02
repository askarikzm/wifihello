import { Test, TestingModule } from '@nestjs/testing';
import { KycController } from './kyc.controller';
import { VerisysService } from './verisys.service';
import { VerificationStatus, KycStatus } from './interfaces';

describe('KycController', () => {
  let controller: KycController;
  let verisysService: VerisysService;

  const mockVerisysService = {
    getKycStatus: jest.fn(),
    getKycConfig: jest.fn(),
    verifyCnic: jest.fn(),
    getVerificationHistory: jest.fn(),
    getAdminKycList: jest.fn(),
    getAdminKycDetail: jest.fn(),
    getAuditLogs: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockRequest = {
    ip: '192.168.1.1',
    socket: { remoteAddress: '192.168.1.1' },
    headers: {
      'user-agent': 'test-agent',
      'x-forwarded-for': '192.168.1.1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KycController],
      providers: [
        { provide: VerisysService, useValue: mockVerisysService },
      ],
    }).compile();

    controller = module.get<KycController>(KycController);
    verisysService = module.get<VerisysService>(VerisysService);

    jest.clearAllMocks();
  });

  describe('getKycStatus', () => {
    it('should return current KYC status', async () => {
      const mockStatus = {
        kycStatus: KycStatus.VERIFIED,
        cnicLast4: '5671',
        verifiedAt: new Date(),
        canVerify: false,
        remainingAttempts: 0,
      };

      mockVerisysService.getKycStatus.mockResolvedValue(mockStatus);
      mockVerisysService.getKycConfig.mockReturnValue({
        kycRequiredForActivation: true,
      });

      const result = await controller.getKycStatus(mockUser);

      expect(result.kycStatus).toBe(KycStatus.VERIFIED);
      expect(result.cnicLast4).toBe('5671');
      expect(result.kycRequired).toBe(true);
      expect(mockVerisysService.getKycStatus).toHaveBeenCalledWith('user-123');
    });
  });

  describe('getKycConfig', () => {
    it('should return KYC configuration', async () => {
      const mockConfig = {
        isEnabled: true,
        kycRequiredForActivation: true,
        maxAttemptsPerDay: 3,
      };

      mockVerisysService.getKycConfig.mockReturnValue(mockConfig);

      const result = await controller.getKycConfig();

      expect(result.isEnabled).toBe(true);
      expect(result.kycRequiredForActivation).toBe(true);
    });
  });

  describe('verifyCnic', () => {
    it('should verify CNIC successfully', async () => {
      const mockDto = {
        cnic: '42101-1234567-1',
        consent: true,
      };

      const mockResult = {
        success: true,
        status: VerificationStatus.VERIFIED,
        verificationId: 'ver-123',
        message: 'Your CNIC has been successfully verified',
        verifiedAt: new Date(),
        attemptNumber: 1,
        remainingAttempts: 2,
      };

      mockVerisysService.verifyCnic.mockResolvedValue(mockResult);

      const result = await controller.verifyCnic(mockUser, mockDto, mockRequest as any);

      expect(result.success).toBe(true);
      expect(result.status).toBe(VerificationStatus.VERIFIED);
      expect(mockVerisysService.verifyCnic).toHaveBeenCalledWith(
        'user-123',
        mockDto,
        expect.objectContaining({
          ip: '192.168.1.1',
          source: 'customer_portal',
        })
      );
    });

    it('should handle verification failure', async () => {
      const mockDto = {
        cnic: '42101-1234567-1',
        consent: true,
      };

      const mockResult = {
        success: false,
        status: VerificationStatus.FAILED,
        verificationId: 'ver-123',
        message: 'CNIC could not be verified',
        attemptNumber: 1,
        remainingAttempts: 2,
      };

      mockVerisysService.verifyCnic.mockResolvedValue(mockResult);

      const result = await controller.verifyCnic(mockUser, mockDto, mockRequest as any);

      expect(result.success).toBe(false);
      expect(result.status).toBe(VerificationStatus.FAILED);
    });
  });

  describe('getVerificationHistory', () => {
    it('should return verification history', async () => {
      const mockHistory = [
        {
          id: 'ver-1',
          cnic_last4: '5671',
          verification_status: 'VERIFIED',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'ver-2',
          cnic_last4: '5671',
          verification_status: 'FAILED',
          created_at: '2024-01-02T00:00:00Z',
        },
      ];

      mockVerisysService.getVerificationHistory.mockResolvedValue(mockHistory);

      const result = await controller.getVerificationHistory(mockUser);

      expect(result).toHaveLength(2);
      expect(mockVerisysService.getVerificationHistory).toHaveBeenCalledWith('user-123');
    });
  });

  describe('Admin Endpoints', () => {
    const mockAdmin = {
      id: 'admin-123',
      email: 'admin@example.com',
      adminRole: 'superadmin',
    };

    describe('getAdminKycList', () => {
      it('should return paginated KYC list', async () => {
        const mockListResponse = {
          data: [
            { id: 'ver-1', customer_name: 'Test User', verification_status: 'VERIFIED' },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        };

        mockVerisysService.getAdminKycList.mockResolvedValue(mockListResponse);

        const result = await controller.getAdminKycList({});

        expect(result.data).toHaveLength(1);
        expect(result.total).toBe(1);
      });

      it('should filter by status', async () => {
        mockVerisysService.getAdminKycList.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        });

        await controller.getAdminKycList({ status: 'VERIFIED' });

        expect(mockVerisysService.getAdminKycList).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'VERIFIED' })
        );
      });
    });

    describe('getAdminKycDetail', () => {
      it('should return KYC detail', async () => {
        const mockDetail = {
          id: 'ver-123',
          customer_name: 'Test User',
          nadra_name: 'Test User NADRA',
          verification_status: 'VERIFIED',
        };

        mockVerisysService.getAdminKycDetail.mockResolvedValue(mockDetail);

        const result = await controller.getAdminKycDetail('ver-123', mockAdmin);

        expect(result.id).toBe('ver-123');
        expect(result.nadra_name).toBe('Test User NADRA');
        expect(mockVerisysService.getAdminKycDetail).toHaveBeenCalledWith('ver-123', 'admin-123');
      });
    });

    describe('getAuditLogs', () => {
      it('should return audit logs', async () => {
        const mockLogs = {
          data: [
            { id: 1, action: 'VERIFY_SUCCESS', status: 'SUCCESS' },
          ],
          total: 1,
        };

        mockVerisysService.getAuditLogs.mockResolvedValue(mockLogs);

        const result = await controller.getAuditLogs();

        expect(result.data).toHaveLength(1);
        expect(mockVerisysService.getAuditLogs).toHaveBeenCalled();
      });
    });
  });
});
