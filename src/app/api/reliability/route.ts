import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  evaluateUserReliability,
  createCancellationEvent,
  checkUserActionEligibility,
} from '@/lib/reliability-engine';
import type {
  CancellationCategory,
  EmergencyReasonCategory,
  CancellationEvent,
  CancellationAppeal,
} from '@/types/reliability';

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
  const userId = searchParams.get('userId');
  const role = (searchParams.get('role') as 'PASSENGER' | 'DRIVER') || 'PASSENGER';

  if (!userId) {
    return NextResponse.json({ error: 'userId query parameter is required.' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    // Return baseline profile if DB unconfigured
    const profile = evaluateUserReliability({
      userId,
      userRole: role,
      totalCompletedRides: 0,
      cancellationEvents: [],
    });
    return NextResponse.json({ profile });
  }

  try {
    const { data: events } = await supabase
      .from('cancellation_events')
      .select('*')
      .eq('user_id', userId);

    const { data: appeals } = await supabase
      .from('cancellation_appeals')
      .select('*')
      .eq('user_id', userId);

    const profile = evaluateUserReliability({
      userId,
      userRole: role,
      totalCompletedRides: 0,
      cancellationEvents: (events as unknown as CancellationEvent[]) || [],
      appeals: (appeals as unknown as CancellationAppeal[]) || [],
    });

    const eligibility = checkUserActionEligibility(profile);

    return NextResponse.json({ profile, eligibility });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to calculate reliability profile' },
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
      bookingId,
      rideId,
      userId,
      userRole,
      category,
      reason,
      departureTime,
      isEmergency,
      emergencyCategory,
    } = body;

    if (!userId || !rideId || !departureTime || !category) {
      return NextResponse.json(
        { error: 'Missing required cancellation event parameters.' },
        { status: 400 }
      );
    }

    const event = createCancellationEvent({
      id: `canc-${Date.now().toString().slice(-6)}`,
      bookingId,
      rideId,
      userId,
      userRole: (userRole as 'PASSENGER' | 'DRIVER') || 'PASSENGER',
      category: category as CancellationCategory,
      reason: reason || 'User cancellation',
      departureTime,
      isEmergency: Boolean(isEmergency),
      emergencyCategory: emergencyCategory as EmergencyReasonCategory | undefined,
    });

    // Insert audit record
    await supabase.from('cancellation_events').insert({
      id: event.id,
      booking_id: event.bookingId || null,
      ride_id: event.rideId,
      user_id: event.userId,
      user_role: event.userRole,
      category: event.category,
      reason: event.reason,
      departure_time: event.departureTime,
      cancelled_at: event.cancelledAt,
      hours_before_departure: event.hoursBeforeDeparture,
      timing_risk: event.timingRisk,
      is_emergency: event.isEmergency,
      emergency_category: event.emergencyCategory || null,
    });

    // Re-evaluate user reliability
    const { data: allUserEvents } = await supabase
      .from('cancellation_events')
      .select('*')
      .eq('user_id', userId);

    const { data: allUserAppeals } = await supabase
      .from('cancellation_appeals')
      .select('*')
      .eq('user_id', userId);

    const updatedProfile = evaluateUserReliability({
      userId,
      userRole: event.userRole,
      totalCompletedRides: 0,
      cancellationEvents: (allUserEvents as unknown as CancellationEvent[]) || [event],
      appeals: (allUserAppeals as unknown as CancellationAppeal[]) || [],
    });

    const eligibility = checkUserActionEligibility(updatedProfile);

    return NextResponse.json({
      event,
      profile: updatedProfile,
      eligibility,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record cancellation' },
      { status: 400 }
    );
  }
}
