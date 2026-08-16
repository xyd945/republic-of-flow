import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Invites a new member. Inviting requires the Supabase secret key, which must
 * never reach the browser — so curator status is re-checked here against the
 * caller's own session rather than trusted from the client.
 */
export async function POST(request: Request) {
  const { email, note } = await request.json().catch(() => ({}));

  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_curator')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.is_curator) {
    return NextResponse.json({ error: 'Curators only.' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return NextResponse.json({ error: 'Server is missing Supabase credentials.' }, { status: 500 });
  }

  const res = await fetch(`${url}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      data: note ? { invite_note: note } : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: body.msg ?? body.error_description ?? 'Invitation failed.' },
      { status: res.status },
    );
  }

  return NextResponse.json({ ok: true });
}
