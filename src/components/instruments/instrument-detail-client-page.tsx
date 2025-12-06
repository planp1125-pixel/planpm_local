'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Instrument, MaintenanceEvent, MaintenanceResult } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CalendarDays, FlaskConical, Tag, Wrench, ChevronRight, HardDrive, FileText, ExternalLink } from 'lucide-react';
import { format, isAfter } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';

function DetailItem({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: React.ReactNode }) {
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

    useEffect(() => {
        const fetchInstrument = async () => {
            const { data, error } = await supabase.from('instruments').select('*').eq('id', instrumentId).single();
            if (data) setInstrument(data);
            setIsLoadingInstrument(false);
        };

        const fetchHistory = async () => {
            const { data: schedules, error: schedulesError } = await supabase
                .from('maintenanceSchedules')
                .select('*')
                .eq('instrumentId', instrumentId)
                .order('dueDate', { ascending: false });

            if (schedules) setMaintenanceHistory(schedules);

            const { data: results, error: resultsError } = await supabase
                .from('maintenanceResults')
                .select('*')
                .eq('instrumentId', instrumentId);

            if (results) setMaintenanceResults(results);

            setIsLoadingHistory(false);
        };

        if (instrumentId) {
            fetchInstrument();
            fetchHistory();
        }
    }, [instrumentId]);

    const image = useMemo(() => {
        if (!instrument) return null;

        // Prioritize uploaded image over placeholder
        if (instrument.imageUrl) {
            return {
                imageUrl: instrument.imageUrl,
                description: instrument.instrumentType || instrument.eqpId,
                imageHint: ''
            };
        }

        // Fallback to placeholder image
        const defaultImage = PlaceHolderImages.find(img => img.id === instrument.imageId);
        return {
            imageUrl: defaultImage?.imageUrl || '',
            description: defaultImage?.description || instrument.instrumentType,
            imageHint: defaultImage?.imageHint || ''
        };
    }, [instrument]);

    console.log('Instrument detail - imageUrl:', instrument?.imageUrl);
    console.log('Instrument detail - image object:', image);

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
                    <div className="md:col-span-2 space-y-4">
                        <Skeleton className="h-64 w-full" />
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
                    <AlertDescription>
                        The instrument you are looking for could not be found. It may have been removed or the ID is incorrect.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <div className="flex items-center gap-4">
                <Link href="/instruments" className="text-sm text-muted-foreground hover:text-foreground">
                    Instruments
                </Link>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold tracking-tight font-headline">{instrument.eqpId}</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                    <Card>
                        <CardContent className="p-0">
                            <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
                                {image?.imageUrl ? (
                                    <Image
                                        src={image.imageUrl}
                                        alt={image.description}
                                        width={600}
                                        height={400}
                                        className="object-cover w-full h-full"
                                        data-ai-hint={image.imageHint}
                                        unoptimized={!!instrument.imageUrl}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <FlaskConical className="w-12 h-12" />
                                    </div>
                                )}
                            </div>
                            <div className="p-6">
                                <h3 className="text-lg font-semibold">{instrument.eqpId}</h3>
                                <p className="text-muted-foreground">{instrument.instrumentType}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="font-headline text-lg">Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <DetailItem icon={Tag} label="Maintenance Type" value={<Badge variant="default">{instrument.maintenanceType || 'Not set'}</Badge>} />
                            <DetailItem icon={Tag} label="Make / Manufacturer" value={instrument.make || 'Not specified'} />
                            <DetailItem icon={HardDrive} label="Model / Serial" value={`${instrument.model} / ${instrument.serialNumber}`} />
                            <DetailItem icon={Tag} label="Location" value={instrument.location} />
                            <DetailItem icon={Wrench} label="Maintenance Frequency" value={instrument.frequency} />
                            <DetailItem icon={CalendarDays} label="Schedule Start Date" value={scheduleDate ? scheduleDate.toLocaleDateString() : 'Not set'} />
                        </CardContent>
                    </Card>
                </div>
                <div className="md:col-span-2 space-y-6">
                    {nextMaintenanceDate && (
                        <Alert variant={isOverdue ? "destructive" : "default"}>
                            <CalendarDays className="h-4 w-4" />
                            <AlertTitle>Next Maintenance Due</AlertTitle>
                            <AlertDescription>
                                The next scheduled maintenance is due on <span className="font-semibold">{format(nextMaintenanceDate, 'PPP')}</span>.
                                {isOverdue && " This is overdue."}
                            </AlertDescription>
                        </Alert>
                    )}
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
                </div>
            </div>
        </div>
    );
}
