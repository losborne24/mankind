import fixture from '@/lib/history/fixtures/menander.json';

export async function GET() { return Response.json(fixture); }
