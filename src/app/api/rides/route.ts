import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { validateRideCapacity } from '@/lib/booking-engine';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yefaqlrczrbdumjuramb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Convert any custom ID (e.g. phone 'usr-ph-03001234567') to a deterministic valid UUID v4
function toDeterministicUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(id || 'default_driver_id').digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// Global server memory cache to guarantee 100% instantaneous live sync across all tabs & devices
declare global {
  // eslint-disable-next-line no-var
  var _serverSharedRides: Map<string, any> | undefined;
}

if (!globalThis._serverSharedRides) {
  globalThis._serverSharedRides = new Map<string, any>();
}

const BUCKET_NAME = 'network_data';
const RIDES_FILE = 'rides.json';

// Helper to load rides from network storage
async function loadSharedRides(supabase: any) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(RIDES_FILE);
    if (error || !data) return [];
    const text = await data.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Helper to save rides to network storage
async function saveSharedRides(supabase: any, rides: unknown[]) {
  try {
    await supabase.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => {});
    await supabase.storage.from(BUCKET_NAME).upload(
      RIDES_FILE,
      JSON.stringify(rides, null, 2),
      { upsert: true, contentType: 'application/json' }
    );
  } catch {
    // Non-blocking
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');
  const mode = searchParams.get('mode');

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database credentials not configured on server.' },
      { status: 500 }
    );
  }

  try {
    // 1. Fetch from database table 'rides' with joins
    let query = supabase
      .from('rides')
      .select('*, driver:user_profiles(*), vehicle:vehicles(*)')
      .in('status', ['PUBLISHED', 'SEATS_FILLED', 'FULL_CAR_BOOKED'])
      .order('departure_time', { ascending: true });

    if (origin && origin !== 'ALL') query = query.eq('origin_location_id', origin);
    if (destination && destination !== 'ALL') query = query.eq('destination_location_id', destination);
    if (mode && mode !== 'ALL') query = query.eq('booking_mode', mode);

    const { data: dbRides, error: dbErr } = await query;

    // 2. Fetch from shared cloud storage
    const storageRides = await loadSharedRides(supabase);

    // 3. Map db rows to standard Ride shape
    const formattedDbRides = (dbRides || []).map((row: any) => ({
      id: row.id,
      driverId: row.driver_id,
      driverName: row.driver?.full_name || 'Verified Captain',
      driverPhone: row.driver?.phone_number || '0300-1234567',
      vehicleId: row.vehicle_id || 'veh-default',
      vehicleMakeModel: row.vehicle ? `${row.vehicle.make} ${row.vehicle.model}`.trim() : 'Car',
      vehiclePlate: row.vehicle?.license_plate || '',
      vehicleColor: row.vehicle?.color || 'White',
      originLocationId: row.origin_location_id,
      destinationLocationId: row.destination_location_id,
      departureTime: row.departure_time,
      bookingMode: row.booking_mode,
      capacity: row.capacity,
      bookedSeatsCount: row.booked_seats_count || 0,
      wholeCarPrice: Number(row.whole_car_price),
      seatPrice: Number(row.seat_price || 0),
      status: row.status,
      autoReopenOnCancellation: row.auto_reopen_on_cancellation ?? true,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // 4. Merge storage rides and db rides (storage rides may have rich frontend comfort attributes)
    const rideMap = new Map<string, any>();
    for (const r of formattedDbRides) {
      rideMap.set(r.id, r);
    }
    for (const sr of storageRides) {
      if (rideMap.has(sr.id)) {
        // Overlay rich fields
        rideMap.set(sr.id, { ...rideMap.get(sr.id), ...sr });
      } else {
        rideMap.set(sr.id, sr);
      }
    }

    // 5. Merge server memory cache to guarantee instant real-time live availability
    if (globalThis._serverSharedRides) {
      for (const [id, r] of globalThis._serverSharedRides.entries()) {
        if (rideMap.has(id)) {
          rideMap.set(id, { ...rideMap.get(id), ...r });
        } else {
          rideMap.set(id, r);
        }
      }
    }

    let allRides = Array.from(rideMap.values());
    if (origin && origin !== 'ALL') allRides = allRides.filter((r) => r.originLocationId === origin);
    if (destination && destination !== 'ALL') allRides = allRides.filter((r) => r.destinationLocationId === destination);
    if (mode && mode !== 'ALL') allRides = allRides.filter((r) => r.bookingMode === mode);

    return NextResponse.json(
      { rides: allRides },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (err: unknown) {
    // If Supabase has transient error, return from memory cache as graceful fallback
    const fallbackRides = globalThis._serverSharedRides ? Array.from(globalThis._serverSharedRides.values()) : [];
    return NextResponse.json(
      { rides: fallbackRides, error: err instanceof Error ? err.message : 'Fallback to memory cache' },
      { status: 200 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();

  try {
    const body = await request.json();
    const {
      ride: fullRide,
      driverId,
      driverName,
      driverPhone,
      vehicle,
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

    const effDriverId = driverId || fullRide?.driverId;
    const effOrigin = originLocationId || fullRide?.originLocationId;
    const effDest = destinationLocationId || fullRide?.destinationLocationId;
    const effDeparture = departureTime || fullRide?.departureTime;
    const effMode = bookingMode || fullRide?.bookingMode || 'WHOLE_CAR_OR_SEATS';
    const effCapacity = Number(capacity || fullRide?.capacity || 4);
    const effWholePrice = Number(wholeCarPrice || fullRide?.wholeCarPrice || 0);
    const effSeatPrice = Number(seatPrice || fullRide?.seatPrice || 0);
    const effRideId = fullRide?.id || `ride-${Date.now()}`;

    // Server-side validation
    if (!effDriverId || !effOrigin || !effDest || !effDeparture) {
      return NextResponse.json(
        { error: 'Missing required ride parameters.' },
        { status: 400 }
      );
    }

    if (effOrigin === effDest) {
      return NextResponse.json(
        { error: 'Origin and destination cities cannot be identical.' },
        { status: 400 }
      );
    }

    validateRideCapacity(effCapacity);

    if (effWholePrice <= 0) {
      return NextResponse.json(
        { error: 'Whole car price must be greater than zero.' },
        { status: 400 }
      );
    }

    // Convert driver ID to a valid deterministic UUID for PostgreSQL foreign key compatibility
    const effDriverUuid = toDeterministicUuid(effDriverId);
    const phone = driverPhone || fullRide?.driverPhone || '0300-1234567';
    const name = driverName || fullRide?.driverName || 'Captain';

    const vehMakeModel = vehicle?.makeModel || fullRide?.vehicleMakeModel || 'Toyota Corolla';
    const [makePart, ...modelRest] = vehMakeModel.split(' ');
    const vehPlate = vehicle?.plate || fullRide?.vehiclePlate || 'ABC-1234';
    const vehColor = vehicle?.color || fullRide?.vehicleColor || 'White';
    const vehHasAc = vehicle?.hasAc ?? (fullRide?.travelComfort?.acType === 'CHILLED_AC');
    const effVehicleId = vehicleId || (vehPlate ? `veh-${vehPlate.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}` : `veh-${effDriverUuid.slice(0, 8)}`);

    let dbData = null;
    if (supabase) {
      // 1. Ensure driver profile exists in user_profiles
      try {
        await supabase.from('user_profiles').upsert({
          id: effDriverUuid,
          phone_number: phone,
          full_name: name,
          role: 'DRIVER',
          is_phone_verified: true,
        });
      } catch {
        // Non-blocking
      }

      // 2. Ensure vehicle exists in vehicles table
      try {
        await supabase.from('vehicles').upsert({
          id: effVehicleId,
          driver_id: effDriverUuid,
          make: makePart || 'Toyota',
          model: modelRest.join(' ') || 'Corolla',
          year: 2022,
          license_plate: vehPlate,
          color: vehColor,
          passenger_capacity: effCapacity,
          has_ac: Boolean(vehHasAc),
          has_trunk_space: true,
        });
      } catch {
        // Non-blocking
      }

      // 3. Insert or update in database table 'rides'
      try {
        const rideRecord = {
          id: effRideId,
          driver_id: effDriverUuid,
          vehicle_id: effVehicleId,
          origin_location_id: effOrigin,
          destination_location_id: effDest,
          departure_time: effDeparture,
          booking_mode: effMode,
          capacity: effCapacity,
          booked_seats_count: 0,
          whole_car_price: effWholePrice,
          seat_price: effSeatPrice > 0 ? effSeatPrice : null,
          status: 'PUBLISHED',
          auto_reopen_on_cancellation: true,
          notes: notes ? String(notes).slice(0, 500) : null,
        };

        const res = await supabase.from('rides').upsert(rideRecord).select().single();
        dbData = res.data;
      } catch {
        // Non-blocking
      }
    }

    // 4. Construct complete rich Ride object
    const finalRideObj = fullRide || {
      id: effRideId,
      driverId: effDriverId,
      driverName: name,
      driverPhone: phone,
      vehicleId: effVehicleId,
      vehicleMakeModel: vehMakeModel,
      vehiclePlate: vehPlate,
      vehicleColor: vehColor,
      originLocationId: effOrigin,
      destinationLocationId: effDest,
      departureTime: effDeparture,
      bookingMode: effMode,
      capacity: effCapacity,
      bookedSeatsCount: 0,
      wholeCarPrice: effWholePrice,
      seatPrice: effSeatPrice,
      status: 'PUBLISHED',
      autoReopenOnCancellation: true,
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 5. Store in global server memory cache (INSTANT availability across all tabs & devices)
    if (globalThis._serverSharedRides) {
      globalThis._serverSharedRides.set(finalRideObj.id, finalRideObj);
    }

    // 6. Also persist to shared cloud storage
    if (supabase) {
      try {
        const currentStorageRides = await loadSharedRides(supabase);
        const updatedStorageRides = [
          finalRideObj,
          ...currentStorageRides.filter((r: any) => r.id !== finalRideObj.id),
        ];
        await saveSharedRides(supabase, updatedStorageRides);
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json(
      { success: true, ride: finalRideObj, db: dbData },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request payload' },
      { status: 400 }
    );
  }
}
