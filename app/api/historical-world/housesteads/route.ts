import dataset from '@/lib/history/fixtures/housesteads.json';

/** Curated phase metadata only; no source imagery or traced reconstruction geometry. */
export function GET() {
  return Response.json(dataset);
}
