'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { differenceInDays, addWeeks, addMonths, addYears } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { MaintenanceEvent, Instrument, MaintenanceConfiguration, MaintenanceFrequency } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';
import { UpdateMaintenanceDialog } from '../maintenance/update-maintenance-dialog';
import { ViewMaintenanceResultDialog } from '../maintenance/view-maintenance-result-dialog';
import { CheckCircle, Clock, AlertCircle, CircleDot, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MaintenanceStatus = 'Completed' | 'Pending' | 'Partially Completed' | 'Overdue';
type SortField = 'instrument' | 'type' | 'location' | 'dueDate' | 'status' | 'daysLeft' | 'instrumentType';
type SortOrder = 'asc' | 'desc';
type TimeRange = '30' | '90' | '180' | '365';

interface EnhancedEvent extends MaintenanceEvent {
  maintenanceStatus: MaintenanceStatus;
  totalSections?: number;
  completedSections?: number;
}

import { useAuth } from '@/contexts/auth-context';

const getNextDate = (date: Date, frequency: MaintenanceFrequency): Date => {
  switch (frequency) {
    case 'Weekly': return addWeeks(date, 1);
    case 'Monthly': return addMonths(date, 1);
    case '3 Months': return addMonths(date, 3);
    case '6 Months': return addMonths(date, 6);
    case '1 Year': return addYears(date, 1);
    default: return date;
  }
};

export function UpcomingMaintenanceList() {
  const { user } = useAuth();
  const [upcomingSchedules, setUpcomingSchedules] = useState<EnhancedEvent[]>([]);
  const [instrumentsMap, setInstrumentsMap] = useState<Record<string, Instrument>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState<MaintenanceEvent | null>(null);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [viewSchedule, setViewSchedule] = useState<MaintenanceEvent | null>(null);
  const [viewInstrumentId, setViewInstrumentId] = useState<string>('');

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('30');
  const [sortField, setSortField] = useState<SortField>('dueDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const fetchUpcoming = async () => {
    setIsLoading(true);
    const days = parseInt(timeRange);
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    try {
      // 1. Fetch Instruments
      const { data: instruments } = await supabase.from('instruments').select('*');
      const instMap: Record<string, Instrument> = {};
      instruments?.forEach(i => instMap[i.id] = i);
      setInstrumentsMap(instMap);

      // 2. Fetch Maintenance Configurations
      const { data: configs } = await supabase.from('maintenance_configurations').select('*');

      // 3. Fetch Active/History Schedules
      const { data: schedules } = await supabase.from('maintenanceSchedules').select('*');

      // 4. Fetch Results (for status calculation)
      const { data: results } = await supabase.from('maintenanceResults').select('*');

      const combinedEvents: EnhancedEvent[] = [];

      // Helper to determine status (same as before)
      const getMaintenanceStatus = (scheduleId: string, dueDate: string): { status: MaintenanceStatus; totalSections: number; completedSections: number } => {
        const result = results?.find(r => r.maintenanceScheduleId === scheduleId);
        if (!result) {
          const isPastDue = new Date(dueDate) < new Date();
          return { status: isPastDue ? 'Overdue' : 'Pending', totalSections: 0, completedSections: 0 };
        }
        const testData = result.testData as any[] | null;
        if (testData && Array.isArray(testData)) {
          const totalSections = testData.length;
          const completedSections = testData.filter(section =>
            section.rows?.every((row: any) => row.measured !== undefined)
          ).length;
          if (completedSections === 0) return { status: 'Pending', totalSections, completedSections };
          else if (completedSections < totalSections) return { status: 'Partially Completed', totalSections, completedSections };
        }
        return { status: 'Completed', totalSections: 0, completedSections: 0 };
      };

      // Process each configuration
      if (configs && instruments) {
        configs.forEach((config: MaintenanceConfiguration) => {
          // Find any EXISTING open schedule for this config (approx match on type/instrument)
          // Ideally maintenanceSchedules should have config_id, but current schema might not.
          // We match by instrumentId and type.
          const existingSchedules = schedules?.filter(s =>
            s.instrumentId === config.instrument_id &&
            s.type === config.maintenance_type
          ) || [];

          // Sort by date desc
          existingSchedules.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

          // Check if the latest one is open (Scheduled/In Progress/Overdue)
          const openSchedule = existingSchedules.find(s => s.status !== 'Completed');

          if (openSchedule) {
            // Use the real schedule
            const { status, totalSections, completedSections } = getMaintenanceStatus(openSchedule.id, openSchedule.dueDate);
            combinedEvents.push({
              ...openSchedule,
              maintenanceStatus: status,
              totalSections,
              completedSections,
              templateId: config.template_id // Ensure template ID is passed
            });
          } else {
            // No open schedule, calculate NEXT due date
            const lastCompleted = existingSchedules.find(s => s.status === 'Completed');
            let nextDue = new Date(config.schedule_date); // Start from base schedule date

            if (lastCompleted && lastCompleted.completedDate) {
              // Calculate next from completion
              nextDue = getNextDate(new Date(lastCompleted.completedDate), config.frequency);
            } else if (openSchedule) {
              // Should be covered above, but just in case
            } else if (new Date(config.schedule_date) < new Date() && !lastCompleted) {
              // Never done, start date passed -> It is the due date (Overdue)
              nextDue = new Date(config.schedule_date);
            } else {
              // If configured start date is in future, wait for it.
              // If configured start date is way in past but no record, loop until future? 
              // For simplicity, let's assume if no record, the schedule_date IS the next due, even if old.
              nextDue = new Date(config.schedule_date);
            }

            // Only add if within range
            if (nextDue <= futureDate) {
              const isPastDue = nextDue < new Date();
              combinedEvents.push({
                id: `virtual-${config.id}-${nextDue.getTime()}`, // unique ID
                instrumentId: config.instrument_id,
                dueDate: nextDue.toISOString(),
                type: config.maintenance_type as any, // Cast to match type
                description: `Scheduled ${config.maintenance_type}`,
                status: 'Scheduled',
                maintenanceStatus: isPastDue ? 'Overdue' : 'Pending',
                templateId: config.template_id
              });
            }
          }
        });
      }

      setUpcomingSchedules(combinedEvents);
    } catch (err) {
      console.error("Error fetching schedules:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUpcoming();
  }, [timeRange]);

  const handleUpdateClick = async (event: MaintenanceEvent) => {
    if (event.id.startsWith('virtual-')) {
      const { data, error } = await supabase.from('maintenanceSchedules').insert({
        instrumentId: event.instrumentId,
        dueDate: event.dueDate,
        type: event.type,
        description: event.description,
        status: 'Scheduled',
        user_id: user?.id
      }).select().single();

      if (data) {
        setSelectedSchedule(data);
        setSelectedInstrumentId(data.instrumentId);
      }
    } else {
      setSelectedSchedule(event);
      setSelectedInstrumentId(event.instrumentId);
    }
  };

  const getStatusBadge = (event: EnhancedEvent) => {
    switch (event.maintenanceStatus) {
      case 'Completed':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="w-3 h-3 mr-1" /> Completed
          </Badge>
        );
      case 'Partially Completed':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <CircleDot className="w-3 h-3 mr-1" />
            Partial ({event.completedSections}/{event.totalSections})
          </Badge>
        );
      case 'Overdue':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            <AlertCircle className="w-3 h-3 mr-1" /> Overdue
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <Clock className="w-3 h-3 mr-1" /> Pending
          </Badge>
        );
    }
  };

  // Sorting logic
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1" />;
    return sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let data = [...upcomingSchedules];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(schedule => {
        const instrument = instrumentsMap[schedule.instrumentId];
        return (
          instrument?.eqpId?.toLowerCase().includes(term) ||
          instrument?.instrumentType?.toLowerCase().includes(term) ||
          instrument?.model?.toLowerCase().includes(term) ||
          instrument?.location?.toLowerCase().includes(term) ||
          schedule.type?.toLowerCase().includes(term)
        );
      });
    }

    // Sort
    data.sort((a, b) => {
      const instA = instrumentsMap[a.instrumentId];
      const instB = instrumentsMap[b.instrumentId];
      let comparison = 0;

      switch (sortField) {
        case 'instrument':
          comparison = (instA?.eqpId || '').localeCompare(instB?.eqpId || '');
          break;
        case 'instrumentType':
          comparison = (instA?.instrumentType || '').localeCompare(instB?.instrumentType || '');
          break;
        case 'type':
          comparison = (a.type || '').localeCompare(b.type || '');
          break;
        case 'location':
          comparison = (instA?.location || '').localeCompare(instB?.location || '');
          break;
        case 'dueDate':
          comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        case 'status':
          comparison = (a.maintenanceStatus || '').localeCompare(b.maintenanceStatus || '');
          break;
        case 'daysLeft':
          comparison = differenceInDays(new Date(a.dueDate), new Date()) - differenceInDays(new Date(b.dueDate), new Date());
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return data;
  }, [upcomingSchedules, instrumentsMap, searchTerm, sortField, sortOrder]);

  const timeRangeLabel = {
    '30': 'Next 30 Days',
    '90': 'Next 3 Months',
    '180': 'Next 6 Months',
    '365': 'Next 1 Year'
  };

  return (
    <>
      <Card className="transition-all hover:shadow-md">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="font-headline">Upcoming Maintenance</CardTitle>
              <CardDescription>{timeRangeLabel[timeRange]}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-8 w-[200px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Time Range Filter */}
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="90">3 Months</SelectItem>
                  <SelectItem value="180">6 Months</SelectItem>
                  <SelectItem value="365">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" onClick={() => handleSort('instrument')}>
                    Instrument {getSortIcon('instrument')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" onClick={() => handleSort('instrumentType')}>
                    Type {getSortIcon('instrumentType')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" onClick={() => handleSort('location')}>
                    Location {getSortIcon('location')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" onClick={() => handleSort('dueDate')}>
                    Due Date {getSortIcon('dueDate')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" onClick={() => handleSort('type')}>
                    Maint. Type {getSortIcon('type')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" onClick={() => handleSort('status')}>
                    Status {getSortIcon('status')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleSort('daysLeft')}>
                    Days Until Due {getSortIcon('daysLeft')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredAndSortedData.length > 0 ? (
                filteredAndSortedData.map(schedule => {
                  const dueDate = new Date(schedule.dueDate);
                  const daysLeft = differenceInDays(dueDate, new Date());
                  const instrument = instrumentsMap[schedule.instrumentId];

                  // Format type display
                  let typeDisplay: string = schedule.type;
                  if (schedule.type === 'Preventative Maintenance') typeDisplay = 'PM';
                  if (schedule.type === 'AMC') typeDisplay = 'AMC';

                  return (
                    <TableRow
                      key={schedule.id}
                      className={cn(
                        schedule.maintenanceStatus === 'Completed' && "opacity-60"
                      )}
                    >
                      <TableCell>
                        <div className="font-medium">{instrument?.eqpId || 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{instrument?.model}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {instrument?.instrumentType || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{instrument?.location || '-'}</TableCell>
                      <TableCell>{dueDate.toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{typeDisplay}</Badge>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(schedule)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={daysLeft < 0 ? 'destructive' : daysLeft <= 7 ? 'destructive' : 'secondary'}>
                          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {schedule.maintenanceStatus !== 'Completed' && (
                          <Button
                            size="sm"
                            variant={schedule.maintenanceStatus === 'Partially Completed' ? 'default' : 'outline'}
                            onClick={() => handleUpdateClick(schedule)}
                          >
                            {schedule.maintenanceStatus === 'Partially Completed' ? 'Continue' : 'Update'}
                          </Button>
                        )}
                        {schedule.maintenanceStatus === 'Completed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setViewSchedule(schedule);
                              setViewInstrumentId(schedule.instrumentId);
                            }}
                          >
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground h-24">
                    {searchTerm ? 'No results match your search.' : `No upcoming maintenance in the ${timeRangeLabel[timeRange].toLowerCase()}.`}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedSchedule && (
        <UpdateMaintenanceDialog
          isOpen={!!selectedSchedule}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedSchedule(null);
              setSelectedInstrumentId('');
            }
          }}
          maintenanceEvent={selectedSchedule}
          instrumentId={selectedInstrumentId}
          onSuccess={fetchUpcoming}
        />
      )}

      {viewSchedule && (
        <ViewMaintenanceResultDialog
          isOpen={!!viewSchedule}
          onOpenChange={(open) => {
            if (!open) {
              setViewSchedule(null);
              setViewInstrumentId('');
            }
          }}
          maintenanceEvent={viewSchedule}
          instrumentId={viewInstrumentId}
        />
      )}
    </>
  );
}
