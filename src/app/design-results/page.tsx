'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray, Control, UseFormRegister } from 'react-hook-form';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ArrowLeft, Loader2, FileText, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { TestTemplate, TestSection, TemplateSectionType } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type FormRow = {
    id: string;
    label: string;
    reference?: number;
    min?: number;
    max?: number;
    unit?: string;
};

type FormSection = {
    id: string;
    title: string;
    type: TemplateSectionType;
    tolerance?: number;
    unit?: string;
    rows: FormRow[];
};

type FormValues = {
    name: string;
    description: string;
    sections: FormSection[];
};

export default function DesignResultsPage() {
    const [templates, setTemplates] = useState<TestTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const { toast } = useToast();

    const form = useForm<FormValues>({
        defaultValues: {
            name: '',
            description: '',
            sections: []
        }
    });

    const { fields: sectionFields, append: appendSection, remove: removeSection } = useFieldArray({
        control: form.control,
        name: "sections"
    });

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('testTemplates')
            .select('*')
            .order('createdAt', { ascending: false });

        if (error) {
            console.error('Error fetching templates:', error);
            toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
        } else {
            setTemplates(data || []);
        }
        setIsLoading(false);
    };

    const handleCreateNew = () => {
        form.reset({
            name: '',
            description: '',
            sections: [{
                id: crypto.randomUUID(),
                title: 'New Section',
                type: 'tolerance',
                tolerance: 0,
                unit: '',
                rows: [{ id: crypto.randomUUID(), label: 'Reading 1', reference: 0 }]
            }]
        });
        setEditingId(null);
        setIsEditing(true);
    };

    const handleEdit = (template: TestTemplate) => {
        form.reset({
            name: template.name,
            description: template.description || '',
            sections: template.structure.map(section => ({
                ...section,
                type: section.type || 'simple',
                rows: section.rows || []
            }))
        });
        setEditingId(template.id);
        setIsEditing(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;

        const { error } = await supabase.from('testTemplates').delete().eq('id', id);
        if (error) {
            toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
        } else {
            toast({ title: 'Deleted', description: 'Template deleted successfully' });
            fetchTemplates();
        }
    };

    const onSubmit = async (values: FormValues) => {
        setIsLoading(true);

        const templateData = {
            name: values.name,
            description: values.description,
            structure: values.sections
        };

        let error;
        if (editingId) {
            const { error: updateError } = await supabase
                .from('testTemplates')
                .update(templateData)
                .eq('id', editingId);
            error = updateError;
        } else {
            const { error: insertError } = await supabase
                .from('testTemplates')
                .insert(templateData);
            error = insertError;
        }

        if (error) {
            console.error('Error saving template:', error);
            toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
        } else {
            toast({ title: 'Success', description: 'Template saved successfully' });
            setIsEditing(false);
            fetchTemplates();
        }
        setIsLoading(false);
    };

    const addNewSection = (type: TemplateSectionType) => {
        appendSection({
            id: crypto.randomUUID(),
            title: '',
            type: type,
            tolerance: type === 'tolerance' ? 0.1 : undefined,
            unit: '',
            rows: [{ id: crypto.randomUUID(), label: 'Row 1', reference: 0 }]
        });
    };

    // EDITING VIEW
    if (isEditing) {
        return (
            <div className="flex-1 space-y-6 p-4 md:p-6 pt-6 w-full">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <h2 className="text-3xl font-bold tracking-tight font-headline">
                        {editingId ? 'Edit Template' : 'New Template'}
                    </h2>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Template Info */}
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Template Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Template Name *</Label>
                                    <Input
                                        id="name"
                                        {...form.register('name', { required: true })}
                                        placeholder="e.g., Pressure Gauge Calibration"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Input
                                        id="description"
                                        {...form.register('description')}
                                        placeholder="Optional description..."
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sections */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Test Sections</h3>
                            <div className="flex gap-2">
                                <Button type="button" onClick={() => addNewSection('tolerance')} variant="outline" size="sm">
                                    <Plus className="w-4 h-4 mr-1" /> Tolerance Section
                                </Button>
                                <Button type="button" onClick={() => addNewSection('range')} variant="outline" size="sm">
                                    <Plus className="w-4 h-4 mr-1" /> Range Section
                                </Button>
                                <Button type="button" onClick={() => addNewSection('simple')} variant="outline" size="sm">
                                    <Plus className="w-4 h-4 mr-1" /> Simple Section
                                </Button>
                            </div>
                        </div>

                        {sectionFields.length === 0 && (
                            <Card className="bg-muted/50 border-dashed">
                                <CardContent className="py-8 text-center text-muted-foreground">
                                    Add a section to get started
                                </CardContent>
                            </Card>
                        )}

                        {sectionFields.map((section, index) => (
                            <SectionEditor
                                key={section.id}
                                index={index}
                                control={form.control}
                                register={form.register}
                                watch={form.watch}
                                setValue={form.setValue}
                                onRemove={() => removeSection(index)}
                            />
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-4 sticky bottom-4 bg-background py-4 border-t">
                        <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Template
                        </Button>
                    </div>
                </form>
            </div>
        );
    }

    // LIST VIEW
    return (
        <div className="flex-1 space-y-6 p-4 md:p-6 pt-6 w-full">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight font-headline">Design Results</h2>
                    <p className="text-muted-foreground">Create and manage test templates for maintenance results</p>
                </div>
                <Button onClick={handleCreateNew}>
                    <Plus className="w-4 h-4 mr-2" /> New Template
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} className="animate-pulse">
                            <CardHeader>
                                <div className="h-6 bg-muted rounded w-3/4"></div>
                                <div className="h-4 bg-muted rounded w-1/2 mt-2"></div>
                            </CardHeader>
                        </Card>
                    ))
                ) : templates.length > 0 ? (
                    templates.map(template => (
                        <Card
                            key={template.id}
                            className="hover:shadow-md transition-shadow group"
                        >
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-primary" />
                                            {template.name}
                                        </CardTitle>
                                        <CardDescription className="mt-1">
                                            {template.description || 'No description'}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-1 mb-3">
                                    {template.structure?.map((section, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                            {section.title || 'Untitled'} ({section.rows?.length || 0} rows)
                                        </Badge>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEdit(template)}>
                                        Edit
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(template.id)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="col-span-full">
                        <Card className="bg-muted/50 border-dashed">
                            <CardContent className="py-12 text-center">
                                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                <h3 className="font-semibold mb-2">No templates yet</h3>
                                <p className="text-muted-foreground mb-4">Create your first template to get started</p>
                                <Button onClick={handleCreateNew}>
                                    <Plus className="w-4 h-4 mr-2" /> Create Template
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}

// Section Editor Component
function SectionEditor({
    index,
    control,
    register,
    watch,
    setValue,
    onRemove
}: {
    index: number;
    control: Control<FormValues>;
    register: UseFormRegister<FormValues>;
    watch: any;
    setValue: any;
    onRemove: () => void;
}) {
    const { fields: rowFields, append: appendRow, remove: removeRow } = useFieldArray({
        control,
        name: `sections.${index}.rows`
    });

    const sectionType = watch(`sections.${index}.type`) as TemplateSectionType;

    const getTypeColor = (type: TemplateSectionType) => {
        switch (type) {
            case 'tolerance': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
            case 'range': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case 'simple': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
        }
    };

    return (
        <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <Input
                        {...register(`sections.${index}.title` as const, { required: true })}
                        placeholder="Section Title (e.g., Repeatability)"
                        className="font-semibold text-lg flex-1 border-0 px-0 focus-visible:ring-0"
                    />
                    <Badge className={getTypeColor(sectionType)}>{sectionType}</Badge>
                    <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Section Settings */}
                <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-1">
                        <Label className="text-xs">Section Type</Label>
                        <Select
                            value={sectionType}
                            onValueChange={(value) => setValue(`sections.${index}.type`, value)}
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="tolerance">Tolerance (±value)</SelectItem>
                                <SelectItem value="range">Range (min-max)</SelectItem>
                                <SelectItem value="simple">Simple (no limits)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {sectionType === 'tolerance' && (
                        <div className="space-y-1">
                            <Label className="text-xs">Tolerance (±)</Label>
                            <Input
                                {...register(`sections.${index}.tolerance` as const, { valueAsNumber: true })}
                                type="number"
                                step="any"
                                placeholder="0.26"
                                className="h-8"
                            />
                        </div>
                    )}

                    <div className="space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Input
                            {...register(`sections.${index}.unit` as const)}
                            placeholder="e.g., bar, g"
                            className="h-8"
                        />
                    </div>
                </div>

                {/* Column Headers */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                    <div className="col-span-4">Label</div>
                    {sectionType === 'tolerance' && <div className="col-span-2">Reference</div>}
                    {sectionType === 'range' && (
                        <>
                            <div className="col-span-2">Min</div>
                            <div className="col-span-2">Max</div>
                        </>
                    )}
                    <div className="col-span-2">Unit</div>
                    <div className="col-span-2"></div>
                </div>

                <Separator />

                {/* Rows */}
                <div className="space-y-2">
                    {rowFields.map((row, rowIndex) => (
                        <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-4">
                                <Input
                                    {...register(`sections.${index}.rows.${rowIndex}.label` as const)}
                                    placeholder={`Reading ${rowIndex + 1}`}
                                    className="h-9"
                                />
                            </div>

                            {sectionType === 'tolerance' && (
                                <div className="col-span-2">
                                    <Input
                                        {...register(`sections.${index}.rows.${rowIndex}.reference` as const, { valueAsNumber: true })}
                                        type="number"
                                        step="any"
                                        placeholder="0"
                                        className="h-9"
                                    />
                                </div>
                            )}

                            {sectionType === 'range' && (
                                <>
                                    <div className="col-span-2">
                                        <Input
                                            {...register(`sections.${index}.rows.${rowIndex}.min` as const, { valueAsNumber: true })}
                                            type="number"
                                            step="any"
                                            placeholder="Min"
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <Input
                                            {...register(`sections.${index}.rows.${rowIndex}.max` as const, { valueAsNumber: true })}
                                            type="number"
                                            step="any"
                                            placeholder="Max"
                                            className="h-9"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="col-span-2">
                                <Input
                                    {...register(`sections.${index}.rows.${rowIndex}.unit` as const)}
                                    placeholder="unit"
                                    className="h-9"
                                />
                            </div>

                            <div className="col-span-2 flex justify-end gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => removeRow(rowIndex)}
                                    disabled={rowFields.length === 1}
                                >
                                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed"
                    onClick={() => appendRow({
                        id: crypto.randomUUID(),
                        label: `Reading ${rowFields.length + 1}`,
                        reference: 0,
                        unit: ''
                    })}
                >
                    <Plus className="w-3 h-3 mr-2" /> Add Row
                </Button>
            </CardContent>
        </Card>
    );
}
