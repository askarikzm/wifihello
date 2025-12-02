'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Loader2,
  Info,
  CreditCard
} from 'lucide-react';

interface KycStatus {
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED';
  cnicLast4?: string;
  verifiedAt?: string;
  kycRequired: boolean;
  canVerify: boolean;
  remainingAttempts?: number;
  message?: string;
}

interface VerificationForm {
  cnic: string;
  cnicIssueDate?: string;
  cnicExpiryDate?: string;
  consent: boolean;
}

interface Props {
  initialStatus?: KycStatus;
}

export function KycVerificationCard({ initialStatus }: Props) {
  const [status, setStatus] = useState<KycStatus | null>(initialStatus || null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<VerificationForm>({
    defaultValues: {
      cnic: '',
      consent: false,
    },
  });

  const consent = watch('consent');

  // Format CNIC as user types
  const formatCnic = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
  };

  const handleCnicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCnic(e.target.value);
    if (formatted.replace(/-/g, '').length <= 13) {
      setValue('cnic', formatted);
    }
  };

  // Fetch KYC status
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/kyc/status', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch KYC status:', err);
    } finally {
      setLoading(false);
    }
  };

  // Submit verification
  const onSubmit = async (data: VerificationForm) => {
    setVerifying(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/proxy/kyc/verify-cnic', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cnic: data.cnic,
          cnicIssueDate: data.cnicIssueDate || undefined,
          cnicExpiryDate: data.cnicExpiryDate || undefined,
          consent: data.consent,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.message || 'Verification failed. Please try again.');
        return;
      }

      if (result.success) {
        setSuccess(result.message || 'Your CNIC has been successfully verified!');
        setStatus({
          ...status!,
          kycStatus: 'VERIFIED',
          verifiedAt: result.verifiedAt,
          canVerify: false,
        });
      } else {
        setError(result.message || 'Verification failed. Please check your details and try again.');
        setStatus({
          ...status!,
          kycStatus: 'FAILED',
          remainingAttempts: result.remainingAttempts,
        });
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) return null;

    const badges = {
      VERIFIED: (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="w-3 h-3 mr-1" />
          Verified
        </Badge>
      ),
      PENDING: (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      ),
      FAILED: (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      ),
      UNVERIFIED: (
        <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Not Verified
        </Badge>
      ),
    };

    return badges[status.kycStatus] || badges.UNVERIFIED;
  };

  // Show loading state
  if (loading && !status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle>Identity Verification (KYC)</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>
          Verify your CNIC through NADRA Verisys for regulatory compliance
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Success Alert */}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Verification Successful</AlertTitle>
            <AlertDescription className="text-green-700">{success}</AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Verification Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Verified Status Display */}
        {status?.kycStatus === 'VERIFIED' && (
          <div className="bg-green-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Your identity has been verified</span>
            </div>
            {status.cnicLast4 && (
              <p className="text-sm text-green-700">
                CNIC ending in: ****-*******-{status.cnicLast4.slice(-1)}
              </p>
            )}
            {status.verifiedAt && (
              <p className="text-sm text-green-600">
                Verified on: {new Date(status.verifiedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Verification Form */}
        {(status?.kycStatus === 'UNVERIFIED' || status?.kycStatus === 'FAILED') && status?.canVerify && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* CNIC Input */}
            <div className="space-y-2">
              <Label htmlFor="cnic">
                CNIC Number <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="cnic"
                  placeholder="42101-1234567-1"
                  className="pl-10"
                  {...register('cnic', {
                    required: 'CNIC is required',
                    pattern: {
                      value: /^[0-9]{5}-[0-9]{7}-[0-9]$/,
                      message: 'Enter valid CNIC format (XXXXX-XXXXXXX-X)',
                    },
                  })}
                  onChange={handleCnicChange}
                />
              </div>
              {errors.cnic && (
                <p className="text-sm text-red-500">{errors.cnic.message}</p>
              )}
            </div>

            {/* Issue & Expiry Dates (Optional) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date (Optional)</Label>
                <Input
                  id="issueDate"
                  type="date"
                  {...register('cnicIssueDate')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Expiry Date (Optional)</Label>
                <Input
                  id="expiryDate"
                  type="date"
                  {...register('cnicExpiryDate')}
                />
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(checked) => setValue('consent', checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="consent" className="text-sm font-medium cursor-pointer">
                  I consent to CNIC verification
                </Label>
                <p className="text-xs text-muted-foreground">
                  I authorize WANCOM to verify my CNIC through NADRA Verisys for identity 
                  verification purposes as required by PTA regulations. My data will be 
                  processed securely and stored in compliance with applicable laws.
                </p>
              </div>
            </div>

            {/* Remaining Attempts */}
            {status?.remainingAttempts !== undefined && status.remainingAttempts < 3 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  You have {status.remainingAttempts} verification attempt(s) remaining today.
                </AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full" 
              disabled={verifying || !consent}
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying with NADRA...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Verify My CNIC
                </>
              )}
            </Button>
          </form>
        )}

        {/* Rate Limited */}
        {status?.canVerify === false && status?.kycStatus !== 'VERIFIED' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Verification Limit Reached</AlertTitle>
            <AlertDescription>
              You have reached the daily verification limit. Please try again tomorrow.
            </AlertDescription>
          </Alert>
        )}

        {/* Info about KYC requirement */}
        {status?.kycRequired && status?.kycStatus !== 'VERIFIED' && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">KYC Required</AlertTitle>
            <AlertDescription className="text-amber-700">
              Identity verification is required to activate your internet service as per 
              PTA regulations (PTRA 1996, CTDISR).
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
