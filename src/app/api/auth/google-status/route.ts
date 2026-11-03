import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yefaqlrczrbdumjuramb.supabase.co';
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/authorize?provider=google`, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
    });

    const isEnabled = res.status === 302 || res.status === 303 || res.status === 200;
    return NextResponse.json({
      enabled: isEnabled,
      status: res.status,
      supabaseUrl,
      callbackUrl: `${supabaseUrl}/auth/v1/callback`,
    });
  } catch (err: unknown) {
    return NextResponse.json({ enabled: false, error: String(err) }, { status: 500 });
  }
}
