/**
 * Getting a phone photo ready to upload.
 *
 * A photo straight off an iPhone is 3–12 MB. Each one is redrawn here into a
 * ~1600px main image and a ~720px thumbnail, both JPEG, before anything leaves
 * the phone: a few hundred KB instead of several MB on classroom Wi-Fi, and the
 * Market only ever downloads the thumbnail. Supabase can resize on the fly, but
 * only on paid plans.
 *
 * Decoded through an <img> rather than createImageBitmap, because an <img>
 * honours the EXIF orientation everywhere — a portrait shot does not arrive
 * sideways — and iOS Safari can decode HEIC that way.
 */

export type PreparedPhoto = {
  full: Blob;
  thumb: Blob;
  /** An object URL of the thumbnail, for the form's preview. Revoke when done. */
  preview: string;
};

const FULL_EDGE = 1600;
const THUMB_EDGE = 720;
const QUALITY = 0.82;

/** Thrown when the browser cannot decode the file at all. */
export class UnreadablePhotoError extends Error {}

function decode(file: File): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UnreadablePhotoError(file.name));
    };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, edge: number): Promise<Blob> {
  const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('canvas unavailable'));
  // JPEG has no transparency: a transparent PNG would otherwise turn black.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode the photo'))), 'image/jpeg', QUALITY),
  );
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const { img, release } = await decode(file);
  try {
    const [full, thumb] = await Promise.all([encode(img, FULL_EDGE), encode(img, THUMB_EDGE)]);
    return { full, thumb, preview: URL.createObjectURL(thumb) };
  } finally {
    release();
  }
}
