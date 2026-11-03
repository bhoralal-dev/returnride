import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yefaqlrczrbdumjuramb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

const BUCKET_NAME = 'network_data';
const FILE_NAME = 'bookings.json';

async function loadBookings(supabase: any) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(FILE_NAME);
    if (error || !data) return [];
    const text = await data.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveBookings(supabase: any, bookings: unknown[]) {
  try {
    await supabase.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => {});
    await supabase.storage.from(BUCKET_NAME).upload(
      FILE_NAME,
      JSON.stringify(bookings, null, 2),
      { upsert: true, contentType: 'application/json' }
    );
  } catch {
    // Non-blocking
  }
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ bookings: [] });

  const bookings = await loadBookings(supabase);
  return NextResponse.json(
    { bookings },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Supabase missing' }, { status: 500 });

  try {
    const body = await request.json();
    const { bookings, booking } = body;

    let current = await loadBookings(supabase);
    if (Array.isArray(bookings)) {
      current = bookings;
    } else if (booking) {
      current = [booking, ...current.filter((b: any) => b.id !== booking.id)];
    }

    await saveBookings(supabase, current);
    return NextResponse.json({ success: true, bookings: current });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update bookings' },
      { status: 500 }
    );
  }
}
