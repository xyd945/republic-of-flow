import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Seconds of remaining validity below which we bother refreshing the session. */
const REFRESH_WINDOW = 120;

/**
 * Reads `exp` out of the session cookie without a network call.
 *
 * Returns the seconds of validity left, or null when there is no readable
 * token. This is deliberately NOT a signature check — see updateSession.
 */
function secondsLeftOnSession(request: NextRequest): number | null {
  const parts = request.cookies
    .getAll()
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length === 0) return null;

  try {
    let raw = parts.map((c) => c.value).join('');
    if (raw.startsWith('base64-')) raw = atob(raw.slice(7));
    const accessToken = JSON.parse(raw).access_token as string | undefined;
    if (!accessToken) return null;

    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return null;
    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes('YOUR_PROJECT') || key.startsWith('YOUR_')) {
    // NEXT_PUBLIC_* values are inlined at build time. A CI build without them
    // would otherwise sail past every auth check below and serve the whole app
    // publicly, so in production this fails closed and loudly instead.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(
        'Server is not configured: NEXT_PUBLIC_SUPABASE_URL and ' +
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set at build time.',
        { status: 503, headers: { 'content-type': 'text/plain' } },
      );
    }
    // Locally, stay permissive so the app still boots before Supabase is wired.
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/api/auth');

  const reject = () => {
    // API routes answer in JSON — redirecting them to /login hands the
    // caller an HTML page that res.json() cannot parse.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  };

  const secondsLeft = secondsLeftOnSession(request);

  // No session cookie at all: decide without touching the network.
  if (secondsLeft === null) {
    return isPublic ? supabaseResponse : reject();
  }

  // A live, unexpired session: skip the ~300ms round trip that getUser() costs
  // on every single navigation. This gate only decides whether to show the app
  // shell or redirect to /login — it is not the security boundary. Every read
  // and write is authorised by RLS in Postgres, which verifies the JWT
  // signature itself, so a forged or revoked token still reads nothing.
  if (secondsLeft > REFRESH_WINDOW) {
    return supabaseResponse;
  }

  // Expiring or expired: let Supabase verify and rotate the tokens.
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Record<string, string>),
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user && !isPublic) return reject();
  } catch (e) {
    console.error('Middleware error:', e);
  }

  return supabaseResponse;
}
