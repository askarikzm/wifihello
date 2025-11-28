import { Card } from '@/components/ui/card';
import { UsageSparkline } from '@/components/usage-sparkline';
import { InvoiceList } from '@/components/invoice-list';

export function DashboardShell({
  invoices,
  subscriberName,
}: {
  invoices: any[];
  subscriberName?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Welcome back{subscriberName ? `, ${subscriberName}` : ''}</h1>
        <p className="text-sm text-slate-600">Track usage, invoices, and payments in one place.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <UsageSparkline />
        </Card>
        <Card className="md:col-span-2">
          <InvoiceList invoices={invoices} />
        </Card>
      </section>
    </main>
  );
}
