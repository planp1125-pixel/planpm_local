import { InstrumentDetailClientPage } from "@/components/instruments/instrument-detail-client-page";

export default async function InstrumentDetailPage({
  params,
}: {
  params: Promise<{ instrumentId: string }>;
}) {
  const { instrumentId } = await params;
  return <InstrumentDetailClientPage instrumentId={instrumentId} />;
}

