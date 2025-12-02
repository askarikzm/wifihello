'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Shield
} from 'lucide-react';

type KycStatusType = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED';

interface Props {
  initialStatus?: KycStatusType;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function KycStatusBadge({ initialStatus, showLabel = true, size = 'md' }: Props) {
  const [status, setStatus] = useState<KycStatusType>(initialStatus || 'UNVERIFIED');
  const [loading, setLoading] = useState(!initialStatus);

  useEffect(() => {
    if (!initialStatus) {
      fetchStatus();
    }
  }, [initialStatus]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/proxy/kyc/status', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.kycStatus);
      }
    } catch (err) {
      console.error('Failed to fetch KYC status:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Badge variant="outline" className="animate-pulse">
        <Clock className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'}`} />
        {showLabel && <span className="ml-1">Loading...</span>}
      </Badge>
    );
  }

  const statusConfig = {
    VERIFIED: {
      icon: CheckCircle,
      label: 'KYC Verified',
      className: 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200',
    },
    PENDING: {
      icon: Clock,
      label: 'KYC Pending',
      className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200',
    },
    FAILED: {
      icon: XCircle,
      label: 'KYC Failed',
      className: 'bg-red-100 text-red-800 hover:bg-red-100 border-red-200',
    },
    UNVERIFIED: {
      icon: AlertTriangle,
      label: 'KYC Required',
      className: 'bg-gray-100 text-gray-800 hover:bg-gray-100 border-gray-200',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <Badge className={config.className}>
      <Icon className={iconSize} />
      {showLabel && <span className="ml-1">{config.label}</span>}
    </Badge>
  );
}

/**
 * Simple KYC indicator for headers/navbars
 */
export function KycIndicator() {
  const [status, setStatus] = useState<KycStatusType>('UNVERIFIED');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/proxy/kyc/status', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.kycStatus);
      }
    } catch (err) {
      console.error('Failed to fetch KYC status:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  if (status === 'VERIFIED') {
    return (
      <div className="flex items-center gap-1 text-green-600" title="Identity Verified">
        <Shield className="w-4 h-4 fill-green-100" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-amber-600" title="KYC Required">
      <AlertTriangle className="w-4 h-4" />
    </div>
  );
}
