'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { differenceInDays, addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/date-utils';
import type { MaintenanceEvent, Instrument, MaintenanceConfiguration, MaintenanceFrequency } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';
import { MobileMaintenanceCard } from './mobile-maintenance-card';
import { ColumnFilterPopover } from './column-filter-popover';
import { MaintenanceTypeCards } from './maintenance-type-cards';
import { UpdateMaintenanceDialog } from '../maintenance/update-maintenance-dialog';
import { ViewMaintenanceResultDialog } from '../maintenance/view-maintenance-result-dialog';
import { CheckCircle, Clock, AlertCircle, CircleDot, Search, ArrowUpDown, ArrowUp, ArrowDown, Info } from 'lucide-react';
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
type StatusFilter = 'all' | 'pending' | 'overdue';
type FrequencyFilter = 'all' | 'Daily' | 'Weekly' | 'Monthly' | '3 Months' | '6 Months' | '1 Year';

interface EnhancedEvent extends MaintenanceEvent {
  maintenanceStatus: MaintenanceStatus;
  totalSections?: number;
  completedSections?: number;
  hasResult?: boolean;
}

const getNextDate = (date: Date, frequency: MaintenanceFrequency): Date => {
  switch (frequency) {
    case 'Daily': return addDays(date, 1);
    case 'Weekly': return addWeeks(date, 1);
    case 'Monthly': return addMonths(date, 1);
    case '3 Months': return addMonths(date, 3);
    case '6 Months': return addMonths(date, 6);
    case '1 Year': return addYears(date, 1);
    default: return date;
  }
};

// Smart limits to prevent UI performance issues
const getMaxOccurrences = (timeRange: TimeRange, frequency: MaintenanceFrequency): number => {
  const days = parseInt(timeRange);

  switch (frequency) {
    case 'Daily':
      // Daily schedules: max 30 occurrences regardless of time range
      return Math.min(30, days);

    case 'Weekly':
      // Weekly schedules: show reasonable amount
      if (days <= 90) return Math.ceil(days / 7); // ~13 weeks for 90 days
      return 26; // Max ~6 months of weekly

    case 'Monthly':
      return Math.ceil(days / 30); // Natural monthly count

    case '3 Months':
    case '6 Months':
    case '1 Year':
      // Long-interval schedules: show all within range
      return 50; // Safety limit

    default:
      return 50;
  }
};

export function UpcomingMaintenanceList() {
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>('all');
  const [sortField, setSortField] = useState<SortField>('dueDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);

  // Excel-like column filters
  const [columnFilters, setColumnFilters] = useState<{
    instrument: string[];
    type: string[];
    maintenanceBy: string[];
    frequency: string[];
    location: string[];
    instrumentType: string[];
  }>({
    instrument: [],
    type: [],
    maintenanceBy: [],
    frequency: [],
    location: [],
    instrumentType: [],
  });

  const { user, isLoading: authLoading } = useAuth();

  const fetchUpcoming = async () => {
    setIsLoading(true);
    const days = parseInt(timeRange);
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000); // show recent history within selected window

    try {
      // 1. Fetch Instruments
      const { data: instruments } = await supabase.from('instruments').select('*');
      const instMap: Record<string, Instrument> = {};
      instruments?.forEach(i => instMap[i.id] = i);
      setInstrumentsMap(instMap);

      // 2. Fetch Maintenance Configurations (for frequency info)
      const { data: configs } = await supabase.from('maintenance_configurations').select('*');
      const configMap = new Map<string, MaintenanceConfiguration>();
      configs?.forEach(c => {
        const key = `${c.instrument_id}_${c.maintenance_type}`;
        configMap.set(key, c);
      });

      // 3. Fetch ALL schedules from DB (no virtual generation)
      const { data: schedules, error: scheduleError } = await supabase
        .from('maintenanceSchedules')
        .select('*')
        .gte('dueDate', startDate.toISOString())
        .lte('dueDate', futureDate.toISOString())
        .order('dueDate', { ascending: true });

      if (scheduleError) {
        console.error('Error fetching schedules:', scheduleError);
      }

      // 4. Fetch Results (for status calculation)
      const { data: results } = await supabase.from('maintenanceResults').select('*');

      const combinedEvents: EnhancedEvent[] = [];

      // Helper to determine status
      const getMaintenanceStatus = (schedule: MaintenanceEvent): { status: MaintenanceStatus; totalSections: number; completedSections: number; hasResult: boolean } => {
        const result = results?.find(r => r.maintenanceScheduleId === schedule.id);
        if (!result) {
          const isPastDue = new Date(schedule.dueDate) < new Date();
          return { status: isPastDue ? 'Overdue' : 'Pending', totalSections: 0, completedSections: 0, hasResult: false };
        }

        const testData = result.testData as any[] | null;
        if (testData && Array.isArray(testData) && testData.length > 0) {
          const totalSections = testData.length;
          const completedSections = testData.filter(section => {
            if (!section.rows || section.rows.length === 0) return true;
            const allRowsComplete = section.rows.every((row: any) => {
              if (section.type === 'checklist') {
                return row.passed === true;
              } else {
                return row.measured !== undefined && row.measured !== null && row.measured !== '';
              }
            });
            return allRowsComplete;
          }).length;

          if (completedSections === 0) return { status: 'Pending', totalSections, completedSections, hasResult: true };
          if (completedSections < totalSections) return { status: 'Partially Completed', totalSections, completedSections, hasResult: true };
          return { status: 'Completed', totalSections, completedSections, hasResult: true };
        }

        if (schedule.status === 'Completed') {
          return { status: 'Completed', totalSections: 0, completedSections: 0, hasResult: true };
        }
        return { status: 'Partially Completed', totalSections: 0, completedSections: 0, hasResult: true };
      };

      // Process DB schedules only - NO VIRTUAL SCHEDULES
      if (schedules) {
        console.log('DEBUG: Fetched DB Schedules:', schedules.length);

        schedules.forEach((schedule) => {
          const { status, totalSections, completedSections, hasResult } = getMaintenanceStatus(schedule as any);

          // Get config for frequency info
          const configKey = `${schedule.instrumentId}_${schedule.type}`;
          const config = configMap.get(configKey);

          combinedEvents.push({
            ...schedule,
            maintenanceStatus: status,
            totalSections,
            completedSections,
            hasResult,
            templateId: schedule.template_id || schedule.templateId,
            frequency: config?.frequency || 'Monthly',
            maintenanceBy: schedule.maintenanceBy || config?.maintenanceBy || 'internal',
            vendorName: schedule.vendorName || config?.vendorName || null,
            vendorContact: schedule.vendorContact || config?.vendorContact || null,
          });
        });
      }

      console.log('DEBUG: Combined Events (DB only):', combinedEvents.length);
      // DEBUG LOG

      // Deduplicate by instrument + type + day, prefer real schedules over virtual
      const normalizeDay = (dateStr: string) => {
        const d = new Date(dateStr);
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).getTime();
      };

      const dedupedMap = new Map<string, EnhancedEvent>();
      combinedEvents.forEach(event => {
        const key = `${event.instrumentId}_${event.type}_${normalizeDay(event.dueDate)}`;
        const existing = dedupedMap.get(key);
        if (!existing) {
          dedupedMap.set(key, event);
          return;
        }
        // Prefer non-virtual (real) over virtual
        const isVirtual = event.id.startsWith('virtual-');
        const existingVirtual = existing.id.startsWith('virtual-');
        if (existingVirtual && !isVirtual) {
          dedupedMap.set(key, event);
          return;
        }
        // If both real, prefer the one with result data (hasResult) or better status
        if (!isVirtual && !existingVirtual) {
          // Priority: Completed > Partially Completed > (has result data) > Pending/Overdue
          const statusPriority = (status: MaintenanceStatus, hasResult: boolean | undefined) => {
            if (status === 'Completed') return 4;
            if (status === 'Partially Completed') return 3;
            if (hasResult) return 2;
            return 1;
          };
          const eventPriority = statusPriority(event.maintenanceStatus, event.hasResult);
          const existingPriority = statusPriority(existing.maintenanceStatus, existing.hasResult);
          if (eventPriority > existingPriority) {
            dedupedMap.set(key, event);
          }
        }
      });

      setUpcomingSchedules(Array.from(dedupedMap.values()));
    } catch (err) {
      console.error("Error fetching schedules:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Wait for auth to complete before fetching data
    if (authLoading) {
      return;
    }
    fetchUpcoming();
  }, [timeRange, authLoading]);

  const handleUpdateClick = async (event: MaintenanceEvent) => {
    if (event.id.startsWith('virtual-')) {
      const insertPayload = {
        instrumentId: event.instrumentId,
        dueDate: event.dueDate,
        type: event.type,
        description: event.description,
        status: 'Scheduled',
        user_id: user?.id,
        template_id: event.templateId || null,
        maintenanceBy: event.maintenanceBy || instrumentsMap[event.instrumentId]?.maintenanceBy || 'self',
        vendorName: event.vendorName || instrumentsMap[event.instrumentId]?.vendorName || null,
        vendorContact: event.vendorContact || instrumentsMap[event.instrumentId]?.vendorContact || null,
      };

      const { data, error } = await supabase.from('maintenanceSchedules').insert(insertPayload).select().single();

      if (error) {
        console.error('Error creating schedule:', error);
        return;
      }

      if (data) {
        // Manually attach the templateId from the virtual event so the Dialog knows which one to load
        const finalSchedule = {
          ...data,
          templateId: event.templateId || data.templateId || data.template_id // Preserve from virtual source, or use from DB
        };
        setSelectedSchedule(finalSchedule);
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

    // Status filter
    if (statusFilter === 'pending') {
      data = data.filter(schedule =>
        schedule.maintenanceStatus === 'Pending' ||
        schedule.maintenanceStatus === 'Partially Completed'
      );
    } else if (statusFilter === 'overdue') {
      data = data.filter(schedule => schedule.maintenanceStatus === 'Overdue');
    }
    // 'all' shows everything - no filter needed

    // Frequency filter
    if (frequencyFilter !== 'all') {
      data = data.filter(schedule => schedule.frequency === frequencyFilter);
    }

    // Column filters (Excel-like)
    if (columnFilters.instrument.length > 0) {
      data = data.filter(schedule => {
        const instrument = instrumentsMap[schedule.instrumentId];
        return columnFilters.instrument.includes(instrument?.eqpId || '');
      });
    }
    if (columnFilters.type.length > 0) {
      data = data.filter(schedule => columnFilters.type.includes(schedule.type || ''));
    }
    if (columnFilters.maintenanceBy.length > 0) {
      data = data.filter(schedule => columnFilters.maintenanceBy.includes(schedule.maintenanceBy || ''));
    }
    if (columnFilters.frequency.length > 0) {
      data = data.filter(schedule => columnFilters.frequency.includes(schedule.frequency || ''));
    }
    if (columnFilters.location.length > 0) {
      data = data.filter(schedule => {
        const instrument = instrumentsMap[schedule.instrumentId];
        return columnFilters.location.includes(instrument?.location || '');
      });
    }
    if (columnFilters.instrumentType.length > 0) {
      data = data.filter(schedule => {
        const instrument = instrumentsMap[schedule.instrumentId];
        return columnFilters.instrumentType.includes(instrument?.instrumentType || '');
      });
    }

    // Type card filter
    if (selectedType) {
      data = data.filter(schedule => schedule.type === selectedType);
    }

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
          schedule.type?.toLowerCase().includes(term) ||
          (schedule.vendorName && schedule.vendorName.toLowerCase().includes(term)) ||
          (schedule.vendorContact && schedule.vendorContact.toLowerCase().includes(term)) ||
          (schedule.maintenanceBy && schedule.maintenanceBy.toLowerCase().includes(term))
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
  }, [upcomingSchedules, instrumentsMap, searchTerm, sortField, sortOrder, statusFilter, frequencyFilter, selectedType, columnFilters]);

  // Get all unique values for column filters
  const getColumnValues = (column: keyof typeof columnFilters): string[] => {
    return upcomingSchedules.map(schedule => {
      const instrument = instrumentsMap[schedule.instrumentId];
      switch (column) {
        case 'instrument':
          return instrument?.eqpId || '';
        case 'type':
          return schedule.type || '';
        case 'maintenanceBy':
          return schedule.maintenanceBy || '';
        case 'frequency':
          return schedule.frequency || '';
        case 'location':
          return instrument?.location || '';
        case 'instrumentType':
          return instrument?.instrumentType || '';
        default:
          return '';
      }
    });
  };

  const timeRangeLabel = {
    '30': 'Next 30 Days',
    '90': 'Next 3 Months',
    '180': 'Next 6 Months',
    '365': 'Next 1 Year'
  };

  // Check if any schedules are being limited and get info message
  const limitInfo = useMemo(() => {
    const dailyLimited = upcomingSchedules.some(s => s.frequency === 'Daily' && parseInt(timeRange) > 30);
    const weeklyLimited = upcomingSchedules.some(s => s.frequency === 'Weekly' && parseInt(timeRange) > 180);

    if (dailyLimited && weeklyLimited) {
      return "Showing next 30 daily tasks and 26 weekly tasks for optimal performance. Your schedules continue repeating automatically.";
    } else if (dailyLimited) {
      return "Showing next 30 daily tasks for optimal performance. Your daily schedule continues repeating automatically every day.";
    } else if (weeklyLimited) {
      return "Showing next 26 weekly tasks for optimal performance. Your weekly schedule continues repeating automatically every week.";
    }
    return null;
  }, [upcomingSchedules, timeRange]);


  return (
    <>
      {/* Maintenance Type Cards - shows counts, click to filter */}
      {upcomingSchedules.length > 0 && (
        <div className="mb-4">
          <MaintenanceTypeCards
            schedules={upcomingSchedules}
            onTypeClick={(type) => setSelectedType(selectedType === type ? undefined : type)}
            selectedType={selectedType}
          />
          {selectedType && (
            <div className="mt-2 text-sm text-muted-foreground text-center">
              Filtering by: <span className="font-medium text-primary">{selectedType}</span>
              <Button variant="link" size="sm" className="ml-2" onClick={() => setSelectedType(undefined)}>
                Clear filter
              </Button>
            </div>
          )}
        </div>
      )}
      <Card className="transition-all hover:shadow-md">
        <CardHeader className="sticky top-0 z-30 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="font-headline">Upcoming Maintenance</CardTitle>
              <CardDescription>
                {timeRangeLabel[timeRange]}
                {filteredAndSortedData.length > 0 && ` • ${filteredAndSortedData.length} ${filteredAndSortedData.length === 1 ? 'item' : 'items'}`}
              </CardDescription>
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

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending Only</SelectItem>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>

              {/* Frequency Filter */}
              <Select value={frequencyFilter} onValueChange={(v) => setFrequencyFilter(v as FrequencyFilter)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Frequency</SelectItem>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="3 Months">3 Months</SelectItem>
                  <SelectItem value="6 Months">6 Months</SelectItem>
                  <SelectItem value="1 Year">Yearly</SelectItem>
                </SelectContent>
              </Select>

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
          {/* Info message for limited schedules */}
          {limitInfo && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                {limitInfo}
              </div>
            </div>
          )}

          {/* Mobile View: Cards */}
          <div className="md:hidden space-y-4">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))
            ) : filteredAndSortedData.length > 0 ? (
              filteredAndSortedData.map((schedule) => {
                const daysLeft = differenceInDays(new Date(schedule.dueDate), new Date());
                return (
                  <MobileMaintenanceCard
                    key={schedule.id}
                    schedule={schedule}
                    instrument={instrumentsMap[schedule.instrumentId]}
                    onUpdateClick={handleUpdateClick}
                    onViewClick={(s) => {
                      setViewSchedule(s);
                      setViewInstrumentId(s.instrumentId);
                    }}
                    daysLeft={daysLeft}
                  />
                );
              })
            ) : (
              <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                {searchTerm ? 'No matches found.' : 'No upcoming maintenance.'}
              </div>
            )}
          </div>

          {/* Desktop View: Table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('instrument')}
                    >
                      Instrument
                      {sortField === 'instrument' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />)}
                    </span>
                    <ColumnFilterPopover
                      column="Instrument"
                      values={getColumnValues('instrument')}
                      selectedValues={columnFilters.instrument}
                      onFilterChange={(values) => setColumnFilters({ ...columnFilters, instrument: values })}
                    />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('type')}
                    >
                      Type
                      {sortField === 'type' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />)}
                    </span>
                    <ColumnFilterPopover
                      column="Type"
                      values={getColumnValues('type')}
                      selectedValues={columnFilters.type}
                      onFilterChange={(values) => setColumnFilters({ ...columnFilters, type: values })}
                    />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span>Maintenance By</span>
                    <ColumnFilterPopover
                      column="Maintenance By"
                      values={getColumnValues('maintenanceBy')}
                      selectedValues={columnFilters.maintenanceBy}
                      onFilterChange={(values) => setColumnFilters({ ...columnFilters, maintenanceBy: values })}
                    />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span>Frequency</span>
                    <ColumnFilterPopover
                      column="Frequency"
                      values={getColumnValues('frequency')}
                      selectedValues={columnFilters.frequency}
                      onFilterChange={(values) => setColumnFilters({ ...columnFilters, frequency: values })}
                    />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('location')}
                    >
                      Location
                      {sortField === 'location' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />)}
                    </span>
                    <ColumnFilterPopover
                      column="Location"
                      values={getColumnValues('location')}
                      selectedValues={columnFilters.location}
                      onFilterChange={(values) => setColumnFilters({ ...columnFilters, location: values })}
                    />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('dueDate')}
                    >
                      Due Date
                      {sortField === 'dueDate' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />)}
                    </span>
                  </div>
                </TableHead>
                <TableHead>Days Left</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading schedules...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedData.length > 0 ? (
                filteredAndSortedData.map((schedule) => {
                  const daysLeft = differenceInDays(new Date(schedule.dueDate), new Date());
                  const instrument = instrumentsMap[schedule.instrumentId];

                  return (
                    <TableRow key={schedule.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell>
                        {getStatusBadge(schedule)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{instrument?.eqpId || 'Unknown Instrument'}</span>
                          <span className="text-xs text-muted-foreground">{instrument?.model || 'No ID'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {schedule.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {schedule.maintenanceBy === 'vendor' ? (
                          <div className="flex flex-col">
                            <span className="font-medium">Vendor</span>
                            <span className="text-xs text-muted-foreground">{schedule.vendorName || 'N/A'}</span>
                            {schedule.vendorContact && (
                              <span className="text-xs text-muted-foreground">{schedule.vendorContact}</span>
                            )}
                          </div>
                        ) : (
                          'Self'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{schedule.frequency}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{instrument?.location || 'N/A'}</TableCell>
                      <TableCell>
                        <span className="font-medium">{formatDate(schedule.dueDate)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={daysLeft < 0 ? 'destructive' : daysLeft <= 7 ? 'destructive' : 'secondary'}>
                          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {schedule.maintenanceStatus === 'Completed' && (
                          <Button
                            size="sm"
                            className="bg-green-600 text-white hover:bg-green-700"
                            onClick={() => {
                              setViewSchedule(schedule);
                              setViewInstrumentId(schedule.instrumentId);
                            }}
                          >
                            View
                          </Button>
                        )}
                        {schedule.maintenanceStatus === 'Partially Completed' && (
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              onClick={() => handleUpdateClick(schedule)}
                            >
                              Continue
                            </Button>
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
                          </div>
                        )}
                        {schedule.maintenanceStatus !== 'Completed' && schedule.maintenanceStatus !== 'Partially Completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateClick(schedule)}
                          >
                            Update
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground h-24">
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
