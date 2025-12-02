import { Suspense } from 'react';
import { Metadata } from 'next';
import { KycVerificationCard } from '@/components/kyc';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Identity Verification (KYC) | WANCOM',
  description: 'Verify your identity through NADRA Verisys',
};

function KycSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function KycPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Identity Verification</h1>
          <p className="text-muted-foreground">
            Verify your CNIC through NADRA Verisys as required by PTA regulations
          </p>
        </div>

        <Suspense fallback={<KycSkeleton />}>
          <KycVerificationCard />
        </Suspense>

        {/* Information Section */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-2">Why is KYC required?</h3>
            <p className="text-sm text-muted-foreground">
              As per PTA regulations (PTRA 1996, CTDISR), all ISP subscribers must 
              verify their identity using CNIC before service activation.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-2">How does it work?</h3>
            <p className="text-sm text-muted-foreground">
              Your CNIC is verified through NADRA Verisys, the official government 
              system for identity verification. The process is instant and secure.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-2">Is my data secure?</h3>
            <p className="text-sm text-muted-foreground">
              Yes. Your CNIC is encrypted and never stored in plain text. We only 
              retain the verification status and last 4 digits for reference.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
