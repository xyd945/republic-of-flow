'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PreparedPhoto } from '@/lib/photos';

/**
 * Listing photos in Supabase Storage — see migration 00014 for the rules.
 *
 *   listing-images/<user id>/<uuid>.jpg      the photo
 *   listing-images/<user id>/<uuid>_t.jpg    its thumbnail
 *
 * Only the main path is stored on the listing; the thumbnail is found by
 * name. The bucket is private, so every image is shown through a signed link
 * that works for an hour.
 */

const BUCKET = 'listing-images';
/** How long a signed link lives, and how long we reuse one before asking again. */
const LINK_SECONDS = 3600;
const LINK_REUSE_MS = 50 * 60 * 1000;
/** Per file. Uploads cannot be aborted in this client, so this is a race. */
const UPLOAD_MS = 30_000;

export const thumbOf = (path: string) => path.replace(/\.jpg$/, '_t.jpg');

/**
 * A v4 UUID without crypto.randomUUID, which exists only on HTTPS and
 * localhost. Testing on a phone over the LAN is plain HTTP, and the database
 * insists on the UUID shape.
 */
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The upload timed out. Check your connection and try again.')), ms);
  });
  return Promise.race([work, giveUp]).finally(() => clearTimeout(timer));
}

/** Deletes photos and their thumbnails. Best effort: a leftover file is harmless. */
export async function removePhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await createClient().storage.from(BUCKET).remove(paths.flatMap((p) => [p, thumbOf(p)]));
}

/**
 * Uploads each photo and its thumbnail into the member's own folder and
 * returns the photo paths, in order. If any upload fails, the error is
 * passed on at once and whatever already landed is removed behind it.
 */
export async function uploadPhotos(photos: PreparedPhoto[]): Promise<string[]> {
  if (!photos.length) return [];
  const client = createClient();
  const { data } = await client.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error('You are not signed in.');

  const storage = client.storage.from(BUCKET);
  const options = { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' };
  const done: string[] = [];
  try {
    for (const photo of photos) {
      const path = `${me}/${uuid()}.jpg`;
      done.push(path);
      const main = await bounded(storage.upload(path, photo.full, options), UPLOAD_MS);
      if (main.error) throw main.error;
      const thumb = await bounded(storage.upload(thumbOf(path), photo.thumb, options), UPLOAD_MS);
      if (thumb.error) throw thumb.error;
    }
    return done;
  } catch (e) {
    // Not awaited: on the connection that just timed out, the cleanup can
    // stall too, and the form would then wait on it forever.
    removePhotos(done).catch(() => {});
    throw e;
  }
}

/**
 * Signed links for a set of photos, keyed by the path asked for. Cached a
 * little under the link's lifetime, so scrolling back up the Market does not
 * sign the same thumbnails again.
 */
export function usePhotoLinks(paths: string[], size: 'thumb' | 'full') {
  const wanted = size === 'thumb' ? paths.map(thumbOf) : paths;
  return useQuery({
    queryKey: ['photo-links', ...wanted],
    enabled: wanted.length > 0,
    staleTime: LINK_REUSE_MS,
    gcTime: LINK_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await createClient().storage.from(BUCKET).createSignedUrls(wanted, LINK_SECONDS);
      if (error) throw error;
      // Matched by path, not by position: nothing promises the order.
      const signed = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl] as const));
      const byRequested = new Map<string, string>();
      paths.forEach((p, i) => {
        const url = signed.get(wanted[i]);
        if (url) byRequested.set(p, url);
      });
      return byRequested;
    },
  });
}
