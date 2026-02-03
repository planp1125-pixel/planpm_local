'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Instrument, MaintenanceEvent, MaintenanceResult, MaintenanceFrequency, TestTemplate } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CalendarDays, FlaskConical, Tag, Wrench, ChevronRight, HardDrive, FileText, Trash2, Edit, Save, X, Plus, Upload, Loader2 } from 'lucide-react';
import { format, isAfter, addWeeks, addMonths, addYears } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Combobox } from '@/components/ui/combobox';
import { useInstrumentTypes } from '@/hooks/use-instrument-types';
import { useMaintenanceTypes } from '@/hooks/use-maintenance-types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { regenerateSchedules, generateYearSchedules } from '@/lib/schedule-generator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const frequencies: MaintenanceFrequency[] = ['Daily', 'Weekly', 'Monthly', '3 Months', '6 Months', '1 Year'];

const scheduleSchema = z.object({
    id: z.string().optional(),
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
    maintenanceBy: z.enum(['self', 'vendor']).default('self'),
    vendorName: z.string().optional(),
    vendorContact: z.string().optional(),
}).refine(
    (data) => data.maintenanceBy === 'self' || (data.vendorName && data.vendorName.trim().length > 0),
    { message: 'Vendor name is required when maintenance is by vendor', path: ['vendorName'] }
);

type FormValues = z.infer<typeof formSchema>;

function DetailItem({ icon: Icon, label, value, isEditing, renderInput }: { icon: React.ElementType, label: string, value: React.ReactNode, isEditing?: boolean, renderInput?: () => React.ReactNode }) {
    if (isEditing && renderInput) {
        return (
            <div className="flex items-start gap-4 w-full">
                <div className="bg-muted rounded-full p-2 mt-2">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="w-full">
                    {/* Label is usually handled by FormField, but we keep it here for layout if needed, or hide it */}
                    {/* <div className="text-sm text-muted-foreground mb-1">{label}</div> */}
                    {renderInput()}
                </div>
            </div>
        )
    }
    return (
        <div className="flex items-start gap-4">
            <div className="bg-muted rounded-full p-2">
                <Icon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="font-medium">{value}</div>
            </div>
        </div>
    );
}

export function InstrumentDetailClientPage({ instrumentId }: { instrumentId: string }) {
    const [instrument, setInstrument] = useState<Instrument | null>(null);
    const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceEvent[]>([]);
    const [maintenanceResults, setMaintenanceResults] = useState<MaintenanceResult[]>([]);
    const [isLoadingInstrument, setIsLoadingInstrument] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [templates, setTemplates] = useState<TestTemplate[]>([]);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
    const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const { instrumentTypes, isLoading: isLoadingTypes } = useInstrumentTypes();
    const { maintenanceTypes, addMaintenanceType, isLoading: isLoadingMaintTypes } = useMaintenanceTypes();
    const router = useRouter();
    const { toast } = useToast();
    const { user, orgId } = useAuth();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            eqpId: '',
            instrumentType: '',
            make: '',
            model: '',
            serialNumber: '',
            location: '',
            schedules: [],
            maintenanceBy: 'self',
            vendorName: '',
            vendorContact: '',
        },
    });

    const { fields, append, remove, replace } = useFieldArray({
        control: form.control,
        name: "schedules",
    });

    // Fetch Templates
    useEffect(() => {
        const fetchTemplates = async () => {
            const { data } = await supabase.from('testTemplates').select('*').order('name');
            if (data) setTemplates(data);
        };
        fetchTemplates();
    }, []);

    const fetchInstrument = async () => {
        const { data } = await supabase.from('instruments').select('*').eq('id', instrumentId).single();
        if (data) {
            setInstrument(data);

            const { data: configs } = await supabase
                .from('maintenance_configurations')
                .select('*')
                .eq('instrument_id', instrumentId);

            const schedules: z.infer<typeof scheduleSchema>[] = configs?.map((c: any) => ({
                id: c.id,
                maintenanceType: c.maintenance_type || c.maintenanceType,
                frequency: c.frequency,
                scheduleDate: new Date(c.schedule_date || c.scheduleDate),
                templateId: c.template_id || c.templateId || '',
                maintenanceBy: c.maintenanceBy || c.maintenance_by || 'self',
                vendorName: c.vendorName || c.vendor_name || '',
                vendorContact: c.vendorContact || c.vendor_contact || '',
            })) || [];

            if (schedules.length === 0 && data.scheduleDate) {
                schedules.push({
                    id: undefined,
                    maintenanceType: data.maintenanceType || 'Preventative Maintenance',
                    frequency: data.frequency || 'Monthly',
                    scheduleDate: new Date(data.scheduleDate),
                    templateId: '',
                    maintenanceBy: data.maintenanceBy || 'self',
                    vendorName: data.vendorName || '',
                    vendorContact: data.vendorContact || '',
                });
            }

            form.reset({
                eqpId: data.eqpId,
                instrumentType: data.instrumentType || '',
                make: data.make || '',
                model: data.model || '',
                serialNumber: data.serialNumber || '',
                location: data.location || '',
                imageUrl: data.imageUrl || '',
                schedules: schedules,
                maintenanceBy: data.maintenanceBy || 'self',
                vendorName: data.vendorName || '',
                vendorContact: data.vendorContact || '',
            });
            if (data.imageUrl) setImagePreviewUrl(data.imageUrl);
        }
        setIsLoadingInstrument(false);
    };

    const fetchHistory = async () => {
        const { data: schedules } = await supabase
            .from('maintenanceSchedules')
            .select('*')
            .eq('instrumentId', instrumentId)
            .order('dueDate', { ascending: false });

        if (schedules) setMaintenanceHistory(schedules);

        const { data: results } = await supabase
            .from('maintenanceResults')
            .select('*')
            .eq('instrumentId', instrumentId)
            .order('completedDate', { ascending: false });

        if (results) setMaintenanceResults(results);

        setIsLoadingHistory(false);
    };

    useEffect(() => {
        if (instrumentId) {
            fetchInstrument();
            fetchHistory();
        }
    }, [instrumentId]);

    const onSubmit = async (values: FormValues) => {
        if (!instrument) return;
        try {
            setIsSaving(true);
            // Persist any new maintenance types so they are suggested later
            const knownTypes = maintenanceTypes.map(t => t.value.toLowerCase());
            const uniqueNewTypes = Array.from(new Set(values.schedules.map(s => s.maintenanceType))).filter(
                t => !knownTypes.includes(t.toLowerCase())
            );
            for (const typeName of uniqueNewTypes) {
                await addMaintenanceType(typeName);
            }
            // If a new image file is selected, upload it first and set imageUrl
            const updatedValues = { ...values } as FormValues & { imageUrl?: string };
            if (selectedImage) {
                setIsUploadingImage(true);
                try {
                    // Delete old image if present
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
                        .upload(fileName, selectedImage, { cacheControl: '3600', upsert: true });

                    if (uploadError) {
                        console.error('Upload error:', uploadError);
                        throw uploadError;
                    }

                    const { data: { publicUrl } } = supabase.storage.from('instrument-images').getPublicUrl(fileName) as any;
                    updatedValues.imageUrl = publicUrl;
                } finally {
                    setIsUploadingImage(false);
                }
            }

            // Update Instrument
            const { error: instError } = await supabase
                .from('instruments')
                .update({
                    eqpId: updatedValues.eqpId,
                    instrumentType: updatedValues.instrumentType,
                    make: updatedValues.make,
                    model: updatedValues.model,
                    serialNumber: updatedValues.serialNumber,
                    location: updatedValues.location,
                    imageUrl: updatedValues.imageUrl || '',
                    // Legacy fields update for compatibility if needed, using first schedule
                    maintenanceType: updatedValues.schedules[0]?.maintenanceType,
                    frequency: updatedValues.schedules[0]?.frequency,
                    scheduleDate: updatedValues.schedules[0]?.scheduleDate.toISOString(),
                    maintenanceBy: updatedValues.maintenanceBy,
                    vendorName: updatedValues.maintenanceBy === 'vendor' ? updatedValues.vendorName || '' : null,
                    vendorContact: updatedValues.maintenanceBy === 'vendor' ? updatedValues.vendorContact || '' : null,
                })
                .eq('id', instrumentId);

            if (instError) throw instError;

            // Handle Schedules (Configurations)
            // 1. Get existing configs IDs to know what to keep/delete
            const keptConfigIds = values.schedules.map(s => s.id).filter(Boolean);

            // 2. Get configs that will be deleted (to also delete their schedules)
            const { data: configsToDelete } = await supabase
                .from('maintenance_configurations')
                .select('id, maintenance_type')
                .eq('instrument_id', instrumentId)
                .not('id', 'in', keptConfigIds.length > 0 ? `(${keptConfigIds.join(',')})` : '()');

            // 3. Delete maintenanceSchedules for removed configurations
            if (configsToDelete && configsToDelete.length > 0) {
                for (const config of configsToDelete) {
                    const { error: scheduleDeleteError } = await supabase
                        .from('maintenanceSchedules')
                        .delete()
                        .eq('instrumentId', instrumentId)
                        .eq('type', config.maintenance_type);

                    if (scheduleDeleteError) {
                        console.error('Error deleting schedules for config:', config.id, scheduleDeleteError);
                    } else {
                        console.log(`Deleted schedules for removed config: ${config.maintenance_type}`);
                    }
                }
            }

            // 4. Delete removed configurations
            let deleteQuery = supabase
                .from('maintenance_configurations')
                .delete()
                .eq('instrument_id', instrumentId);

            if (keptConfigIds.length > 0) {
                deleteQuery = deleteQuery.not('id', 'in', `(${keptConfigIds.join(',')})`);
            }

            const { error: deleteError } = await deleteQuery;
            if (deleteError) {
                console.error('Error deleting configs:', JSON.stringify(deleteError));
                throw deleteError;
            }

            // UPSERT Configurations
            for (const schedule of values.schedules) {
                if (schedule.id) {
                    // Update
                    const { error: updateError } = await supabase.from('maintenance_configurations').update({
                        maintenance_type: schedule.maintenanceType,
                        frequency: schedule.frequency,
                        schedule_date: schedule.scheduleDate.toISOString(),
                        template_id: schedule.templateId || null,
                        user_id: user?.id,
                        maintenanceBy: schedule.maintenanceBy,
                        vendorName: schedule.maintenanceBy === 'vendor' ? schedule.vendorName || '' : null,
                        vendorContact: schedule.maintenanceBy === 'vendor' ? schedule.vendorContact || '' : null,
                    }).eq('id', schedule.id);
                    if (updateError) {
                        console.error('Error updating schedule:', JSON.stringify(updateError), schedule);
                        throw updateError;
                    }

                    // Delete pending schedules and regenerate with new frequency
                    const regenResult = await regenerateSchedules({
                        instrument_id: instrumentId,
                        maintenance_type: schedule.maintenanceType,
                        frequency: schedule.frequency,
                        schedule_date: schedule.scheduleDate.toISOString(),
                        template_id: schedule.templateId || null,
                        user_id: user?.id,
                        org_id: orgId,
                        maintenanceBy: schedule.maintenanceBy,
                        vendorName: schedule.maintenanceBy === 'vendor' ? schedule.vendorName || '' : null,
                        vendorContact: schedule.maintenanceBy === 'vendor' ? schedule.vendorContact || '' : null,
                    });
                    console.log(`Deleted ${regenResult.deleted} pending schedules, created ${regenResult.created} new schedules`);
                } else {
                    // Insert new configuration and generate 1 year of schedules
                    const { data: insertedConfig, error: insertError } = await supabase
                        .from('maintenance_configurations')
                        .insert({
                            instrument_id: instrumentId,
                            maintenance_type: schedule.maintenanceType,
                            frequency: schedule.frequency,
                            schedule_date: schedule.scheduleDate.toISOString(),
                            template_id: schedule.templateId || null,
                            user_id: user?.id,
                            maintenanceBy: schedule.maintenanceBy,
                            vendorName: schedule.maintenanceBy === 'vendor' ? schedule.vendorName || '' : null,
                            vendorContact: schedule.maintenanceBy === 'vendor' ? schedule.vendorContact || '' : null,
                        })
                        .select()
                        .single();
                    if (insertError) {
                        console.error('Error inserting schedule:', JSON.stringify(insertError), schedule);
                        throw insertError;
                    }

                    // Generate 1 year of schedules for the new configuration
                    if (insertedConfig) {
                        const genResult = await generateYearSchedules({
                            id: insertedConfig.id,
                            instrument_id: instrumentId,
                            maintenance_type: schedule.maintenanceType,
                            frequency: schedule.frequency,
                            schedule_date: schedule.scheduleDate.toISOString(),
                            template_id: schedule.templateId || null,
                            user_id: user?.id,
                            org_id: orgId,
                            maintenanceBy: schedule.maintenanceBy,
                            vendorName: schedule.maintenanceBy === 'vendor' ? schedule.vendorName || '' : null,
                            vendorContact: schedule.maintenanceBy === 'vendor' ? schedule.vendorContact || '' : null,
                        });
                        console.log(`Generated ${genResult.count} schedules for new configuration`);
                    }
                }
            }

            // Re-fetch to sync state instead of redirecting
            await fetchInstrument();
            await fetchHistory();
            setIsEditing(false);
            toast({ title: "Updated", description: "Instrument details saved successfully." });

        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Update Failed", description: (error as Error).message || "Failed to update instrument." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            // Delete Results
            await supabase.from('maintenanceResults').delete().eq('instrumentId', instrumentId);
            // Delete Schedules
            await supabase.from('maintenanceSchedules').delete().eq('instrumentId', instrumentId);
            // Delete Configurations
            await supabase.from('maintenance_configurations').delete().eq('instrument_id', instrumentId);
            // Delete Image if exists (Skip for now as we don't have bucket key easily accessible without parsing URL, usually safe to leave or implement later)

            // Delete Instrument
            const { error } = await supabase.from('instruments').delete().eq('id', instrumentId);
            if (error) throw error;

            toast({ title: "Deleted", description: "Instrument deleted successfully." });
            router.push('/instruments');
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error", description: "Failed to delete instrument." });
        }
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedImage(file);
            const previewUrl = URL.createObjectURL(file);
            setImagePreviewUrl(previewUrl);
            form.setValue('imageUrl', '');
        }
    }

    const clearImage = () => {
        setSelectedImage(null);
        setImagePreviewUrl('');
        form.setValue('imageUrl', '');
    }

    const image = useMemo(() => {
        // prefer transient preview (uploaded file) over stored image
        if (imagePreviewUrl) {
            return {
                imageUrl: imagePreviewUrl,
                description: instrument?.instrumentType || instrument?.eqpId,
                imageHint: ''
            };
        }
        if (!instrument) return null;
        if (instrument.imageUrl) {
            return {
                imageUrl: instrument.imageUrl,
                description: instrument.instrumentType || instrument.eqpId,
                imageHint: ''
            };
        }
        const defaultImage = PlaceHolderImages.find(img => img.id === instrument.imageId);
        return {
            imageUrl: defaultImage?.imageUrl || '',
            description: defaultImage?.description || instrument.instrumentType,
            imageHint: defaultImage?.imageHint || ''
        };
    }, [instrument, imagePreviewUrl]);

    const nextMaintenanceDate = instrument?.nextMaintenanceDate ? new Date(instrument.nextMaintenanceDate) : null;
    const isOverdue = nextMaintenanceDate && isAfter(new Date(), nextMaintenanceDate);
    const scheduleDate = instrument?.scheduleDate ? new Date(instrument.scheduleDate) : null;


    if (isLoadingInstrument) {
        return (
            <div className="p-4 md:p-8 space-y-6">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-6 w-3/4" />
                <div className="grid md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 space-y-4">
                        <Skeleton className="w-full aspect-video rounded-lg" />
                        <Skeleton className="h-40 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (!instrument) {
        return (
            <div className="flex-1 p-4 md:p-8 pt-6 flex items-center justify-center">
                <Alert variant="destructive" className="max-w-lg">
                    <FlaskConical className="h-4 w-4" />
                    <AlertTitle>Instrument Not Found</AlertTitle>
                    <AlertDescription>The instrument you are looking for could not be found.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <Link href="/instruments" className="text-sm text-muted-foreground hover:text-foreground">Instruments</Link>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            {isEditing ? (
                                <FormField
                                    control={form.control}
                                    name="eqpId"
                                    render={({ field }) => (
                                        <FormItem className="m-0">
                                            <FormControl>
                                                <Input {...field} className="text-xl font-bold h-10 w-[200px]" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : (
                                <h2 className="text-xl font-semibold tracking-tight font-headline">{instrument.eqpId}</h2>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {isEditing ? (
                                <>
                                    <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                                        <X className="w-4 h-4 mr-2" /> Cancel
                                    </Button>
                                    <Button type="submit" disabled={isUploadingImage || isSaving}>
                                        {isUploadingImage || isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm">
                                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This action cannot be undone. This will permanently delete the instrument,
                                                    all maintenance schedules, and all recorded results from the database.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); setIsEditing(true); }}>
                                        <Edit className="w-4 h-4 mr-2" /> Edit
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Left Column: Image & Basic Info */}
                        <div className="md:col-span-1 space-y-6">
                            <Card>
                                <CardContent className="p-0">
                                    <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-muted relative group">
                                        {/* Simple Image URL input overlay if editing could go here, or just keep it simple in fields */}
                                        {image?.imageUrl ? (
                                            <Image
                                                src={image.imageUrl}
                                                alt={image.description || ''}
                                                width={600}
                                                height={400}
                                                className="object-cover w-full h-full"
                                                unoptimized={!!instrument.imageUrl}
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                                <FlaskConical className="w-12 h-12" />
                                            </div>
                                        )}
                                        {isEditing && (
                                            <div className="absolute bottom-0 w-full p-2 bg-black/50 backdrop-blur-sm">
                                                <div className="flex items-center gap-2">
                                                    <input id={`instrument-image-input-${instrumentId}`} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                                                    <label
                                                        htmlFor={`instrument-image-input-${instrumentId}`}
                                                        className="inline-flex items-center gap-2 px-2 py-1 bg-card/90 text-foreground border border-border text-sm rounded cursor-pointer hover:bg-muted transition-colors"
                                                    >
                                                        <Upload className="w-4 h-4" />
                                                        {selectedImage ? 'Change Image' : 'Choose File'}
                                                    </label>
                                                    {imagePreviewUrl && (
                                                        <button type="button" onClick={clearImage} className="inline-flex items-center gap-1 px-2 py-1 bg-white/20 dark:bg-black/30 rounded text-sm">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <div className="w-8">
                                                        {isUploadingImage && <Loader2 className="animate-spin w-5 h-5 text-white" />}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-6">
                                        {isEditing ? (
                                            <FormField
                                                control={form.control}
                                                name="instrumentType"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Type</FormLabel>
                                                        <Combobox
                                                            options={instrumentTypes}
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            placeholder="Select Type..."
                                                        />
                                                    </FormItem>
                                                )}
                                            />
                                        ) : (
                                            <>
                                                <h3 className="text-lg font-semibold">{instrument.eqpId}</h3>
                                                <p className="text-muted-foreground">{instrument.instrumentType}</p>
                                            </>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="font-headline text-lg">Details</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <DetailItem
                                        icon={Tag}
                                        label="Make / Manufacturer"
                                        value={instrument.make || 'Not specified'}
                                        isEditing={isEditing}
                                        renderInput={() => (
                                            <FormField control={form.control} name="make" render={({ field }) => (
                                                <FormItem><FormLabel>Make</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        )}
                                    />
                                    <DetailItem
                                        icon={HardDrive}
                                        label="Model"
                                        value={instrument.model}
                                        isEditing={isEditing}
                                        renderInput={() => (
                                            <FormField control={form.control} name="model" render={({ field }) => (
                                                <FormItem><FormLabel>Model</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        )}
                                    />
                                    <DetailItem
                                        icon={HardDrive}
                                        label="Serial Number"
                                        value={instrument.serialNumber}
                                        isEditing={isEditing}
                                        renderInput={() => (
                                            <FormField control={form.control} name="serialNumber" render={({ field }) => (
                                                <FormItem><FormLabel>Serial No.</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        )}
                                    />
                                    <DetailItem
                                        icon={Tag}
                                        label="Location"
                                        value={instrument.location}
                                        isEditing={isEditing}
                                        renderInput={() => (
                                            <FormField control={form.control} name="location" render={({ field }) => (
                                                <FormItem><FormLabel>Location</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        )}
                                    />
                                    <DetailItem
                                        icon={Wrench}
                                        label="Maintenance By"
                                        value={instrument.maintenanceBy === 'vendor' ? `Vendor: ${instrument.vendorName || 'N/A'}` : 'Self'}
                                        isEditing={isEditing}
                                        renderInput={() => (
                                            <div className="space-y-3">
                                                <FormField
                                                    control={form.control}
                                                    name="maintenanceBy"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Maintenance By</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value || 'self'}>
                                                                <FormControl>
                                                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
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
                                                {form.watch('maintenanceBy') === 'vendor' && (
                                                    <div className="space-y-3">
                                                        <FormField
                                                            control={form.control}
                                                            name="vendorName"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Vendor Name</FormLabel>
                                                                    <FormControl><Input placeholder="Vendor company or contact" {...field} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <FormField
                                                            control={form.control}
                                                            name="vendorContact"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Vendor Contact (email or phone)</FormLabel>
                                                                    <FormControl><Input placeholder="optional" {...field} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    />

                                    {!isEditing && (
                                        <>
                                            <DetailItem icon={Tag} label="Maintenance Type" value={<Badge variant="default">{instrument.maintenanceType || 'Not set'}</Badge>} />
                                            <DetailItem icon={Wrench} label="Frequency" value={instrument.frequency} />
                                            <DetailItem icon={CalendarDays} label="Start Date" value={scheduleDate ? scheduleDate.toLocaleDateString() : 'Not set'} />
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right Column: Schedules & History */}
                        <div className="md:col-span-2 space-y-6">
                            {/* Editable Schedules Section */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="font-headline">Maintenance Configuration</CardTitle>
                                        <CardDescription>Configure multiple maintenance schedules.</CardDescription>
                                    </div>
                                    {isEditing && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => append({ id: undefined, maintenanceType: '', frequency: '', scheduleDate: new Date(), templateId: '', maintenanceBy: 'self', vendorName: '', vendorContact: '' })}
                                        >
                                            <Plus className="h-4 w-4 mr-1" /> Add Schedule
                                        </Button>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    {isEditing ? (
                                        <div className="space-y-4">
                                            {fields.map((field, index) => (
                                                <div key={field.id} className="relative p-4 border rounded bg-card space-y-4">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute top-2 right-2 text-destructive hover:text-destructive/90"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <FormField
                                                            control={form.control}
                                                            name={`schedules.${index}.maintenanceType`}
                                                            render={({ field }) => (
                                                                <FormItem className="flex flex-col">
                                                                    <FormLabel>Type</FormLabel>
                                                                    <Combobox
                                                                        options={maintenanceTypes}
                                                                        value={field.value}
                                                                        onChange={field.onChange}
                                                                        placeholder="Select..."
                                                                        loading={isLoadingMaintTypes}
                                                                    />
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
                                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="Frequency" /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            {frequencies.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <FormField
                                                            control={form.control}
                                                            name={`schedules.${index}.maintenanceBy`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Maintenance By</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value || 'self'}>
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
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
                                                                        <FormControl><Input placeholder="Vendor company or contact" {...field} /></FormControl>
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
                                                                        <FormControl><Input placeholder="optional" {...field} /></FormControl>
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
                                                                    <FormLabel>Start Date</FormLabel>
                                                                    <DatePicker value={field.value} onChange={field.onChange} />
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
                                                                    <Select onValueChange={field.onChange} value={field.value || 'none'}>
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="Template" /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            <SelectItem value="none">None</SelectItem>
                                                                            {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {fields.length > 0 ? fields.map((schedule, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 border rounded-md">
                                                    <div>
                                                        <div className="font-medium">{schedule.maintenanceType}</div>
                                                        <div className="text-sm text-muted-foreground">{schedule.frequency} • Starts {format(new Date(schedule.scheduleDate), 'PPP')}</div>
                                                        {schedule.maintenanceBy === 'vendor' && (
                                                            <div className="text-xs text-muted-foreground">Vendor: {schedule.vendorName || 'N/A'}{schedule.vendorContact ? ` • ${schedule.vendorContact}` : ''}</div>
                                                        )}
                                                    </div>
                                                    {schedule.templateId && <Badge variant="secondary">Template Linked</Badge>}
                                                </div>
                                            )) : (
                                                <div className="text-muted-foreground text-sm">No specific configurations found (using default).</div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {!isEditing && nextMaintenanceDate && (
                                <Alert variant={isOverdue ? "destructive" : "default"}>
                                    <CalendarDays className="h-4 w-4" />
                                    <AlertTitle>Next Maintenance Due</AlertTitle>
                                    <AlertDescription>
                                        The next scheduled maintenance is due on <span className="font-semibold">{format(nextMaintenanceDate, 'PPP')}</span>.
                                        {isOverdue && " This is overdue."}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!isEditing && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="font-headline">Maintenance History</CardTitle>
                                        <CardDescription>Previous maintenance, calibration, and validation records.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Due Date</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Completed On</TableHead>
                                                    <TableHead>Result</TableHead>
                                                    <TableHead>Document</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {isLoadingHistory ? (
                                                    Array.from({ length: 3 }).map((_, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : maintenanceHistory && maintenanceHistory.length > 0 ? (
                                                    maintenanceHistory.map((event: MaintenanceEvent) => {
                                                        const result = maintenanceResults.find(r => r.maintenanceScheduleId === event.id);
                                                        return (
                                                            <TableRow key={event.id}>
                                                                <TableCell>{new Date(event.dueDate).toLocaleDateString()}</TableCell>
                                                                <TableCell><Badge variant="secondary">{event.type}</Badge></TableCell>
                                                                <TableCell>{event.status}</TableCell>
                                                                <TableCell>
                                                                    {result ? new Date(result.completedDate).toLocaleDateString() :
                                                                        event.completedDate ? new Date(event.completedDate).toLocaleDateString() : '-'}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {result ? (
                                                                        <div className="flex flex-col gap-1">
                                                                            <Badge variant="outline" className="w-fit capitalize">
                                                                                {result.resultType.replace('_', ' ')}
                                                                            </Badge>
                                                                            {result.notes && (
                                                                                <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={result.notes}>
                                                                                    {result.notes}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ) : '-'}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {result?.documentUrl ? (
                                                                        <a
                                                                            href={result.documentUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="flex items-center gap-1 text-primary hover:underline text-sm"
                                                                        >
                                                                            <FileText className="w-4 h-4" />
                                                                            View
                                                                        </a>
                                                                    ) : '-'}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="text-center h-24">
                                                            No maintenance history found.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                </form>
            </Form>
        </div>
    );
}
