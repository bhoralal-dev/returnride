import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yefaqlrczrbdumjuramb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Global server memory cache to guarantee instant real-time live availability across all tabs & devices
declare global {
  // eslint-disable-next-line no-var
  var _serverSharedRequests: PassengerRideRequest[] | undefined;
}

if (!globalThis._serverSharedRequests) {
  globalThis._serverSharedRequests = [];
}

const BUCKET_NAME = 'network_data';
const FILE_NAME = 'passenger_requests.json';

interface PassengerRideRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  originLocationId: string;
  destinationLocationId: string;
  originName: string;
  destinationName: string;
  travelDate: string;
  desiredTime: string;
  bookingType: 'SEAT' | 'WHOLE_CAR';
  seatsCount: number;
  budgetPrice: number;
  isFamilyTrip: boolean;
  acRequired: boolean;
  luggageSize: 'SMALL_BAG' | 'MEDIUM_SUITCASE' | 'FULL_TRUNK';
  notes: string;
  status: 'OPEN' | 'ACCEPTED' | 'FULFILLED' | 'CANCELLED';
  offers: Array<{
    id: string;
    driverId: string;
    driverName: string;
    driverPhone: string;
    driverRating: number;
    vehicleMakeModel: string;
    vehiclePlate: string;
    offeredPrice: number;
    seatsOffered: number;
    pickupTime: string;
    notes?: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    createdAt: string;
  }>;
  createdAt: string;
}

async function loadRequestsFromStorage(supabase: any): Promise<PassengerRideRequest[]> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(FILE_NAME);
    if (error || !data) {
      return [];
    }
    const text = await data.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRequestsToStorage(
  supabase: any,
  requests: PassengerRideRequest[]
): Promise<boolean> {
  try {
    // Ensure bucket exists
    await supabase.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => {});
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(
      FILE_NAME,
      JSON.stringify(requests, null, 2),
      { upsert: true, contentType: 'application/json' }
    );
    return !error;
  } catch {
    return false;
  }
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  let requests: PassengerRideRequest[] = [];

  if (supabase) {
    requests = await loadRequestsFromStorage(supabase);
  }

  // Merge server memory cache to guarantee instant real-time live availability
  if (globalThis._serverSharedRequests && globalThis._serverSharedRequests.length > 0) {
    const map = new Map<string, PassengerRideRequest>();
    requests.forEach((r) => map.set(r.id, r));
    globalThis._serverSharedRequests.forEach((r) => map.set(r.id, { ...map.get(r.id), ...r }));
    requests = Array.from(map.values());
  }

  return NextResponse.json(
    { requests },
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

  try {
    const body = await request.json();
    const { action, request: newReq, requests: fullList, requestId, offer, offerId } = body;

    let currentList: PassengerRideRequest[] = [];
    if (supabase) {
      currentList = await loadRequestsFromStorage(supabase);
    }
    if (currentList.length === 0 && globalThis._serverSharedRequests) {
      currentList = [...globalThis._serverSharedRequests];
    }

    if (Array.isArray(fullList)) {
      currentList = fullList;
    } else if (action === 'CREATE' && newReq) {
      currentList = [newReq, ...currentList.filter((r) => r.id !== newReq.id)];
    } else if (action === 'CANCEL' && requestId) {
      currentList = currentList.map((r) =>
        r.id === requestId ? { ...r, status: 'CANCELLED' as const } : r
      ).filter((r) => r.status !== 'CANCELLED');
    } else if (action === 'SUBMIT_OFFER' && requestId && offer) {
      currentList = currentList.map((r) => {
        if (r.id === requestId) {
          const filteredOffers = r.offers.filter((o) => o.id !== offer.id && o.driverId !== offer.driverId);
          return { ...r, offers: [offer, ...filteredOffers] };
        }
        return r;
      });
    } else if (action === 'ACCEPT_OFFER' && requestId && offerId) {
      currentList = currentList.map((r) => {
        if (r.id === requestId) {
          const updatedOffers = r.offers.map((o) =>
            o.id === offerId
              ? { ...o, status: 'ACCEPTED' as const }
              : { ...o, status: 'REJECTED' as const }
          );
          return { ...r, status: 'ACCEPTED' as const, offers: updatedOffers };
        }
        return r;
      });
    } else if (newReq) {
      currentList = [newReq, ...currentList.filter((r) => r.id !== newReq.id)];
    }

    // Save in global server memory cache
    globalThis._serverSharedRequests = currentList;

    if (supabase) {
      await saveRequestsToStorage(supabase, currentList);
    }

    return NextResponse.json(
      { success: true, requests: currentList },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update requests';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
