import { InstrumentClientPage } from "@/components/instruments/instrument-client-page";

export default function InstrumentsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 pt-6 w-full overflow-x-auto">
      <h2 className="text-3xl font-bold tracking-tight font-headline">Instrument Inventory</h2>
      <p className="text-muted-foreground">
        Manage your lab's instruments and track their maintenance schedules.
      </p>
      <InstrumentClientPage />
    </div>
  );
}
