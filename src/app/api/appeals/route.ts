import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { submitEmergencyAppeal } from '@/lib/reliability-engine';
import type { EmergencyReasonCategory } from '@/types/reliability';

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
    const { cancellationEventId, userId, emergencyCategory, statement } = body;

    if (!cancellationEventId || !userId || !emergencyCategory || !statement) {
      return NextResponse.json(
        { error: 'Missing required appeal parameters.' },
        { status: 400 }
      );
    }

    const appeal = submitEmergencyAppeal({
      id: `appeal-${Date.now().toString().slice(-6)}`,
      cancellationEventId,
      userId,
      emergencyCategory: emergencyCategory as EmergencyReasonCategory,
      statement,
    });

    const { data, error } = await supabase
      .from('cancellation_appeals')
      .insert({
        id: appeal.id,
        cancellation_event_id: appeal.cancellationEventId,
        user_id: appeal.userId,
        emergency_category: appeal.emergencyCategory,
        statement: appeal.statement,
        status: appeal.status,
        submitted_at: appeal.submittedAt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ appeal: data }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid appeal request' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ appeals: [] });
  }

  try {
    let query = supabase.from('cancellation_appeals').select('*').order('submitted_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ appeals: data || [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch appeals' },
      { status: 500 }
    );
  }
}
