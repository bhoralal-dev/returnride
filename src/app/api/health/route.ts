import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus = 'UNCONFIGURED';
  let dbLatencyMs: number | null = null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    const start = performance.now();
    try {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
      });
      const { error } = await supabase.from('locations').select('id').limit(1);
      dbLatencyMs = Math.round(performance.now() - start);
      dbStatus = error ? `ERROR: ${error.message}` : 'HEALTHY';
    } catch (err: unknown) {
      dbStatus = `EXCEPTION: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const isHealthy = dbStatus === 'HEALTHY' || dbStatus === 'UNCONFIGURED';

  return NextResponse.json(
    {
      status: isHealthy ? 'OK' : 'DEGRADED',
      environment: process.env.NODE_ENV || 'development',
      service: 'ReturnRide Pakistan Marketplace API',
      version: '0.1.0',
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      timestamp,
    },
    { status: isHealthy ? 200 : 503 }
  );
}
