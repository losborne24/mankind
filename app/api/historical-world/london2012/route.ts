import dataset from '@/lib/history/fixtures/london2012.json';

/** Reviewed local fixture only; no remote citation fetching or user-controlled URL. */
export function GET() {
  return Response.json(dataset);
}
