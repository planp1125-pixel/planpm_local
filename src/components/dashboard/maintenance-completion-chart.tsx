'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';

type MonthData = {
  name: string;
  onTime: number;
  overdue: number;
};

export function MaintenanceCompletionChart() {
  const [data, setData] = useState<MonthData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get last 6 months data
        const months: MonthData[] = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
          const monthDate = subMonths(now, i);
          const monthStart = startOfMonth(monthDate);
          const monthEnd = endOfMonth(monthDate);

          // Fetch completed schedules for this month
          const { data: schedules } = await supabase
            .from('maintenanceSchedules')
            .select('dueDate, completedDate, status')
            .gte('dueDate', monthStart.toISOString())
            .lte('dueDate', monthEnd.toISOString());

          let onTime = 0;
          let overdue = 0;

          if (schedules) {
            schedules.forEach(schedule => {
              if (schedule.status === 'Completed') {
                // Check if completed on time (completed before or on due date)
                if (schedule.completedDate) {
                  const completedDate = new Date(schedule.completedDate);
                  const dueDate = new Date(schedule.dueDate);
                  if (completedDate <= dueDate) {
                    onTime++;
                  } else {
                    overdue++;
                  }
                } else {
                  onTime++; // If completed but no completedDate, assume on time
                }
              } else if (schedule.status !== 'Scheduled') {
                // If past due and not completed
                const dueDate = new Date(schedule.dueDate);
                if (dueDate < now) {
                  overdue++;
                }
              }
            });
          }

          months.push({
            name: format(monthDate, 'MMM'),
            onTime,
            overdue
          });
        }

        setData(months);
      } catch (error) {
        console.error('Error fetching chart data:', error);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-4 transition-all hover:shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Maintenance History</CardTitle>
          <CardDescription>On-time vs. Overdue maintenance over the last 6 months.</CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = data.some(d => d.onTime > 0 || d.overdue > 0);

  return (
    <Card className="col-span-1 lg:col-span-4 transition-all hover:shadow-md">
      <CardHeader>
        <CardTitle className="font-headline">Maintenance History</CardTitle>
        <CardDescription>On-time vs. Overdue maintenance over the last 6 months.</CardDescription>
      </CardHeader>
      <CardContent className="pl-2">
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'hsla(var(--muted), 0.5)' }}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                }}
              />
              <Legend iconSize={10} />
              <Bar dataKey="onTime" name="On Time" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="overdue" name="Overdue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p>No maintenance data available yet. Complete some maintenance tasks to see the chart.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
