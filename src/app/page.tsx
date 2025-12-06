import { OverviewCards } from '@/components/dashboard/overview-cards';
import { InstrumentStatusChart } from '@/components/dashboard/instrument-status-chart';
import { UpcomingMaintenanceList } from '@/components/dashboard/upcoming-maintenance-list';
import { MaintenanceCompletionChart } from '@/components/dashboard/maintenance-completion-chart';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 pt-6 w-full">
      <h2 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h2>
      <div className="space-y-4">
        <Suspense fallback={<Skeleton className="h-24" />}>
          <OverviewCards />
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
    </div>
  );
}
