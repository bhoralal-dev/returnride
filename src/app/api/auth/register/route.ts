import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yefaqlrczrbdumjuramb.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_CjVkh6EEMX_y9jM7ryBdEA_QjHBYLK2';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, fullName, phone, role, city, vehicle } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (fullName || cleanEmail.split('@')[0]).trim();
    const cleanPhone = (phone || '').trim();

    // 1. Prefer Admin API to instantly create and confirm account without email rate limits
    if (SUPABASE_SECRET_KEY) {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          phone: cleanPhone,
          role: role === 'DRIVER' ? 'DRIVER' : 'PASSENGER',
          city: city || 'Karachi',
          vehicle: role === 'DRIVER' ? vehicle : undefined,
        },
      });

      if (error) {
        if (
          error.message.toLowerCase().includes('already') ||
          error.message.toLowerCase().includes('registered') ||
          error.message.toLowerCase().includes('exists')
        ) {
          return NextResponse.json(
            { error: 'An account with this email already exists. Please Sign In.' },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: cleanName,
          phone: cleanPhone,
          role: role === 'DRIVER' ? 'DRIVER' : 'PASSENGER',
          city: city || 'Karachi',
          vehicle: role === 'DRIVER' ? vehicle : undefined,
        },
      });
    }

    // 2. Direct client signUp fallback
    const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await publicClient.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          phone: cleanPhone,
          role: role === 'DRIVER' ? 'DRIVER' : 'PASSENGER',
          city: city || 'Karachi',
          vehicle: role === 'DRIVER' ? vehicle : undefined,
        },
      },
    });

    if (error) {
      if (
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('over_email_send_rate_limit')
      ) {
        return NextResponse.json(
          {
            error:
              'Supabase email confirmation rate limit reached (max 3 emails/hour on free tier). To fix: In your Supabase Dashboard, go to Authentication > Providers > Email and toggle "Confirm email" OFF.',
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: data.user,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error occurred during registration.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
