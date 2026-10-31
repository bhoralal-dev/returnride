import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizePakistaniPhone } from '@/lib/phone';

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
    const { authMode, email, phone, password, fullName, role, city, vehicle } = body;

    if (!password) {
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    let targetEmail = '';
    let userPhone = '';
    let isPhoneAuth = false;

    if (authMode === 'PHONE' || (!email && phone)) {
      isPhoneAuth = true;
      const normalized = normalizePakistaniPhone(phone || '');
      if (!normalized.valid) {
        return NextResponse.json(
          { error: 'Please enter a valid Pakistani mobile number (e.g. 0333-1234567).' },
          { status: 400 }
        );
      }
      targetEmail = normalized.internalEmail;
      userPhone = normalized.formatted;
    } else {
      if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
      }
      targetEmail = email.trim().toLowerCase();
      userPhone = phone ? normalizePakistaniPhone(phone).formatted : '';
    }

    const cleanName = (fullName || (isPhoneAuth ? userPhone : targetEmail.split('@')[0])).trim();

    // 1. Prefer Admin API if SUPABASE_SECRET_KEY is present
    if (SUPABASE_SECRET_KEY) {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await adminClient.auth.admin.createUser({
        email: targetEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          phone: userPhone,
          auth_mode: isPhoneAuth ? 'PHONE' : 'EMAIL',
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
            {
              error: isPhoneAuth
                ? 'An account with this phone number already exists. Please Sign In.'
                : 'An account with this email already exists. Please Sign In.',
            },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        authIdentifier: targetEmail,
        user: {
          id: data.user.id,
          email: isPhoneAuth ? '' : data.user.email,
          fullName: cleanName,
          phone: userPhone,
          role: role === 'DRIVER' ? 'DRIVER' : 'PASSENGER',
          city: city || 'Karachi',
          vehicle: role === 'DRIVER' ? vehicle : undefined,
        },
      });
    }

    // 2. Client signUp fallback
    const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await publicClient.auth.signUp({
      email: targetEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          phone: userPhone,
          auth_mode: isPhoneAuth ? 'PHONE' : 'EMAIL',
          role: role === 'DRIVER' ? 'DRIVER' : 'PASSENGER',
          city: city || 'Karachi',
          vehicle: role === 'DRIVER' ? vehicle : undefined,
        },
      },
    });

    if (error) {
      if (
        error.message.toLowerCase().includes('already') ||
        error.message.toLowerCase().includes('registered')
      ) {
        return NextResponse.json(
          {
            error: isPhoneAuth
              ? 'An account with this phone number already exists. Please Sign In.'
              : 'An account with this email already exists. Please Sign In.',
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      authIdentifier: targetEmail,
      user: data.user,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error occurred during registration.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
