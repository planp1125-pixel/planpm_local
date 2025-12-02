'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addWeeks, addMonths, addYears } from 'date-fns';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Instrument, InstrumentStatus, MaintenanceFrequency, InstrumentType } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';
import { useInstrumentTypes } from '@/hooks/use-instrument-types';

const frequencies: MaintenanceFrequency[] = ['Weekly', 'Monthly', '3 Months', '6 Months', '1 Year'];
const statuses: InstrumentStatus[] = ['Operational', 'AMC', 'PM', 'Out of Service'];

const formSchema = z.object({
  eqpId: z.string().min(1, 'Equipment ID is required.'),
  instrumentType: z.string().min(1, 'Instrument type is required.'),
  model: z.string().min(1, 'Model is required.'),
  serialNumber: z.string().min(1, 'Serial number is required.'),
  location: z.string().min(1, 'Location is required.'),
  status: z.enum(['Operational', 'AMC', 'PM', 'Out of Service']),
  scheduleDate: z.date({
    required_error: 'Schedule date is required.',
  }),
  frequency: z.string().min(1, 'Frequency is required.'),
});

type EditInstrumentFormValues = z.infer<typeof formSchema>;

interface EditInstrumentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  instrument: Instrument;
}

const getNextMaintenanceDate = (startDate: Date, frequency: MaintenanceFrequency): Date => {
    switch (frequency) {
        case 'Weekly':
            return addWeeks(startDate, 1);
        case 'Monthly':
            return addMonths(startDate, 1);
        case '3 Months':
            return addMonths(startDate, 3);
        case '6 Months':
            return addMonths(startDate, 6);
        case '1 Year':
            return addYears(startDate, 1);
        default:
            return startDate;
    }
};

const instrumentTypeToImageId: Record<string, string> = {
    'Lab Balance': 'microscope', // Assumption, can be changed
    'Scale': 'microscope', // Assumption
    'pH Meter': 'pcr-machine', // Assumption
    'Tap Density Tester': 'hplc-system', // Assumption
    'UV-Vis Spectrophotometer': 'spectrometer',
    'GC': 'hplc-system', // Assumption
    'Spectrometer': 'spectrometer',
    'default': 'centrifuge'
};

export function EditInstrumentDialog({ isOpen, onOpenChange, instrument }: EditInstrumentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  const { instrumentTypes, addInstrumentType, isLoading: isLoadingTypes } = useInstrumentTypes();

  const form = useForm<EditInstrumentFormValues>({
    resolver: zodResolver(formSchema),
  });
  
  useEffect(() => {
    if (instrument) {
      form.reset({
        ...instrument,
        scheduleDate: instrument.scheduleDate ? instrument.scheduleDate.toDate() : new Date(),
      });
    }
  }, [instrument, form]);

  const onSubmit = (values: EditInstrumentFormValues) => {
    if (!firestore) return;
    setIsLoading(true);

    const nextMaintenanceDate = getNextMaintenanceDate(values.scheduleDate, values.frequency as MaintenanceFrequency);
    const imageId = instrumentTypeToImageId[values.instrumentType] || instrumentTypeToImageId.default;

    const updatedInstrumentData = {
      ...values,
      status: values.status as InstrumentStatus,
      instrumentType: values.instrumentType as InstrumentType,
      frequency: values.frequency as MaintenanceFrequency,
      scheduleDate: Timestamp.fromDate(values.scheduleDate),
      nextMaintenanceDate: Timestamp.fromDate(nextMaintenanceDate),
      imageId: imageId,
    };
    
    // Add new instrument type to the list if it's not already there
    if (!instrumentTypes.find(t => t.value === values.instrumentType)) {
      addInstrumentType(values.instrumentType);
    }

    const instrumentDocRef = doc(firestore, 'instruments', instrument.id);
    updateDocumentNonBlocking(instrumentDocRef, updatedInstrumentData);

    toast({
      title: 'Instrument Updated',
      description: `${values.eqpId} has been updated.`,
    });

    setIsLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Instrument</DialogTitle>
          <DialogDescription>Update the details for this instrument.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-6">
            <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="eqpId"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Equipment ID</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., QC-001" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                    control={form.control}
                    name="instrumentType"
                    render={({ field }) => (
                         <FormItem className="flex flex-col">
                            <FormLabel>Instrument Type</FormLabel>
                            <Combobox 
                                options={instrumentTypes}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Select or type..."
                                loading={isLoadingTypes}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                        <Input placeholder="Model-X100" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="serialNumber"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Serial Number</FormLabel>
                    <FormControl>
                        <Input placeholder="SN-A1B2C3D4" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Lab A, Room 101" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                         {statuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduleDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Schedule Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                          >
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date('1900-01-01')}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1">
                <FormField
                    control={form.control}
                    name="frequency"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Maintenance Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {frequencies.map(freq => <SelectItem key={freq} value={freq}>{freq}</SelectItem>)}
                        </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            </div>
            <DialogFooter className="pt-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
