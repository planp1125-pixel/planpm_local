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
}

export function UpdateMaintenanceDialog({
    isOpen,
    onOpenChange,
    maintenanceEvent,
    instrumentId,
    onSuccess,
}: UpdateMaintenanceDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
    const [templates, setTemplates] = useState<TestTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [testData, setTestData] = useState<TestSection[]>([]);
    const [sectionDocuments, setSectionDocuments] = useState<Record<string, File | null>>({});
    const [savingSection, setSavingSection] = useState<string | null>(null);
    const [savedSections, setSavedSections] = useState<Set<string>>(new Set());
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
    useEffect(() => {
        const fetchTemplates = async () => {
            const { data } = await supabase
                .from('testTemplates')
                .select('*')
                .order('name');
            if (data) setTemplates(data);
        };
        if (isOpen) {
            fetchTemplates();
            // Reset state when dialog opens
            setSavedSections(new Set());
            setSectionDocuments({});
        }
    }, [isOpen]);

    // Load template structure when selected
    const handleTemplateSelect = (templateId: string) => {
        setSelectedTemplateId(templateId);
        setSavedSections(new Set());
        setSectionDocuments({});

        if (templateId === 'none') {
            setTestData([]);
            return;
        }

        const template = templates.find(t => t.id === templateId);
        if (template) {
            const clonedStructure = JSON.parse(JSON.stringify(template.structure)) as TestSection[];
            clonedStructure.forEach(section => {
                section.rows.forEach(row => {
                    row.measured = undefined;
                    row.error = undefined;
                    row.passed = undefined;
                });
            });
            setTestData(clonedStructure);
        }
    };

    // Update measured value and calculate error/passed
    const handleMeasuredChange = (sectionIndex: number, rowIndex: number, value: string) => {
        setTestData(prev => {
            const newData = [...prev];
            const section = newData[sectionIndex];
            const row = section.rows[rowIndex];

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

    // Save individual section (draft save)
    const handleSaveSection = async (sectionIndex: number) => {
        const section = testData[sectionIndex];
        if (!section) return;

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

            // Mark section as saved (in real app, you'd save to a draft table)
            setSavedSections(prev => new Set([...prev, section.id]));

            toast({
                title: 'Section Saved',
                description: `"${section.title}" has been saved. You can continue later.`,
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

            // Create maintenance result record with test data
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

            const { error: insertError } = await supabase
                .from('maintenanceResults')
                .insert(resultData);

            if (insertError) {
                console.error('Insert error:', insertError);
                throw insertError;
            }

            // Update the maintenance schedule to mark as completed
            await supabase
                .from('maintenanceSchedules')
                .update({
                    status: 'Completed',
                    completedDate: values.completedDate.toISOString(),
                    completionNotes: values.notes || '',
                })
                .eq('id', maintenanceEvent.id);

            toast({
                title: 'Result Updated',
                description: 'Maintenance result has been recorded successfully.',
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
                    <DialogTitle>Update Maintenance Result</DialogTitle>
                    <DialogDescription>
                        Record completion details for {maintenanceEvent.type} - {maintenanceEvent.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                            {/* Template Selection */}
                            <div className="space-y-2">
                                <FormLabel>Test Template (Optional)</FormLabel>
                                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a template to fill test data..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No template</SelectItem>
                                        {templates.map(template => (
                                            <SelectItem key={template.id} value={template.id}>
                                                {template.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

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
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleSaveSection(sectionIndex)}
                                                            disabled={savingSection === section.id}
                                                        >
                                                            {savingSection === section.id ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <Save className="w-4 h-4 mr-1" /> Save
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
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

                                                {/* Section Upload */}
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
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}

                            <Separator />

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
                        </form>
                    </Form>
                </div>

                <DialogFooter className="px-6 py-4 border-t">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                        Cancel
                    </Button>
                    <Button onClick={form.handleSubmit(onSubmit)} disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save All & Complete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
