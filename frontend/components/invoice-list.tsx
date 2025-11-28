type Invoice = {
  id: string;
  invoice_no?: string;
  status?: string;
  amount?: number;
  due_date?: string;
};

export function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  if (!invoices?.length) {
    return <p className="text-sm text-slate-500">No invoices yet.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs uppercase text-slate-500">
        <span>Invoice</span>
        <span>Status</span>
        <span>Amount</span>
        <span>Due</span>
      </div>
      {invoices.map((invoice) => (
        <div key={invoice.id} className="grid grid-cols-4 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span>{invoice.invoice_no ?? invoice.id.slice(0, 8)}</span>
          <span className="capitalize">{invoice.status}</span>
          <span>PKR {invoice.amount?.toFixed?.(0)}</span>
          <span>{invoice.due_date?.slice(0, 10)}</span>
        </div>
      ))}
    </div>
  );
}
