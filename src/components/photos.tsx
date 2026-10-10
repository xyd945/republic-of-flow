'use client';

import { useRef } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { usePhotoLinks } from '@/lib/data/photos';
import { preparePhoto, UnreadablePhotoError, type PreparedPhoto } from '@/lib/photos';
import { Bi, ErrorNote, PixelSpinner, Sheet } from '@/components/pixel';

/**
 * Photos on a listing or an Archive note: the cover on a card, the viewer it
 * opens, and the picker in the form. Shared so both behave the same — the
 * same three-photo limit, the same cover rule, the same resize before upload.
 */

export const MAX_PHOTOS = 3;

/** A photo inside the frame. Never `.pixel`: a photograph must stay smooth. */
export const photoStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

/**
 * The cover on a card — the first photo's thumbnail, the thing that makes
 * someone stop scrolling. Tapping it opens every photo.
 */
export function PhotoCover({
  images, label, onOpen, style,
}: { images: string[]; label: string; onOpen: () => void; style?: React.CSSProperties }) {
  const cover = images[0];
  const links = usePhotoLinks([cover], 'thumb');
  const src = links.data?.get(cover);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      style={{
        display: 'block', width: '100%', aspectRatio: '16 / 9', position: 'relative',
        padding: 0, margin: 0, cursor: 'pointer', overflow: 'hidden',
        border: '2px solid var(--color-navy-900)', borderRadius: 0, background: 'var(--color-mist-tint)',
        ...style,
      }}
    >
      {src ? <img src={src} alt="" style={photoStyle} /> : null}
      {images.length > 1 && (
        <span className="rof-label" style={{
          position: 'absolute', right: 6, bottom: 6, padding: '4px 6px',
          background: 'var(--color-navy-900)', color: 'var(--color-on-navy)',
        }}>1 / {images.length}</span>
      )}
    </button>
  );
}

/** Every photo on a listing, full size, one under another. */
export function PhotoViewer({ title, images, onClose }: { title: string; images: string[]; onClose: () => void }) {
  const { ui } = useI18n();
  const links = usePhotoLinks(images, 'full');
  return (
    <Sheet title={title} onClose={onClose}>
      {links.isPending ? (
        <div className="grid place-items-center" style={{ minHeight: 160 }}>
          <PixelSpinner size={20} color="var(--color-gold)" />
        </div>
      ) : links.error ? (
        <ErrorNote>{ui('market.photos_unavailable')}</ErrorNote>
      ) : (
        images.map((path) => {
          const src = links.data?.get(path);
          return src ? (
            <img key={path} src={src} alt="" style={{
              width: '100%', display: 'block', border: '2px solid var(--color-navy-900)',
            }} />
          ) : null;
        })
      )}
    </Sheet>
  );
}

/**
 * One slot in the form: a photo already on the listing (a storage path), or
 * one just picked on this phone and not uploaded until Save.
 */
export type PhotoSlot = { key: string; path?: string; fresh?: PreparedPhoto };

/** Up to three photos; the first is the cover, and any other can be made the cover. */
export function PhotoPicker({
  slots, onChange, onError, preparing, setPreparing, saving,
}: {
  slots: PhotoSlot[];
  onChange: React.Dispatch<React.SetStateAction<PhotoSlot[]>>;
  onError: (message: string) => void;
  /** Held by the form, so Save waits for photos that are still being shrunk. */
  preparing: boolean;
  setPreparing: (on: boolean) => void;
  /** While the form is saving, the photos are fixed: the save already has its list. */
  saving: boolean;
}) {
  const { ui } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const stored = slots.filter((s) => s.path).map((s) => s.path!);
  const links = usePhotoLinks(stored, 'thumb');

  const pick = async (files: FileList | null) => {
    const room = MAX_PHOTOS - slots.length;
    const chosen = Array.from(files ?? []).slice(0, room);
    if (input.current) input.current.value = '';   // picking the same file again still fires
    if (!chosen.length) return;
    setPreparing(true);
    onError('');
    const added: PhotoSlot[] = [];
    for (const file of chosen) {
      try {
        const fresh = await preparePhoto(file);
        added.push({ key: fresh.preview, fresh });
      } catch (e) {
        onError(e instanceof UnreadablePhotoError ? ui('market.photo_unreadable') : (e instanceof Error ? e.message : String(e)));
      }
    }
    setPreparing(false);
    // Onto the slots as they are now: a removal or a new cover made while
    // these were being shrunk must not be undone.
    if (added.length) onChange((now) => [...now, ...added]);
  };

  const remove = (i: number) => {
    const gone = slots[i];
    if (gone.fresh) URL.revokeObjectURL(gone.fresh.preview);
    onChange(slots.filter((_, j) => j !== i));
  };
  const makeCover = (i: number) => onChange([slots[i], ...slots.filter((_, j) => j !== i)]);

  const corner: React.CSSProperties = {
    position: 'absolute', padding: '3px 5px', border: 'none', borderRadius: 0, cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ marginBottom: 6 }}><Bi en={ui('market.photos')} zh="照片" color="var(--color-gold)" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {slots.map((slot, i) => {
          const src = slot.fresh ? slot.fresh.preview : links.data?.get(slot.path!);
          return (
            <div key={slot.key} style={{
              position: 'relative', aspectRatio: '1 / 1', overflow: 'hidden',
              border: '2px solid var(--color-navy-900)', background: 'var(--color-mist-tint)',
            }}>
              {src ? <img src={src} alt="" style={photoStyle} /> : null}
              {i === 0 ? (
                <span className="rof-label" style={{
                  ...corner, left: 0, bottom: 0, cursor: 'default',
                  background: 'var(--color-gold)', color: 'var(--color-navy-900)',
                }}>{ui('market.cover')}</span>
              ) : (
                <button type="button" className="rof-label" onClick={() => makeCover(i)} disabled={saving} style={{
                  ...corner, left: 0, bottom: 0,
                  background: 'var(--color-navy-900)', color: 'var(--color-on-navy)',
                }}>{ui('market.make_cover')}</button>
              )}
              <button type="button" onClick={() => remove(i)} disabled={saving} aria-label={ui('market.remove_photo')} style={{
                ...corner, right: 0, top: 0, minWidth: 28, minHeight: 28, lineHeight: 1,
                background: 'var(--color-navy-900)', color: 'var(--color-on-navy)', fontSize: 'var(--text-h3)',
              }}>×</button>
            </div>
          );
        })}
        {slots.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={preparing || saving}
            className="rof-label"
            style={{
              aspectRatio: '1 / 1', border: '2px dashed var(--color-line-soft)', borderRadius: 0,
              background: 'var(--color-white)', color: 'var(--color-muted)',
              cursor: preparing ? 'wait' : 'pointer', padding: 6, lineHeight: 1.3,
            }}
          >{preparing ? ui('market.preparing') : `+ ${ui('market.add_photo')}`}</button>
        )}
      </div>
      {/* Visually hidden rather than display:none, which some mobile browsers
          will not open from a script. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => pick(e.target.files)}
        tabIndex={-1}
        aria-hidden
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 6 }}>
        {ui('market.photos_hint')}
      </div>
    </div>
  );
}

