'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wrench, Settings, ClipboardCheck, Calendar } from 'lucide-react';
import { startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';

type MaintenanceCounts = {
  pm: number;
  amc: number;
  calibration: number;
  total: number;
};

export function OverviewCards() {
  const [counts, setCounts] = useState<MaintenanceCounts>({ pm: 0, amc: 0, calibration: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // Fetch schedules for current month
      const { data: schedules } = await supabase
        .from('maintenanceSchedules')
        .select('type, status')
        .gte('dueDate', monthStart.toISOString())
        .lte('dueDate', monthEnd.toISOString());

      // Also fetch results for calibration count
      const { data: results } = await supabase
        .from('maintenanceResults')
        .select('resultType, completedDate')
        .gte('completedDate', monthStart.toISOString())
        .lte('completedDate', monthEnd.toISOString());

      let pm = 0, amc = 0, calibration = 0;

      if (schedules) {
        schedules.forEach(s => {
          if (s.type === 'Preventative Maintenance' || s.type === 'PM') pm++;
          else if (s.type === 'AMC') amc++;
        });
      }

      if (results) {
        results.forEach(r => {
          if (r.resultType === 'calibration') calibration++;
        });
      }

      setCounts({
        pm,
        amc,
        calibration,
        total: pm + amc
      });
      setIsLoading(false);
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cardData = [
    { title: 'Total This Month', value: counts.total, icon: Calendar, description: 'Scheduled maintenance' },
    { title: 'PM', value: counts.pm, icon: Wrench, description: 'Preventative Maintenance' },
    { title: 'AMC', value: counts.amc, icon: Settings, description: 'Annual Maintenance Contract' },
    { title: 'Calibrations', value: counts.calibration, icon: ClipboardCheck, description: 'Completed this month' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cardData.map((card, index) => (
        <Card key={index} className="transition-all hover:shadow-md hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
