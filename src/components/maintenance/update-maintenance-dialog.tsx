'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, FileText, Loader2, CheckCircle, XCircle, Save, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { MaintenanceEvent, TestTemplate, TestSection } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-context';
import { checkAndRegenerateSchedules } from '@/lib/schedule-generator';

const formSchema = z.object({
    completedDate: z.date({
        required_error: 'Please select a completion date.',
    }),
    resultType: z.enum(['calibration', 'service', 'spare_quotation', 'other']),
    notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface UpdateMaintenanceDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    maintenanceEvent: MaintenanceEvent;
    instrumentId: string;
    onSuccess?: () => void;
    viewMode?: boolean;
}

export function UpdateMaintenanceDialog({
    isOpen,
    onOpenChange,
    maintenanceEvent,
    instrumentId,
    onSuccess,
    viewMode = false,
}: UpdateMaintenanceDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [testData, setTestData] = useState<TestSection[]>([]);
    const [sectionDocuments, setSectionDocuments] = useState<Record<string, File | null>>({});
    const [savingSection, setSavingSection] = useState<string | null>(null);
    const [savedSections, setSavedSections] = useState<Set<string>>(new Set());
    const [existingResult, setExistingResult] = useState<any | null>(null);
    const [isCompleteResult, setIsCompleteResult] = useState<boolean>(false);
    const [instrumentInfo, setInstrumentInfo] = useState<{ eqpId: string; model: string; make: string } | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            completedDate: new Date(),
            resultType: 'calibration',
            notes: '',
        },
    });

    // Fetch templates on mount
    // Fetch templates on mount removed (consolidated in the next useEffect)


    // Load template structure when selected
    const loadTemplateById = async (templateId: string) => {
        const { data } = await supabase.from('testTemplates').select('*').eq('id', templateId).single();
        if (data) {
            setSelectedTemplateId(templateId);
            const initialData = data.structure.map((section: TestSection) => ({
                ...section,
                rows: section.rows.map(row => ({
                    ...row,
                    measured: undefined,
                    error: undefined,
                    passed: section.type === 'checklist' ? false : undefined,
                    checked: section.type === 'checklist' ? false : undefined,
                }))
            }));
            setTestData(initialData);
        } else {
            setSelectedTemplateId('');
            setTestData([]);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const fetchResultAndTemplate = async () => {
            setSavedSections(new Set());
            setSectionDocuments({});

            // Fetch instrument information
            const { data: instrument } = await supabase
                .from('instruments')
                .select('eqpId, model, make')
                .eq('id', instrumentId)
                .single();

            if (instrument) {
                setInstrumentInfo(instrument);
            }

            const { data: resultData } = await supabase
                .from('maintenanceResults')
                .select('*')
                .eq('maintenanceScheduleId', maintenanceEvent.id)
                .order('createdAt', { ascending: false })
                .limit(1)
                .single();

            if (resultData) {
                setExistingResult(resultData);

                // Populate form with existing result data
                form.reset({
                    completedDate: new Date(resultData.completedDate),
                    resultType: resultData.resultType,
                    notes: resultData.notes || '',
                });

                if (resultData.templateId) {
                    setSelectedTemplateId(resultData.templateId);
                }
                if (resultData.testData) {
                    const testSections = resultData.testData as TestSection[];
                    setTestData(testSections);

                    // Mark already-complete sections as saved
                    const completeSectionIds = new Set<string>();
                    testSections.forEach(section => {
                        const sectionComplete = (() => {
                            if (!section.rows || section.rows.length === 0) return true;
                            if (section.type === 'checklist') {
                                return section.rows.every(row => row.passed === true);
                            }
                            return section.rows.every(row => row.measured !== undefined);
                        })();
                        if (sectionComplete) {
                            completeSectionIds.add(section.id);
                        }
                    });
                    setSavedSections(completeSectionIds);

                    // Check if all sections are complete
                    const allSectionsComplete = testSections.every(section => {
                        if (!section.rows || section.rows.length === 0) return true;
                        if (section.type === 'checklist') {
                            return section.rows.every(row => row.passed === true);
                        }
                        return section.rows.every(row => row.measured !== undefined);
                    });
                    setIsCompleteResult(allSectionsComplete);
                } else {
                    setIsCompleteResult(false);
                }
            } else {
                setExistingResult(null);
                setIsCompleteResult(false);
                if (maintenanceEvent.templateId) {
                    await loadTemplateById(maintenanceEvent.templateId);
                } else {
                    setSelectedTemplateId('');
                    setTestData([]);
                }
            }
        };

        fetchResultAndTemplate();
    }, [isOpen, maintenanceEvent]);

    // Update measured value and calculate error/passed
    const handleMeasuredChange = (sectionIndex: number, rowIndex: number, value: string) => {
        setTestData(prev => {
            const newData = [...prev];
            const section = newData[sectionIndex];
            const row = section.rows[rowIndex];

            if (section.type === 'checklist') {
                return newData;
            }

            const measured = value === '' ? undefined : parseFloat(value);
            row.measured = measured;

            if (measured !== undefined) {
                if (section.type === 'tolerance' && row.reference !== undefined) {
                    row.error = measured - row.reference;
                    const tolerance = section.tolerance || 0;
                    row.passed = Math.abs(row.error) <= tolerance;
                } else if (section.type === 'range') {
                    row.error = undefined;
                    const min = row.min ?? -Infinity;
                    const max = row.max ?? Infinity;
                    row.passed = measured >= min && measured <= max;
                } else {
                    row.error = undefined;
                    row.passed = true;
                }
            } else {
                row.error = undefined;
                row.passed = undefined;
            }

            return newData;
        });

        // Mark section as unsaved if it was previously saved
        const sectionId = testData[sectionIndex]?.id;
        if (sectionId && savedSections.has(sectionId)) {
            setSavedSections(prev => {
                const newSet = new Set(prev);
                newSet.delete(sectionId);
                return newSet;
            });
        }
    };

    // Handle section document upload
    const handleSectionDocumentChange = (sectionId: string, file: File | null) => {
        setSectionDocuments(prev => ({ ...prev, [sectionId]: file }));
    };

    const handleChecklistToggle = (sectionIndex: number, rowIndex: number, checked: boolean) => {
        setTestData(prev => {
            const newData = [...prev];
            const section = newData[sectionIndex];
            const row = section.rows[rowIndex];
            row.checked = checked;
            row.passed = checked;
            return newData;
        });
        const sectionId = testData[sectionIndex]?.id;
        if (sectionId && savedSections.has(sectionId)) {
            setSavedSections(prev => {
                const newSet = new Set(prev);
                newSet.delete(sectionId);
                return newSet;
            });
        }
    };

    // Check if a section is complete (all fields filled)
    const isSectionComplete = (section: TestSection) => {
        if (!section.rows || section.rows.length === 0) return true;
        if (section.type === 'checklist') {
            return section.rows.every(row => row.passed === true);
        }
        return section.rows.every(row => row.measured !== undefined);
    };

    // Save individual section (draft save)
    const handleSaveSection = async (sectionIndex: number) => {
        const section = testData[sectionIndex];
        if (!section) return;

        // Validate that all fields in the section are filled
        if (!isSectionComplete(section)) {
            toast({
                title: 'Incomplete Section',
                description: 'Please fill all fields in this section before saving.',
                variant: 'destructive',
            });
            return;
        }

        setSavingSection(section.id);

        try {
            // Upload section document if exists
            let sectionDocUrl = '';
            const sectionDoc = sectionDocuments[section.id];
            if (sectionDoc) {
                const fileExt = sectionDoc.name.split('.').pop();
                const fileName = `section_${section.id}_${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('maintenance-documents')
                    .upload(fileName, sectionDoc, { cacheControl: '3600', upsert: false });

                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('maintenance-documents')
                        .getPublicUrl(fileName);
                    sectionDocUrl = publicUrl;
                }
            }

            // Update the section with the document URL
            const updatedTestData = testData.map(s => {
                if (s.id === section.id && sectionDocUrl) {
                    return { ...s, documentUrl: sectionDocUrl };
                }
                return s;
            });

            // Save the current test data to the database as a partial result
            const resultData = {
                user_id: user?.id,
                maintenanceScheduleId: maintenanceEvent.id,
                instrumentId: instrumentId,
                completedDate: form.getValues('completedDate').toISOString(),
                resultType: form.getValues('resultType'),
                notes: form.getValues('notes') || '',
                documentUrl: null, // Individual section saves don't save main document
                testData: updatedTestData, // Save all test data including the newly completed section
                templateId: selectedTemplateId && selectedTemplateId !== 'none' ? selectedTemplateId : null,
            };

            // Update local state to reflect the new document URL
            if (sectionDocUrl) {
                setTestData(updatedTestData);
            }

            // Save to database first
            if (existingResult) {
                const { error } = await supabase
                    .from('maintenanceResults')
                    .update(resultData)
                    .eq('id', existingResult.id);
                if (error) throw error;
            } else {
                const { data: newResult, error } = await supabase
                    .from('maintenanceResults')
                    .insert(resultData)
                    .select()
                    .single();
                if (error) throw error;
                if (newResult) {
                    setExistingResult(newResult);
                }
            }

            // Insert section document into maintenance_documents table
            if (sectionDocUrl) {
                const { error: docInsertError } = await supabase
                    .from('maintenance_documents')
                    .insert({
                        instrument_id: instrumentId,
                        maintenance_schedule_id: maintenanceEvent.id,
                        title: `${section.title} - Test Document`,
                        description: `Section document for ${section.title}`,
                        document_url: sectionDocUrl,
                        document_type: 'section',
                        section_id: section.id,
                        user_id: user?.id,
                    });

                if (docInsertError) {
                    console.error('Error inserting document into maintenance_documents:', docInsertError);
                } else {
                    console.log('Section document inserted successfully into maintenance_documents');
                }
            }

            // Check if all sections are now complete after this save
            const allSectionsNowComplete = testData.every(s => {
                if (!s.rows || s.rows.length === 0) return true;
                if (s.type === 'checklist') {
                    return s.rows.every(row => row.passed === true);
                }
                return s.rows.every(row => row.measured !== undefined);
            });

            // Update maintenance schedule status and wait for completion
            const { error: scheduleError } = await supabase
                .from('maintenanceSchedules')
                .update({
                    status: allSectionsNowComplete ? 'Completed' : 'In Progress',
                    completedDate: allSectionsNowComplete ? form.getValues('completedDate').toISOString() : null,
                    completionNotes: allSectionsNowComplete ? form.getValues('notes') || '' : null,
                })
                .eq('id', maintenanceEvent.id);

            if (scheduleError) throw scheduleError;

            // Update local state
            if (allSectionsNowComplete) {
                setIsCompleteResult(true);
            }

            // Mark section as saved in local state
            setSavedSections(prev => new Set([...prev, section.id]));

            // Refresh the dashboard to update the action button - wait a bit to ensure DB is updated
            setTimeout(() => {
                onSuccess?.();
            }, 100);

            toast({
                title: 'Section Saved',
                description: allSectionsNowComplete
                    ? `All sections completed! The result is now marked as complete.`
                    : `"${section.title}" has been saved. You can continue later.`,
            });
        } catch (error) {
            console.error('Error saving section:', error);
            toast({
                title: 'Save Failed',
                description: 'Could not save section. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setSavingSection(null);
        }
    };

    const onSubmit = async (values: FormValues) => {
        setIsLoading(true);

        try {
            let documentUrl = '';

            // Upload main document if selected
            if (selectedDocument) {
                const fileExt = selectedDocument.name.split('.').pop();
                const fileName = `${maintenanceEvent.id}_${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('maintenance-documents')
                    .upload(fileName, selectedDocument, {
                        cacheControl: '3600',
                        upsert: false,
                    });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    toast({
                        title: 'Upload Error',
                        description: 'Failed to upload document. Please try again.',
                        variant: 'destructive',
                    });
                    setIsLoading(false);
                    return;
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('maintenance-documents')
                    .getPublicUrl(fileName);

                documentUrl = publicUrl;
            }

            // Upload section documents and update testData with URLs
            const updatedTestData = await Promise.all(
                testData.map(async (section) => {
                    const sectionDoc = sectionDocuments[section.id];
                    if (sectionDoc) {
                        const fileExt = sectionDoc.name.split('.').pop();
                        const fileName = `section_${section.id}_${Date.now()}.${fileExt}`;

                        const { error: uploadError } = await supabase.storage
                            .from('maintenance-documents')
                            .upload(fileName, sectionDoc, { cacheControl: '3600', upsert: false });

                        if (!uploadError) {
                            const { data: { publicUrl } } = supabase.storage
                                .from('maintenance-documents')
                                .getPublicUrl(fileName);
                            return { ...section, documentUrl: publicUrl };
                        }
                    }
                    return section;
                })
            );

            // Determine completion status
            const isSectionComplete = (section: TestSection) => {
                if (!section.rows || section.rows.length === 0) return true;
                if (section.type === 'checklist') {
                    return section.rows.every(row => row.passed === true);
                }
                return section.rows.every(row => row.measured !== undefined);
            };
            const allComplete = updatedTestData.every(isSectionComplete);

            // Create or update maintenance result record with test data
            const resultData = {
                user_id: user?.id,
                maintenanceScheduleId: maintenanceEvent.id,
                instrumentId: instrumentId,
                completedDate: values.completedDate.toISOString(),
                resultType: values.resultType,
                notes: values.notes || '',
                documentUrl: documentUrl || null,
                testData: updatedTestData.length > 0 ? updatedTestData : null,
                templateId: selectedTemplateId && selectedTemplateId !== 'none' ? selectedTemplateId : null,
            };

            let saveError;
            if (existingResult) {
                const { error } = await supabase
                    .from('maintenanceResults')
                    .update(resultData)
                    .eq('id', existingResult.id);
                saveError = error;
            } else {
                const { error } = await supabase
                    .from('maintenanceResults')
                    .insert(resultData);
                saveError = error;
            }

            if (saveError) {
                console.error('Save error:', saveError);
                throw saveError;
            }

            // Insert main document into maintenance_documents table
            if (documentUrl && selectedDocument) {
                const { error: mainDocError } = await supabase
                    .from('maintenance_documents')
                    .insert({
                        instrument_id: instrumentId,
                        maintenance_schedule_id: maintenanceEvent.id,
                        title: `${values.resultType} - Main Certificate/Report`,
                        description: `Main document for ${maintenanceEvent.type} - ${maintenanceEvent.description}`,
                        document_url: documentUrl,
                        document_type: 'main',
                        section_id: null,
                        user_id: user?.id,
                    });

                if (mainDocError) {
                    console.error('Error inserting main document into maintenance_documents:', mainDocError);
                } else {
                    console.log('Main document inserted successfully into maintenance_documents');
                }
            }

            // Insert section documents into maintenance_documents table
            for (const section of updatedTestData) {
                const sectionDoc = sectionDocuments[section.id];
                if (section.documentUrl && sectionDoc) {
                    const { error: sectionDocError } = await supabase
                        .from('maintenance_documents')
                        .insert({
                            instrument_id: instrumentId,
                            maintenance_schedule_id: maintenanceEvent.id,
                            title: `${section.title} - Test Document`,
                            description: `Section document for ${section.title}`,
                            document_url: section.documentUrl,
                            document_type: 'section',
                            section_id: section.id,
                            user_id: user?.id,
                        });

                    if (sectionDocError) {
                        console.error(`Error inserting section document for ${section.title}:`, sectionDocError);
                    } else {
                        console.log(`Section document for ${section.title} inserted successfully`);
                    }
                }
            }

            // Update the maintenance schedule status based on completion
            await supabase
                .from('maintenanceSchedules')
                .update({
                    status: allComplete ? 'Completed' : 'In Progress',
                    completedDate: values.completedDate.toISOString(),
                    completionNotes: values.notes || '',
                })
                .eq('id', maintenanceEvent.id);

            // Auto-regenerate next year's schedules if this was the last one
            if (allComplete) {
                const regenResult = await checkAndRegenerateSchedules(maintenanceEvent.id);
                if (regenResult.regenerated) {
                    console.log(`Auto-generated ${regenResult.count} new schedules for next year`);
                }
            }

            toast({
                title: 'Result Updated',
                description: allComplete ? 'Maintenance result completed.' : 'Partial result saved. You can continue later.',
            });

            form.reset();
            setSelectedDocument(null);
            setSelectedTemplateId('');
            setTestData([]);
            setSectionDocuments({});
            setSavedSections(new Set());
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            console.error('Error updating maintenance result:', error);
            toast({
                title: 'Error',
                description: 'Failed to update maintenance result.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <DialogTitle className="flex items-center gap-2 flex-wrap">
                                {viewMode || isCompleteResult ? 'View Maintenance Result' :
                                    existingResult && !isCompleteResult ? 'Continue Partial Result' :
                                        'Update Maintenance Result'}
                                {instrumentInfo && (
                                    <Badge variant="outline" className="font-mono text-base px-3 py-1">
                                        {instrumentInfo.eqpId}
                                    </Badge>
                                )}
                            </DialogTitle>
                            <div className="mt-2 text-sm text-muted-foreground space-y-1">
                                {instrumentInfo && (
                                    <div className="text-sm mb-1">
                                        <span className="font-medium">{instrumentInfo.make} {instrumentInfo.model}</span>
                                    </div>
                                )}
                                <div>
                                    {viewMode || isCompleteResult ? 'Completed result for' : 'Record completion details for'} {maintenanceEvent.type} - {maintenanceEvent.description}
                                    {existingResult && !isCompleteResult && !viewMode && (
                                        <Badge className="ml-2 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                            Partial Result - Continue filling remaining fields
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {!viewMode && !isCompleteResult && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="completedDate"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Completion Date</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant="outline"
                                                                className={cn(
                                                                    'w-full pl-3 text-left font-normal',
                                                                    !field.value && 'text-muted-foreground'
                                                                )}
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
                                                            disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="resultType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Result Type</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select result type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="calibration">Calibration Certificate</SelectItem>
                                                        <SelectItem value="service">Service Report</SelectItem>
                                                        <SelectItem value="spare_quotation">Spare Quotation</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}

                            {/* Test Data Entry */}
                            {testData.length > 0 && (
                                <div className="space-y-4">
                                    <Separator />
                                    <h4 className="font-semibold">Test Results</h4>

                                    {testData.map((section, sectionIndex) => (
                                        <Card key={section.id} className={cn(
                                            "transition-all",
                                            savedSections.has(section.id) && "border-green-500 bg-green-50/50 dark:bg-green-950/20"
                                        )}>
                                            <CardHeader className="py-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <CardTitle className="text-base">{section.title}</CardTitle>
                                                        {savedSections.has(section.id) && (
                                                            <Badge className="bg-green-100 text-green-800">
                                                                <CheckCircle className="w-3 h-3 mr-1" /> Saved
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {section.type === 'tolerance' && (
                                                            <Badge variant="outline">±{section.tolerance} {section.unit}</Badge>
                                                        )}
                                                        {!viewMode && !isCompleteResult && !savedSections.has(section.id) && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleSaveSection(sectionIndex)}
                                                                disabled={savingSection === section.id || !isSectionComplete(section)}
                                                            >
                                                                {savingSection === section.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <Save className="w-4 h-4 mr-1" /> Save
                                                                    </>
                                                                )}
                                                            </Button>
                                                        )}
                                                        {savedSections.has(section.id) && (
                                                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                                                <CheckCircle className="w-3 h-3 mr-1" /> Complete
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {section.type === 'checklist' ? (
                                                    <div className="space-y-2">
                                                        {section.rows.map((row, rowIndex) => (
                                                            <label key={row.id} className="flex items-center gap-3 p-2 border rounded">
                                                                <input
                                                                    type="checkbox"
                                                                    className="h-4 w-4"
                                                                    checked={!!row.passed}
                                                                    onChange={(e) => handleChecklistToggle(sectionIndex, rowIndex, e.target.checked)}
                                                                    disabled={viewMode || isCompleteResult}
                                                                />
                                                                <span className="text-sm">{row.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Column Headers */}
                                                        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                                                            <div className="col-span-3">Label</div>
                                                            {section.type === 'tolerance' && <div className="col-span-2">Reference</div>}
                                                            {section.type === 'range' && (
                                                                <>
                                                                    <div className="col-span-1">Min</div>
                                                                    <div className="col-span-1">Max</div>
                                                                </>
                                                            )}
                                                            <div className="col-span-2">Measured</div>
                                                            {section.type === 'tolerance' && <div className="col-span-2">Error</div>}
                                                            <div className="col-span-2">Status</div>
                                                        </div>

                                                        {section.rows.map((row, rowIndex) => (
                                                            <div key={row.id} className="grid grid-cols-12 gap-2 items-center py-1 border-b last:border-0">
                                                                <div className="col-span-3 text-sm font-medium">{row.label}</div>

                                                                {section.type === 'tolerance' && (
                                                                    <div className="col-span-2 text-sm text-muted-foreground">
                                                                        {row.reference} {row.unit || section.unit}
                                                                    </div>
                                                                )}

                                                                {section.type === 'range' && (
                                                                    <>
                                                                        <div className="col-span-1 text-sm text-muted-foreground">{row.min ?? '-'}</div>
                                                                        <div className="col-span-1 text-sm text-muted-foreground">{row.max ?? '-'}</div>
                                                                    </>
                                                                )}

                                                                <div className="col-span-2">
                                                                    <Input
                                                                        type="number"
                                                                        step="any"
                                                                        placeholder="Value"
                                                                        className="h-8"
                                                                        value={row.measured ?? ''}
                                                                        onChange={(e) => handleMeasuredChange(sectionIndex, rowIndex, e.target.value)}
                                                                        disabled={viewMode || isCompleteResult}
                                                                    />
                                                                </div>

                                                                {section.type === 'tolerance' && (
                                                                    <div className={cn(
                                                                        "col-span-2 text-sm font-mono",
                                                                        row.error !== undefined && (row.passed ? "text-green-600" : "text-red-600")
                                                                    )}>
                                                                        {row.error !== undefined ? (row.error >= 0 ? '+' : '') + row.error.toFixed(3) : '-'}
                                                                    </div>
                                                                )}

                                                                <div className="col-span-2">
                                                                    {row.passed !== undefined && (
                                                                        row.passed ? (
                                                                            <Badge className="bg-green-100 text-green-800">
                                                                                <CheckCircle className="w-3 h-3 mr-1" /> Pass
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge className="bg-red-100 text-red-800">
                                                                                <XCircle className="w-3 h-3 mr-1" /> Fail
                                                                            </Badge>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}

                                                {/* Section Upload */}
                                                {!viewMode && !isCompleteResult && (
                                                    <div className="pt-2 border-t mt-2">
                                                        <div className="flex items-center gap-2">
                                                            <Upload className="w-4 h-4 text-muted-foreground" />
                                                            <span className="text-sm text-muted-foreground">Upload for this test (optional)</span>
                                                        </div>
                                                        <Input
                                                            type="file"
                                                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                                            className="mt-2 cursor-pointer"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0] || null;
                                                                handleSectionDocumentChange(section.id, file);
                                                            }}
                                                        />
                                                        {sectionDocuments[section.id] && (
                                                            <div className="flex items-center gap-2 p-2 bg-muted rounded-md mt-2">
                                                                <FileText className="h-4 w-4" />
                                                                <span className="text-sm flex-1">{sectionDocuments[section.id]?.name}</span>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleSectionDocumentChange(section.id, null)}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Display existing section document */}
                                                {section.documentUrl && (
                                                    <div className="pt-2 border-t mt-2">
                                                        <div className="text-sm text-muted-foreground mb-2">Uploaded Document:</div>
                                                        {section.documentUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                            <div className="space-y-2">
                                                                <img
                                                                    src={section.documentUrl}
                                                                    alt="Section document"
                                                                    className="max-w-full h-auto rounded border"
                                                                    style={{ maxHeight: '400px' }}
                                                                />
                                                                <a
                                                                    href={section.documentUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                                                                >
                                                                    <FileText className="w-4 h-4" />
                                                                    View Full Image
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <a
                                                                href={section.documentUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                                                            >
                                                                <FileText className="w-4 h-4" />
                                                                View Document
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}

                            <Separator />

                            {!viewMode && !isCompleteResult && (
                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Notes (Optional)</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Add any additional notes about the maintenance..."
                                                    rows={3}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {!viewMode && !isCompleteResult && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Upload Final Certificate/Report (Optional)</label>
                                    <p className="text-xs text-muted-foreground">Upload the final calibration certificate or service report</p>
                                    <Input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) setSelectedDocument(file);
                                        }}
                                        className="cursor-pointer"
                                    />
                                    {selectedDocument && (
                                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                            <FileText className="h-4 w-4" />
                                            <span className="text-sm flex-1">{selectedDocument.name}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSelectedDocument(null)}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </form>
                    </Form>
                </div>

                <DialogFooter className="px-6 py-4 border-t">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                        {viewMode || isCompleteResult ? 'Close' : 'Cancel'}
                    </Button>
                    {!viewMode && !isCompleteResult && (
                        <Button
                            onClick={form.handleSubmit(onSubmit)}
                            disabled={isLoading}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {(() => {
                                // Check if all sections are complete
                                const allSectionsComplete = testData.length > 0 && testData.every(section => {
                                    if (!section.rows || section.rows.length === 0) return true;
                                    if (section.type === 'checklist') {
                                        return section.rows.every(row => row.passed === true);
                                    }
                                    return section.rows.every(row => row.measured !== undefined && row.measured !== null);
                                });

                                // Show "Save All & Complete" only if all sections are filled
                                return allSectionsComplete ? 'Save All & Complete' : 'Update Result';
                            })()}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
