'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
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
import { CalendarIcon, Loader2, FlaskConical, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addWeeks, addMonths, addYears } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type { Instrument, MaintenanceFrequency, InstrumentType } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';
import { useInstrumentTypes } from '@/hooks/use-instrument-types';
import { useMaintenanceTypes } from '@/hooks/use-maintenance-types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useAuth } from '@/contexts/auth-context';

const frequencies: MaintenanceFrequency[] = ['Weekly', 'Monthly', '3 Months', '6 Months', '1 Year'];

const formSchema = z.object({
  eqpId: z.string().min(1, 'Equipment ID is required.'),
  instrumentType: z.string().min(1, 'Instrument type is required.'),
  make: z.string().optional(),
  model: z.string().min(1, 'Model is required.'),
  serialNumber: z.string().min(1, 'Serial number is required.'),
  location: z.string().min(1, 'Location is required.'),
  maintenanceType: z.string().min(1, 'Maintenance type is required.'),
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

export function EditInstrumentDialog({ isOpen, onOpenChange, instrument, onSuccess }: EditInstrumentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');

  const { toast } = useToast();
  const { instrumentTypes, addInstrumentType, isLoading: isLoadingTypes } = useInstrumentTypes();
  const { maintenanceTypes, addMaintenanceType, isLoading: isLoadingMaintTypes } = useMaintenanceTypes();

  const form = useForm<EditInstrumentFormValues>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (instrument) {
      form.reset({
        eqpId: instrument.eqpId,
        instrumentType: instrument.instrumentType,
        make: instrument.make || '',
        model: instrument.model,
        serialNumber: instrument.serialNumber,
        location: instrument.location,
        maintenanceType: instrument.maintenanceType || '',
        scheduleDate: instrument.scheduleDate ? new Date(instrument.scheduleDate) : new Date(),
        frequency: instrument.frequency,
      });
      // Set the existing image as preview
      if (instrument.imageUrl) {
        setImagePreviewUrl(instrument.imageUrl);
      }
    }
  }, [instrument, form]);

  const selectedInstrumentType = form.watch('instrumentType');

  const previewImage = useMemo(() => {
    if (imagePreviewUrl) {
      return { imageUrl: imagePreviewUrl, description: 'Uploaded Image', imageHint: '' };
    }
    if (!selectedInstrumentType) return null;
    const imageId = instrumentTypeToImageId[selectedInstrumentType] || instrumentTypeToImageId.default;
    return PlaceHolderImages.find(img => img.id === imageId) || null;
  }, [selectedInstrumentType, imagePreviewUrl]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setImagePreviewUrl(previewUrl);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreviewUrl('');
  };

  const onSubmit = async (values: EditInstrumentFormValues) => {
    setIsLoading(true);

    const nextMaintenanceDate = getNextMaintenanceDate(values.scheduleDate, values.frequency as MaintenanceFrequency);
    const imageId = instrumentTypeToImageId[values.instrumentType] || instrumentTypeToImageId.default;

    let uploadedImageUrl = instrument.imageUrl || '';

    // Upload new image to Supabase Storage if a new image is selected
    if (selectedImage) {
      // Delete old image if exists
      if (instrument.imageUrl) {
        const oldFileName = instrument.imageUrl.split('/').pop();
        if (oldFileName) {
          await supabase.storage.from('instrument-images').remove([oldFileName]);
        }
      }

      const fileExt = selectedImage.name.split('.').pop();
      const fileName = `${instrument.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('instrument-images')
        .upload(fileName, selectedImage, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast({
          title: 'Upload Error',
          description: 'Failed to upload image. Please try again.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('instrument-images')
        .getPublicUrl(fileName);

      uploadedImageUrl = publicUrl;
    }

    const updatedInstrumentData = {
      ...values,
      maintenanceType: values.maintenanceType,
      instrumentType: values.instrumentType as InstrumentType,
      frequency: values.frequency as MaintenanceFrequency,
      scheduleDate: values.scheduleDate.toISOString(),
      nextMaintenanceDate: nextMaintenanceDate.toISOString(),
      imageId: imageId,
      imageUrl: uploadedImageUrl,
    };

    if (!instrumentTypes.find(t => t.value.toLowerCase() === values.instrumentType.toLowerCase())) {
      await addInstrumentType(values.instrumentType);
    }
    if (!maintenanceTypes.find(t => t.value.toLowerCase() === values.maintenanceType.toLowerCase())) {
      await addMaintenanceType(values.maintenanceType);
    }

    const { error } = await supabase.from('instruments').update(updatedInstrumentData).eq('id', instrument.id);

    if (error) {
      console.error('Error updating instrument:', error);
      toast({
        title: 'Error',
        description: 'Failed to update instrument.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Instrument Updated',
        description: `${values.eqpId} has been updated successfully.`,
      });
      setSelectedImage(null);
      setImagePreviewUrl('');
      onOpenChange(false);
      onSuccess?.();
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit Instrument</DialogTitle>
          <DialogDescription>Update the instrument details below.</DialogDescription>
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
              <FormField
                control={form.control}
                name="make"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Make / Manufacturer</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Mettler Toledo" {...field} />
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
                  name="maintenanceType"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Maintenance Type</FormLabel>
                      <Combobox
                        options={maintenanceTypes}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select or type..."
                        loading={isLoadingMaintTypes}
                      />
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

            {/* Image Upload Column */}
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
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <FlaskConical className="h-16 w-16 mb-2" />
                      <p>Image preview will appear here</p>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">{selectedInstrumentType || 'Instrument Type'}</p>
                  <p className="text-sm text-muted-foreground">
                    {imagePreviewUrl ? 'Custom uploaded image' : 'Default image for type'}
                  </p>
                </div>
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <FormLabel>Instrument Image</FormLabel>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="cursor-pointer"
                  />
                  {imagePreviewUrl && (
                    <Button type="button" variant="outline" size="icon" onClick={clearImage}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a new image to replace the current one
                </p>
              </div>
            </div>

            {/* Footer buttons need to span both columns if using grid */}
            <DialogFooter className="pt-4 md:col-span-2">
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
