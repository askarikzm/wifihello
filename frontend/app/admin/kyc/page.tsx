'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Shield, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Eye,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';

interface KycRecord {
  id: string;
  user_id: string;
  customer_id?: string;
  account_no?: string;
  customer_name?: string;
  customer_phone?: string;
  cnic_last4: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  nadra_name?: string;
  nadra_father_husband_name?: string;
  nadra_dob?: string;
  nadra_permanent_address?: string;
  nadra_present_address?: string;
  nadra_response_code?: string;
  nadra_reference_id?: string;
  consent_given: boolean;
  consent_timestamp?: string;
  attempt_number: number;
  request_source: string;
  created_at: string;
  verified_at?: string;
}

interface KycListResponse {
  data: KycRecord[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  moduleEnabled?: boolean;
  message?: string;
}

function AdminKycContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [data, setData] = useState<KycListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<KycRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status && status !== 'all') params.set('status', status);
      params.set('page', page.toString());
      params.set('limit', '20');

      const res = await fetch(`/api/proxy/kyc/admin/list?${params.toString()}`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setModuleEnabled(result.moduleEnabled !== false);
      } else {
        // Handle non-ok response gracefully
        setData({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
        setModuleEnabled(false);
      }
    } catch (err) {
      console.error('Failed to fetch KYC data:', err);
      setData({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      setModuleEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  const handleViewDetail = async (record: KycRecord) => {
    try {
      const res = await fetch(`/api/proxy/kyc/admin/detail/${record.id}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const detail = await res.json();
        setSelectedRecord(detail);
        setShowDetail(true);
      }
    } catch (err) {
      console.error('Failed to fetch detail:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, JSX.Element> = {
      VERIFIED: (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Verified
        </Badge>
      ),
      PENDING: (
        <Badge className="bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      ),
      FAILED: (
        <Badge className="bg-red-100 text-red-800">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      ),
      EXPIRED: (
        <Badge className="bg-gray-100 text-gray-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Expired
        </Badge>
      ),
    };
    return badges[status] || badges.PENDING;
  };

  const exportToCsv = () => {
    if (!data?.data) return;
    
    const headers = ['Account No', 'Customer Name', 'CNIC Last 4', 'Status', 'NADRA Name', 'Verified At', 'Created At'];
    const rows = data.data.map(r => [
      r.account_no || '',
      r.customer_name || '',
      r.cnic_last4,
      r.verification_status,
      r.nadra_name || '',
      r.verified_at || '',
      r.created_at,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kyc-records-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6" />
            KYC Management
          </h1>
          <p className="text-muted-foreground">
            View and manage customer identity verifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCsv} disabled={!moduleEnabled}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Module Not Enabled Warning */}
      {!moduleEnabled && !loading && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
              <div>
                <h3 className="font-semibold text-yellow-800">KYC Module Not Enabled</h3>
                <p className="text-sm text-yellow-700">
                  The NADRA Verisys KYC module is not currently enabled. Please contact your administrator to enable this feature.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {moduleEnabled && (
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Verifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.pagination?.total || data?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">
              Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data?.data?.filter(r => r.verification_status === 'VERIFIED').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {data?.data?.filter(r => r.verification_status === 'PENDING').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {data?.data?.filter(r => r.verification_status === 'FAILED').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Filters */}
      {moduleEnabled && (
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, account, CNIC last 4..."
                className="pl-10"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="VERIFIED">Verified</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Table */}
      {moduleEnabled && (
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>CNIC (Last 4)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>NADRA Name</TableHead>
                  <TableHead>Verified At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {record.account_no || '-'}
                    </TableCell>
                    <TableCell>{record.customer_name || '-'}</TableCell>
                    <TableCell className="font-mono">
                      ****-*******-{record.cnic_last4.slice(-1)}
                    </TableCell>
                    <TableCell>{getStatusBadge(record.verification_status)}</TableCell>
                    <TableCell>{record.nadra_name || '-'}</TableCell>
                    <TableCell>
                      {record.verified_at
                        ? new Date(record.verified_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetail(record)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.data || data.data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No KYC records found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}

      {/* Pagination */}
      {moduleEnabled && data && (data.pagination?.totalPages || data.totalPages || 0) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.pagination?.total || data.total || 0)} of {data.pagination?.total || data.total || 0} records
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === (data.pagination?.totalPages || data.totalPages)}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              KYC Verification Details
            </DialogTitle>
            <DialogDescription>
              Full verification record for compliance review
            </DialogDescription>
          </DialogHeader>
          
          {selectedRecord && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="font-medium">Verification Status</span>
                {getStatusBadge(selectedRecord.verification_status)}
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Account No</label>
                  <p className="font-medium">{selectedRecord.account_no || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Customer Name</label>
                  <p className="font-medium">{selectedRecord.customer_name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Phone</label>
                  <p className="font-medium">{selectedRecord.customer_phone || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">CNIC (Last 4)</label>
                  <p className="font-mono">{selectedRecord.cnic_last4}</p>
                </div>
              </div>

              {/* NADRA Data */}
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">NADRA Verification Data</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Name (as per CNIC)</label>
                    <p className="font-medium">{selectedRecord.nadra_name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Father/Husband Name</label>
                    <p className="font-medium">{selectedRecord.nadra_father_husband_name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Date of Birth</label>
                    <p className="font-medium">
                      {selectedRecord.nadra_dob 
                        ? new Date(selectedRecord.nadra_dob).toLocaleDateString() 
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">NADRA Reference</label>
                    <p className="font-mono text-sm">{selectedRecord.nadra_reference_id || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-muted-foreground">Permanent Address</label>
                    <p className="font-medium">{selectedRecord.nadra_permanent_address || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-muted-foreground">Present Address</label>
                    <p className="font-medium">{selectedRecord.nadra_present_address || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Consent & Audit */}
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">Consent & Audit Info</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Consent Given</label>
                    <p className="font-medium">
                      {selectedRecord.consent_given ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Consent Timestamp</label>
                    <p className="font-medium">
                      {selectedRecord.consent_timestamp
                        ? new Date(selectedRecord.consent_timestamp).toLocaleString()
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Attempt Number</label>
                    <p className="font-medium">{selectedRecord.attempt_number}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Request Source</label>
                    <p className="font-medium">{selectedRecord.request_source}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Created At</label>
                    <p className="font-medium">
                      {new Date(selectedRecord.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Verified At</label>
                    <p className="font-medium">
                      {selectedRecord.verified_at
                        ? new Date(selectedRecord.verified_at).toLocaleString()
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminKycPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    }>
      <AdminKycContent />
    </Suspense>
  );
}
