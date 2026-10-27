import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { validateRideCapacity } from '@/lib/booking-engine';

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');
  const mode = searchParams.get('mode');

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database credentials not configured on server.' },
      { status: 500 }
    );
  }

  try {
    let query = supabase
      .from('rides')
      .select('*, driver:user_profiles(*)')
      .in('status', ['PUBLISHED', 'SEATS_FILLED', 'FULL_CAR_BOOKED'])
      .order('departure_time', { ascending: true });

    if (origin && origin !== 'ALL') {
      query = query.eq('origin_location_id', origin);
    }
    if (destination && destination !== 'ALL') {
      query = query.eq('destination_location_id', destination);
    }
    if (mode && mode !== 'ALL') {
      query = query.eq('booking_mode', mode);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rides: data || [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch rides' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database credentials not configured on server.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      driverId,
      vehicleId,
      originLocationId,
      destinationLocationId,
      departureTime,
      bookingMode,
      capacity,
      wholeCarPrice,
      seatPrice,
      notes,
    } = body;

    // Server-side validation
    if (!driverId || !originLocationId || !destinationLocationId || !departureTime) {
      return NextResponse.json(
        { error: 'Missing required ride parameters.' },
        { status: 400 }
      );
    }

    if (originLocationId === destinationLocationId) {
      return NextResponse.json(
        { error: 'Origin and destination cities cannot be identical.' },
        { status: 400 }
      );
    }

    const departureMs = new Date(departureTime).getTime();
    if (Number.isNaN(departureMs) || departureMs <= Date.now()) {
      return NextResponse.json(
        { error: 'Departure time must be set in the future.' },
        { status: 400 }
      );
    }

    validateRideCapacity(Number(capacity) || 4);

    if (Number(wholeCarPrice) <= 0) {
      return NextResponse.json(
        { error: 'Whole car price must be greater than zero.' },
        { status: 400 }
      );
    }

    const rideRecord = {
      driver_id: driverId,
      vehicle_id: vehicleId || null,
      origin_location_id: originLocationId,
      destination_location_id: destinationLocationId,
      departure_time: departureTime,
      booking_mode: bookingMode || 'WHOLE_CAR_OR_SEATS',
      capacity: Number(capacity) || 4,
      booked_seats_count: 0,
      whole_car_price: Number(wholeCarPrice),
      seat_price: seatPrice ? Number(seatPrice) : null,
      status: 'PUBLISHED',
      auto_reopen_on_cancellation: true,
      notes: notes ? String(notes).slice(0, 500) : null,
    };

    const { data, error } = await supabase.from('rides').insert(rideRecord).select().single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ride: data }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request payload' },
      { status: 400 }
    );
  }
}
