'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Search, CheckCircle, XCircle, ChevronDown, ChevronUp, Calendar, Beaker } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { MaintenanceResult, Instrument, TestSection } from '@/lib/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

type ExtendedResult = MaintenanceResult & {
    instrument?: Instrument;
    scheduleDescription?: string;
    testData?: TestSection[];
    templateId?: string;
};

export default function ResultsPage() {
    const [results, setResults] = useState<ExtendedResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        const fetchResults = async () => {
            // Fetch results
            const { data: resultsData, error: resultsError } = await supabase
                .from('maintenanceResults')
                .select('*')
                .order('completedDate', { ascending: false });

            if (resultsError) {
                console.error('Error fetching results:', resultsError);
                setIsLoading(false);
                return;
            }

            if (!resultsData || resultsData.length === 0) {
                setResults([]);
                setIsLoading(false);
                return;
            }

            // Fetch instruments
            const instrumentIds = Array.from(new Set(resultsData.map(r => r.instrumentId)));
            const { data: instrumentsData } = await supabase
                .from('instruments')
                .select('*')
                .in('id', instrumentIds);

            // Fetch schedules for description
            const scheduleIds = Array.from(new Set(resultsData.map(r => r.maintenanceScheduleId)));
            const { data: schedulesData } = await supabase
                .from('maintenanceSchedules')
                .select('id, description, type')
                .in('id', scheduleIds);

            // Merge
            const merged = resultsData.map(result => ({
                ...result,
                instrument: instrumentsData?.find(i => i.id === result.instrumentId),
                scheduleDescription: schedulesData?.find(s => s.id === result.maintenanceScheduleId)?.description
            }));

            setResults(merged);
            setIsLoading(false);
        };

        fetchResults();
    }, []);

    const filteredResults = results.filter(result =>
        result.instrument?.eqpId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.resultType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.instrument?.instrumentType.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getOverallStatus = (testData: TestSection[] | undefined) => {
        if (!testData || testData.length === 0) return null;

        let totalRows = 0;
        let passedRows = 0;
        let failedRows = 0;

        testData.forEach(section => {
            section.rows?.forEach(row => {
                if (row.passed !== undefined) {
                    totalRows++;
                    if (row.passed) passedRows++;
                    else failedRows++;
                }
            });
        });

        if (totalRows === 0) return null;
        if (failedRows > 0) return { status: 'fail', passed: passedRows, total: totalRows };
        return { status: 'pass', passed: passedRows, total: totalRows };
    };

    const getResultTypeBadge = (type: string) => {
        switch (type) {
            case 'calibration':
                return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Calibration</Badge>;
            case 'service':
                return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Service</Badge>;
            case 'spare_quotation':
                return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Spare Quote</Badge>;
            default:
                return <Badge variant="secondary">{type}</Badge>;
        }
    };

    return (
        <div className="flex-1 space-y-6 p-4 md:p-6 pt-6 w-full overflow-x-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight font-headline">Maintenance Results</h2>
                    <p className="text-muted-foreground">History of all completed maintenance and calibrations</p>
                </div>
            </div>

            <div className="flex items-center space-x-2">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by instrument, type, or notes..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="grid gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="p-6">
                                <Skeleton className="h-20 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : filteredResults.length > 0 ? (
                <div className="space-y-4 w-full">
                    {filteredResults.map((result) => {
                        const overallStatus = getOverallStatus(result.testData);
                        const isExpanded = expandedId === result.id;

                        return (
                            <Card key={result.id} className="w-full overflow-hidden hover:shadow-md transition-shadow">
                                <Collapsible open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : result.id)}>
                                    <CollapsibleTrigger asChild>
                                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-5 px-6">
                                            <div className="flex items-center justify-between gap-6">
                                                <div className="flex items-center gap-6">
                                                    {/* Instrument Info */}
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                                                            <Beaker className="w-7 h-7 text-primary" />
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-lg">{result.instrument?.eqpId || 'Unknown'}</div>
                                                            <div className="text-sm text-muted-foreground">{result.instrument?.instrumentType} • {result.instrument?.model}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    {/* Result Type */}
                                                    {getResultTypeBadge(result.resultType)}

                                                    {/* Overall Status */}
                                                    {overallStatus && (
                                                        <Badge className={cn(
                                                            overallStatus.status === 'pass'
                                                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                        )}>
                                                            {overallStatus.status === 'pass' ? (
                                                                <><CheckCircle className="w-3 h-3 mr-1" /> All Pass</>
                                                            ) : (
                                                                <><XCircle className="w-3 h-3 mr-1" /> {overallStatus.total - overallStatus.passed} Failed</>
                                                            )}
                                                        </Badge>
                                                    )}

                                                    {/* Date */}
                                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                        <Calendar className="w-4 h-4" />
                                                        {new Date(result.completedDate).toLocaleDateString()}
                                                    </div>

                                                    {/* Document */}
                                                    {result.documentUrl && (
                                                        <a
                                                            href={result.documentUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 text-primary hover:underline"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <FileText className="w-4 h-4" />
                                                        </a>
                                                    )}

                                                    {/* Expand */}
                                                    {result.testData && result.testData.length > 0 && (
                                                        <div className="text-muted-foreground">
                                                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                        {result.testData && result.testData.length > 0 && (
                                            <CardContent className="pt-0 border-t">
                                                <div className="space-y-4 pt-4">
                                                    {result.testData.map((section, sectionIndex) => (
                                                        <div key={section.id || sectionIndex} className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="font-medium">{section.title}</h4>
                                                                {section.type === 'tolerance' && (
                                                                    <Badge variant="outline">±{section.tolerance} {section.unit}</Badge>
                                                                )}
                                                            </div>

                                                            <div className="rounded-lg border overflow-hidden">
                                                                <table className="w-full text-sm">
                                                                    <thead className="bg-muted/50">
                                                                        <tr>
                                                                            <th className="px-4 py-2 text-left font-medium">Label</th>
                                                                            {section.type === 'tolerance' && <th className="px-4 py-2 text-left font-medium">Reference</th>}
                                                                            {section.type === 'range' && (
                                                                                <>
                                                                                    <th className="px-4 py-2 text-left font-medium">Min</th>
                                                                                    <th className="px-4 py-2 text-left font-medium">Max</th>
                                                                                </>
                                                                            )}
                                                                            <th className="px-4 py-2 text-left font-medium">Measured</th>
                                                                            {section.type === 'tolerance' && <th className="px-4 py-2 text-left font-medium">Error</th>}
                                                                            <th className="px-4 py-2 text-center font-medium">Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {section.rows?.map((row, rowIndex) => (
                                                                            <tr key={row.id || rowIndex} className="border-t">
                                                                                <td className="px-4 py-2 font-medium">{row.label}</td>
                                                                                {section.type === 'tolerance' && (
                                                                                    <td className="px-4 py-2 text-muted-foreground">{row.reference} {row.unit || section.unit}</td>
                                                                                )}
                                                                                {section.type === 'range' && (
                                                                                    <>
                                                                                        <td className="px-4 py-2 text-muted-foreground">{row.min ?? '-'}</td>
                                                                                        <td className="px-4 py-2 text-muted-foreground">{row.max ?? '-'}</td>
                                                                                    </>
                                                                                )}
                                                                                <td className="px-4 py-2 font-mono">
                                                                                    {row.measured !== undefined ? row.measured : '-'}
                                                                                </td>
                                                                                {section.type === 'tolerance' && (
                                                                                    <td className={cn(
                                                                                        "px-4 py-2 font-mono",
                                                                                        row.error !== undefined && (row.passed ? "text-green-600" : "text-red-600")
                                                                                    )}>
                                                                                        {row.error !== undefined ? (row.error >= 0 ? '+' : '') + row.error.toFixed(3) : '-'}
                                                                                    </td>
                                                                                )}
                                                                                <td className="px-4 py-2 text-center">
                                                                                    {row.passed !== undefined ? (
                                                                                        row.passed ? (
                                                                                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                                                                                <CheckCircle className="w-3 h-3 mr-1" /> Pass
                                                                                            </Badge>
                                                                                        ) : (
                                                                                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                                                                                <XCircle className="w-3 h-3 mr-1" /> Fail
                                                                                            </Badge>
                                                                                        )
                                                                                    ) : '-'}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                            {/* Section Document Link */}
                                                            {section.documentUrl && (
                                                                <div className="mt-2">
                                                                    <a
                                                                        href={section.documentUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                                                                    >
                                                                        <FileText className="w-4 h-4" />
                                                                        View Test Document
                                                                    </a>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}

                                                    {result.notes && (
                                                        <div className="pt-2 border-t">
                                                            <span className="text-sm font-medium">Notes: </span>
                                                            <span className="text-sm text-muted-foreground">{result.notes}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        )}
                                    </CollapsibleContent>
                                </Collapsible>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Beaker className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="font-semibold mb-2">No results found</h3>
                        <p className="text-muted-foreground">Complete some maintenance tasks to see results here.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
