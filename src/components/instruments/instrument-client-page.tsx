'use client';

import { useState, useEffect } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  getFilteredRowModel,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Instrument } from '@/lib/types';
import { columns as createColumns } from './columns';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { AddInstrumentDialog } from './add-instrument-dialog';
import { EditInstrumentDialog } from './edit-instrument-dialog';
import { DeleteConfirmationDialog } from './delete-confirmation-dialog';
import { useToast } from '@/hooks/use-toast';

export function InstrumentClientPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);
  const [deletingInstrument, setDeletingInstrument] = useState<Instrument | null>(null);
  const { toast } = useToast();

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInstruments = async () => {
    const { data, error } = await supabase.from('instruments').select('*');
    if (error) {
      console.error('Error fetching instruments:', error);
    } else {
      setInstruments(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInstruments();
  }, []);

  const handleEdit = (instrument: Instrument) => {
    setEditingInstrument(instrument);
  };

  const handleDelete = (instrument: Instrument) => {
    setDeletingInstrument(instrument);
  };

  const confirmDelete = async () => {
    if (!deletingInstrument) return;

    try {
      // Delete Results
      await supabase.from('maintenanceResults').delete().eq('instrumentId', deletingInstrument.id);
      // Delete Schedules
      await supabase.from('maintenanceSchedules').delete().eq('instrumentId', deletingInstrument.id);
      // Delete Configurations
      await supabase.from('maintenance_configurations').delete().eq('instrument_id', deletingInstrument.id);

      // Delete Instrument
      const { error } = await supabase.from('instruments').delete().eq('id', deletingInstrument.id);

      if (error) throw error;

      setInstruments(prev => prev.filter(i => i.id !== deletingInstrument.id));
      toast({
        title: 'Instrument Deleted',
        description: `${deletingInstrument.eqpId} has been removed from the inventory.`,
        variant: 'destructive',
      });
    } catch (error) {
      console.error('Error deleting instrument:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete instrument.',
        variant: 'destructive',
      });
    }
    setDeletingInstrument(null);
  };

  const columns = createColumns(handleEdit, handleDelete);

  const table = useReactTable({
    data: instruments || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Filter instruments by Eqp. ID..."
          value={(table.getColumn('eqpId')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('eqpId')?.setFilterValue(event.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => setAddDialogOpen(true)}>Add Instrument</Button>
      </div>
      <div className="rounded-md border w-full overflow-x-auto">
        <Table className="min-w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
      <AddInstrumentDialog isOpen={isAddDialogOpen} onOpenChange={setAddDialogOpen} onSuccess={fetchInstruments} />
      {editingInstrument && (
        <EditInstrumentDialog
          isOpen={!!editingInstrument}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setEditingInstrument(null);
            }
          }}
          instrument={editingInstrument}
          onSuccess={fetchInstruments}
        />
      )}
      {deletingInstrument && (
        <DeleteConfirmationDialog
          isOpen={!!deletingInstrument}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDeletingInstrument(null);
            }
          }}
          onConfirm={confirmDelete}
          instrumentName={deletingInstrument.eqpId}
        />
      )}
    </div>
  );
}
