import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /* The manifest and icons must stay reachable without a session. iOS
       fetches the manifest unauthenticated the moment someone taps "Add to
       Home Screen", and a redirect to /login there means it silently falls
       back to a screenshot of the page as the app icon. Images were already
       excluded by extension; .webmanifest and .ico were not. */
    '/((?!_next/static|_next/image|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
