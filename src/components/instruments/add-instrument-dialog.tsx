'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
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
import { CalendarIcon, Loader2, FlaskConical, Link, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addWeeks, addMonths, addYears } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { generateUUID } from '@/lib/uuid';
import { useToast } from '@/hooks/use-toast';
import type { MaintenanceFrequency, InstrumentType, TestTemplate } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';
import { useInstrumentTypes } from '@/hooks/use-instrument-types';
import { useMaintenanceTypes } from '@/hooks/use-maintenance-types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useAuth } from '@/contexts/auth-context';
import { DatePicker } from '@/components/ui/date-picker';
import { generateYearSchedules } from '@/lib/schedule-generator';

const frequencies: MaintenanceFrequency[] = ['Daily', 'Weekly', 'Monthly', '3 Months', '6 Months', '1 Year'];

const scheduleSchema = z.object({
  maintenanceType: z.string().min(1, 'Maintenance type is required.'),
  frequency: z.string().min(1, 'Frequency is required.'),
  scheduleDate: z.date({ required_error: 'Schedule date is required.' }),
  templateId: z.string().optional(),
  maintenanceBy: z.enum(['self', 'vendor']).default('self'),
  vendorName: z.string().optional(),
  vendorContact: z.string().optional(),
}).refine(
  (data) => data.maintenanceBy === 'self' || (data.vendorName && data.vendorName.trim().length > 0),
  { message: 'Vendor name is required when maintenance is by vendor', path: ['vendorName'] }
);

const formSchema = z.object({
  eqpId: z.string().min(1, 'Equipment ID is required.'),
  instrumentType: z.string().min(1, 'Instrument type is required.'),
  make: z.string().min(1, 'Manufacturer/Make is required.'),
  model: z.string().min(1, 'Model is required.'),
  serialNumber: z.string().min(1, 'Serial number is required.'),
  location: z.string().min(1, 'Location is required.'),
  schedules: z.array(scheduleSchema).min(1, "At least one schedule is required"),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

type AddInstrumentFormValues = z.infer<typeof formSchema>;

interface AddInstrumentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
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
  'Lab Balance': 'microscope',
  'Scale': 'microscope',
  'pH Meter': 'pcr-machine',
  'Tap Density Tester': 'hplc-system',
  'UV-Vis Spectrophotometer': 'spectrometer',
  'GC': 'hplc-system',
  'Spectrometer': 'spectrometer',
  'default': 'centrifuge'
};




export function AddInstrumentDialog({ isOpen, onOpenChange, onSuccess }: AddInstrumentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');

  const [templates, setTemplates] = useState<TestTemplate[]>([]);

  const { toast } = useToast();
  const { user } = useAuth();
  const { instrumentTypes, addInstrumentType, isLoading: isLoadingTypes } = useInstrumentTypes();
  const { maintenanceTypes, addMaintenanceType, isLoading: isLoadingMaintTypes } = useMaintenanceTypes();

  const form = useForm<AddInstrumentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      eqpId: '',
      instrumentType: '',
      make: '',
      model: '',
      serialNumber: '',
      location: '',
      schedules: [{
        maintenanceType: '',
        frequency: '',
        scheduleDate: new Date(),
        templateId: '',
        maintenanceBy: 'self',
        vendorName: '',
        vendorContact: '',
      }],
      imageUrl: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'schedules',
  });

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase.from('testTemplates').select('*').order('name');
      if (data) setTemplates(data);
    };
    fetchTemplates();
  }, []);

  const selectedInstrumentType = form.watch('instrumentType');

  const previewImage = useMemo(() => {
    if (imagePreviewUrl) {
      return { imageUrl: imagePreviewUrl, description: 'Uploaded Image', imageHint: '' };
    }
    if (!selectedInstrumentType) return null;
    const imageId = instrumentTypeToImageId[selectedInstrumentType] || instrumentTypeToImageId.default;
    return PlaceHolderImages.find(img => img.id === imageId) || null;
  }, [selectedInstrumentType, imagePreviewUrl]);

  const onSubmit = async (values: AddInstrumentFormValues) => {
    setIsLoading(true);

    try {
      // Use the first schedule for the main instrument record (legacy/display compatibility)
      const primarySchedule = values.schedules[0];
      const nextMaintenanceDate = getNextMaintenanceDate(primarySchedule.scheduleDate, primarySchedule.frequency as MaintenanceFrequency);
      const imageId = instrumentTypeToImageId[values.instrumentType] || instrumentTypeToImageId.default;

      // Generate UUID using our utility
      const instrumentId = generateUUID();
      let uploadedImageUrl = '';

      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `${instrumentId}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('instrument-images')
          .upload(fileName, selectedImage, { cacheControl: '3600', upsert: true });
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('instrument-images').getPublicUrl(fileName);
          uploadedImageUrl = publicUrl;
        }
      }

      // Prepare main instrument data
      const newInstrumentData = {
        id: instrumentId,
        eqpId: values.eqpId,
        instrumentType: values.instrumentType as InstrumentType,
        make: values.make,
        model: values.model,
        serialNumber: values.serialNumber,
        location: values.location,
        user_id: user?.id,
        // Legacy fields populated from first schedule
        maintenanceType: primarySchedule.maintenanceType,
        frequency: primarySchedule.frequency as MaintenanceFrequency,
        scheduleDate: primarySchedule.scheduleDate.toISOString(),
        nextMaintenanceDate: nextMaintenanceDate.toISOString(),
        imageId: imageId,
        imageUrl: uploadedImageUrl || '',
        maintenanceBy: primarySchedule.maintenanceBy,
        vendorName: primarySchedule.maintenanceBy === 'vendor' ? primarySchedule.vendorName || '' : null,
        vendorContact: primarySchedule.maintenanceBy === 'vendor' ? primarySchedule.vendorContact || '' : null,
      };

      if (!instrumentTypes.find(t => t.value.toLowerCase() === values.instrumentType.toLowerCase())) {
        await addInstrumentType(values.instrumentType);
      }

      // Insert Instrument
      const { error: instError } = await supabase.from('instruments').insert(newInstrumentData);

      if (instError) {
        console.error('Insert error:', instError);
        toast({ title: 'Error', description: instError.message || 'Failed to add instrument.', variant: 'destructive' });
        return;
      }

      // Insert Maintenance Schedules
      const scheduleInserts = values.schedules.map(schedule => ({
        instrument_id: instrumentId,
        maintenance_type: schedule.maintenanceType,
        frequency: schedule.frequency,
        schedule_date: schedule.scheduleDate.toISOString(),
        template_id: schedule.templateId || null,
        user_id: user?.id,
        maintenanceBy: schedule.maintenanceBy,
        vendorName: schedule.maintenanceBy === 'vendor' ? schedule.vendorName || '' : null,
        vendorContact: schedule.maintenanceBy === 'vendor' ? schedule.vendorContact || '' : null,
      }));

      const { data: configData, error: configError } = await supabase
        .from('maintenance_configurations')
        .insert(scheduleInserts)
        .select();

      if (configError) {
        console.error('Config insert error:', configError);
        toast({ title: 'Warning', description: 'Instrument added but failed to save schedules detailed config.' });
      } else if (configData) {
        // Generate 1 year of actual maintenanceSchedules for each configuration
        let totalSchedulesGenerated = 0;
        for (const config of configData) {
          const result = await generateYearSchedules({
            id: config.id,
            instrument_id: config.instrument_id,
            maintenance_type: config.maintenance_type,
            frequency: config.frequency,
            schedule_date: config.schedule_date,
            template_id: config.template_id,
            user_id: user?.id,
            maintenanceBy: config.maintenanceBy || config.maintenance_by,
            vendorName: config.vendorName || config.vendor_name,
            vendorContact: config.vendorContact || config.vendor_contact,
          });
          if (result.success) {
            totalSchedulesGenerated += result.count;
          }
        }
        console.log(`Generated ${totalSchedulesGenerated} schedules for ${configData.length} configurations`);
      }

      // Ensure types exist
      for (const schedule of values.schedules) {
        if (!maintenanceTypes.find(t => t.value.toLowerCase() === schedule.maintenanceType.toLowerCase())) {
          await addMaintenanceType(schedule.maintenanceType);
        }
      }

      toast({ title: 'Instrument Added', description: `${values.eqpId} has been added.` });
      form.reset();
      setSelectedImage(null);
      setImagePreviewUrl('');
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Unexpected error:', err);
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl">
        <DialogHeader>
          <DialogTitle>Add New Instrument</DialogTitle>
          <DialogDescription>Fill in the details below to add a new instrument to the inventory.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 py-4 max-h-[70vh] overflow-y-auto pr-6">

            {/* Form Fields Column */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="eqpId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipment ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., QC-001" autoComplete="off" {...field} />
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select instrument type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {instrumentTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="make"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Make / Manufacturer</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Mettler Toledo" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input placeholder="Model-X100" autoComplete="off" {...field} />
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
                      <Input placeholder="SN-A1B2C3D4" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Lab A, Room 101" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-4 border rounded-md p-4 bg-muted/10">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Maintenance Schedules</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ maintenanceType: '', frequency: '', scheduleDate: new Date(), templateId: '', maintenanceBy: 'self', vendorName: '', vendorContact: '' })}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>

                {fields.map((field, index) => (
                  <div key={field.id} className="relative space-y-4 p-4 border rounded bg-card">
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-destructive hover:text-destructive/90"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`schedules.${index}.maintenanceType`}
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Maintenance Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select maintenance type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {maintenanceTypes.map(type => (
                                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`schedules.${index}.frequency`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Frequency</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`schedules.${index}.maintenanceBy`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Maintenance By</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'self'}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select responsible party" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="self">Self</SelectItem>
                                <SelectItem value="vendor">Vendor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {form.watch(`schedules.${index}.maintenanceBy`) === 'vendor' && (
                        <FormField
                          control={form.control}
                          name={`schedules.${index}.vendorName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vendor Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Vendor company or contact" autoComplete="off" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {form.watch(`schedules.${index}.maintenanceBy`) === 'vendor' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`schedules.${index}.vendorContact`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vendor Contact (email or phone)</FormLabel>
                              <FormControl>
                                <Input placeholder="optional" autoComplete="off" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`schedules.${index}.scheduleDate`}
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Schedule Start Date</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                                onChange={(e) => field.onChange(new Date(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`schedules.${index}.templateId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Template</FormLabel>
                            <Select
                              onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                              value={field.value || "none"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select template" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {templates.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Image Preview and Upload Column */}
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center space-y-4 p-4 border rounded-lg bg-muted/50 h-fit">
                <div className="w-full aspect-video rounded-md overflow-hidden bg-background">
                  {previewImage?.imageUrl ? (
                    <Image
                      src={previewImage.imageUrl}
                      alt={previewImage.description}
                      width={400}
                      height={300}
                      className="object-cover w-full h-full"
                      data-ai-hint={previewImage.imageHint}
                      unoptimized={!!selectedImage} // Don't optimize user-uploaded files
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <FlaskConical className="h-16 w-16 mb-2" />
                      <p>Image preview will appear here</p>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">{selectedImage ? 'Uploaded Image' : selectedInstrumentType || 'Instrument Type'}</p>
                  <p className="text-sm text-muted-foreground">{selectedImage ? selectedImage.name : 'Image associated with the selected type'}</p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload Image (Optional)</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedImage(file);
                      // Create preview URL
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setImagePreviewUrl(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="cursor-pointer"
                />
                {selectedImage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedImage(null);
                      setImagePreviewUrl('');
                    }}
                  >
                    Clear Image
                  </Button>
                )}
              </div>
            </div>


            {/* Footer buttons need to span both columns if using grid */}
            <DialogFooter className="pt-4 md:col-span-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Instrument
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
