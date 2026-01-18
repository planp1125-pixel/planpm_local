import { InstrumentStatusChart } from '@/components/dashboard/instrument-status-chart';
import { UpcomingMaintenanceList } from '@/components/dashboard/upcoming-maintenance-list';
import { MaintenanceCompletionChart } from '@/components/dashboard/maintenance-completion-chart';
import { MaintenanceSummary } from '@/components/dashboard/maintenance-summary';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
// import { AdvisorFloatingWidget } from '@/components/advisor/advisor-floating-widget';

export default function DashboardPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 pt-6 w-full">
      <div className="space-y-4">
        <Suspense fallback={<Skeleton className="h-48" />}>
          <MaintenanceSummary />
        </Suspense>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Suspense fallback={<Skeleton className="h-[400px] col-span-1 lg:col-span-4" />}>
            <MaintenanceCompletionChart />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-[400px] col-span-1 lg:col-span-3" />}>
            <InstrumentStatusChart />
          </Suspense>
        </div>
        <Suspense fallback={<Skeleton className="h-[300px]" />}>
          <UpcomingMaintenanceList />
        </Suspense>

      </div>
      {/* <AdvisorFloatingWidget /> */}
    </div>
  );
}
