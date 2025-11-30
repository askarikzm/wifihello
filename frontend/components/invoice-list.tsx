import { FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';

type Invoice = {
  id: string;
  invoice_number?: string;
  invoice_no?: string;
  status?: string;
  amount?: number;
  total_amount?: number;
  due_date?: string;
  billing_period_start?: string;
  billing_period_end?: string;
};

function getStatusIcon(status: string | undefined) {
  switch (status?.toLowerCase()) {
    case 'paid':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case 'pending':
    case 'due':
      return <Clock className="h-4 w-4 text-amber-500" />;
    case 'overdue':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4 text-slate-400" />;
  }
}

function getStatusClass(status: string | undefined) {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-700';
    case 'pending':
    case 'due':
      return 'bg-amber-100 text-amber-700';
    case 'overdue':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-PK', { 
    day: 'numeric', 
    month: 'short',
    year: '2-digit'
  });
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return 'PKR 0';
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  if (!invoices?.length) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-medium text-slate-900 mb-3">Recent Invoices</h2>
        <div className="text-center py-8">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No invoices yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-slate-900">Recent Invoices</h2>
        <a href="/invoices" className="text-sm text-blue-600 hover:text-blue-800">
          View all →
        </a>
      </div>
      
      {/* Table header */}
      <div className="grid grid-cols-4 gap-2 text-xs uppercase text-slate-500 font-medium pb-2 border-b border-slate-200">
        <span>Invoice</span>
        <span>Status</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Due Date</span>
      </div>
      
      {/* Invoice rows */}
      <div className="divide-y divide-slate-100">
        {invoices.slice(0, 6).map((invoice) => (
          <div 
            key={invoice.id} 
            className="grid grid-cols-4 gap-2 py-3 items-center hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm font-medium text-slate-900 truncate">
                {invoice.invoice_number || invoice.invoice_no || invoice.id.slice(0, 8)}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5">
              {getStatusIcon(invoice.status)}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getStatusClass(invoice.status)}`}>
                {invoice.status || 'pending'}
              </span>
            </div>
            
            <span className="text-sm font-semibold text-slate-900 text-right">
              {formatCurrency(invoice.total_amount || invoice.amount)}
            </span>
            
            <span className="text-sm text-slate-600 text-right">
              {formatDate(invoice.due_date)}
            </span>
          </div>
        ))}
      </div>
      
      {invoices.length > 6 && (
        <div className="pt-3 border-t border-slate-200 mt-2 text-center">
          <span className="text-xs text-slate-500">
            +{invoices.length - 6} more invoices
          </span>
        </div>
      )}
    </div>
  );
}
