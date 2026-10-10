'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useArchive } from '@/lib/data/views';
import { useDeleteArchiveNote, useSaveArchiveNote } from '@/lib/data/mutations';
import { removePhotos, uploadPhotos } from '@/lib/data/photos';
import { dayNumber, localDay, type ArchiveEntry } from '@/lib/archive';
import { EntryCard, NODE, fill, useArchiveWords } from '@/components/archive';
import { PhotoPicker, PhotoViewer, type PhotoSlot } from '@/components/photos';
import { LoadError } from '@/components/ui';
import { Page } from '@/components/pixel/shell';
import {
  Button, EmptyState, ErrorNote, Field, Panel, PixelSpinner, SectionHeader, Sheet, Sprite, StatRow,
} from '@/components/pixel';
import type { ArchiveNote } from '@/types';

/**
 * The Archive (issue #4): the Republic's history, newest first, in chapters
 * by month. It writes itself from what happened — see lib/archive — and
 * curators add notes for the stories behind it.
 */

/** PostgREST rejects with a plain object; its message is the one worth showing. */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
}

const today = () => localDay(new Date().toISOString());

function entryKey(e: ArchiveEntry, i: number): string {
  switch (e.kind) {
    case 'note': return `note-${e.note.id}`;
    case 'founders': return `founders-${e.founders[0].id}`;
    case 'founding': return 'founding';
    case 'founder_milestone':
    case 'meeting_milestone': return `${e.kind}-${e.count}`;
    default: return `${e.kind}-${e.day}-${i}`;
  }
}

export default function ArchivePage() {
  const { ui } = useI18n();
  const { dateLabel, monthLabel, chapterLabel } = useArchiveWords();
  const { archive, people, isCurator, noteCount, meetingCount, loading, error } = useArchive();

  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<ArchiveNote | null>(null);
  const [removing, setRemoving] = useState<ArchiveNote | null>(null);
  const [photosOf, setPhotosOf] = useState<ArchiveNote | null>(null);

  // A short confirmation after a save; the page itself is the real proof.
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = (text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // "Today" is the reader's, so it is read after mount, not on the server.
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => setNow(today()), []);

  if (loading) {
    return <div className="grid place-items-center" style={{ minHeight: '50vh' }}><PixelSpinner size={20} color="var(--color-gold)" /></div>;
  }
  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  const nameOf = new Map(people.map((p) => [p.id, p.full_name]));
  const founders = people.filter((p) => p.is_active && p.founder_no !== null).length;
  const dayToday = now ? dayNumber(archive.founding, now) : null;

  return (
    <Page>
      <Panel pad={16}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <Sprite name="nav-constitution" size={28} />
          <span className="rof-label" style={{ color: 'var(--color-brown)' }}>{ui('archive.kicker')}</span>
        </div>
        <h1 style={{
          margin: '12px 0 0', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h2)',
          lineHeight: 1.4, letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--color-ink)',
        }}>
          {dayToday ? fill(ui('archive.day_of'), { n: dayToday }) : ui('archive.title')}
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--color-muted)' }}>
          {ui('archive.intro')}
        </p>
        {isCurator && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '2px dashed var(--color-line-soft)' }}>
            <Button tone="gold" size="lg" block onClick={() => setWriting(true)}>{ui('archive.write')}</Button>
            <p style={{ margin: '8px 0 0', fontSize: 'var(--text-small)', color: 'var(--color-muted)', textAlign: 'center' }}>
              {ui('archive.write_hint')}
            </p>
          </div>
        )}
      </Panel>

      {/* Outside the panel, as on Home: three labelled cells need the full width. */}
      <StatRow stats={[
        { icon: 'stat-friends', value: founders, label: ui('archive.stat_founders') },
        { icon: 'handshake', value: meetingCount, label: ui('archive.stat_meetings') },
        { icon: 'nav-journal', value: noteCount, label: ui('archive.stat_notes') },
      ]} />

      {archive.entries.length === 0 && <EmptyState title={ui('archive.empty')} />}

      {archive.chapters.map((chapter) => (
        <section key={chapter.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18 }}>
          <SectionHeader icon="nav-constitution"
            trailing={<span className="rof-label" style={{ color: 'var(--color-muted)', flex: 'none' }}>{chapterLabel(chapter)}</span>}>
            {monthLabel(chapter)}
          </SectionHeader>

          <div style={{ position: 'relative', paddingLeft: 22, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18 }}>
            <span aria-hidden style={{
              position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--color-gold)', opacity: 0.7,
            }} />
            {chapter.entries.map((entry, i) => (
              <article key={entryKey(entry, i)} style={{ position: 'relative', minWidth: 0 }}>
                <span aria-hidden style={{
                  position: 'absolute', left: -22, top: 2, width: 12, height: 12, boxSizing: 'border-box',
                  background: NODE[entry.kind], border: '2px solid var(--color-navy-900)',
                }} />
                <div className="rof-label" style={{ color: 'var(--color-muted)', fontSize: 11, marginBottom: 7 }}>
                  {dateLabel(entry.day, archive.founding)}
                </div>
                {entry.kind === 'note' ? (
                  <EntryCard
                    entry={entry}
                    author={entry.note.author_profile_id ? nameOf.get(entry.note.author_profile_id) : undefined}
                    canManage={isCurator}
                    onEdit={() => setEditing(entry.note)}
                    onRemove={() => setRemoving(entry.note)}
                    onPhotos={() => setPhotosOf(entry.note)}
                  />
                ) : (
                  <EntryCard entry={entry} />
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {archive.founding && (
        <p className="rof-label" style={{ margin: 0, textAlign: 'center', color: 'var(--color-muted)' }}>{ui('archive.the_beginning')}</p>
      )}

      {/* Keyed, so one note's draft can never leak into another's form. */}
      {(writing || editing) && (
        <NoteSheet key={editing?.id ?? 'new'} editing={editing}
          onClose={() => { setWriting(false); setEditing(null); }} onSaved={flash} />
      )}
      {removing && (
        <RemoveSheet key={removing.id} note={removing} onClose={() => setRemoving(null)} onRemoved={flash} />
      )}
      {photosOf && (
        <PhotoViewer key={photosOf.id} title={photosOf.title} images={photosOf.images} onClose={() => setPhotosOf(null)} />
      )}

      <div className={`rof-toast rof-label ${toast ? 'on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </Page>
  );
}

/* ------------------------------------------------------- write or correct */

function NoteSheet({
  editing, onClose, onSaved,
}: { editing: ArchiveNote | null; onClose: () => void; onSaved: (message: string) => void }) {
  const { ui } = useI18n();
  const save = useSaveArchiveNote();
  const max = today();

  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(editing?.happened_on ?? max);
  const [body, setBody] = useState(editing?.body ?? '');
  const [slots, setSlots] = useState<PhotoSlot[]>(() => (editing?.images ?? []).map((path) => ({ key: path, path })));
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Same guard as the Market's form: a sheet dismissed mid-save must not
  // close whichever sheet was opened after it.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Previews of photos picked but never saved are object URLs; free them.
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  useEffect(() => () => {
    slotsRef.current.forEach((s) => { if (s.fresh) URL.revokeObjectURL(s.fresh.preview); });
  }, []);

  const submit = async () => {
    if (!title.trim()) { setError(ui('archive.need_title')); return; }
    // The input's max only marks a later date invalid; it does not stop this
    // handler. And the database allows a day of slack for timezones, so a
    // date one day ahead would get through both. Checked here, against the
    // curator's own today. Both are YYYY-MM-DD, so they compare as strings.
    if (date > max) { setError(ui('archive.future_date')); return; }
    setBusy(true);
    setError('');
    // Uploaded first, then attached, exactly as a listing does it. If saving
    // the note fails, the uploads stay: a timeout may still have saved it.
    try {
      const uploaded = await uploadPhotos(slots.filter((s) => s.fresh).map((s) => s.fresh!));
      let next = 0;
      const images = slots.map((s) => s.path ?? uploaded[next++]);
      await save.mutateAsync({
        p_id: editing?.id ?? null,
        p_happened_on: date || max,
        p_title: title.trim(),
        p_body: body.trim(),
        p_images: images,
      });
      // Photos taken off the note go once it no longer points at them. A
      // colleague's files are theirs to delete, so those quietly stay.
      if (editing) removePhotos(editing.images.filter((p) => !images.includes(p))).catch(() => {});
      onSaved(ui(editing ? 'archive.saved' : 'archive.added'));
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current) setError(errText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Sheet
      title={ui(editing ? 'archive.edit_note' : 'archive.new_note')}
      onClose={onClose}
      footer={
        <Button tone="dark" size="lg" block onClick={submit} loading={busy} disabled={preparing}>
          {editing
            ? (busy ? ui('market.saving') : ui('market.save'))
            : (busy ? ui('archive.publishing') : ui('archive.publish'))}
        </Button>
      }
    >
      <Field label={ui('archive.note_title')}>
        <input className="rof-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          placeholder={ui('archive.note_title_placeholder')} />
      </Field>
      <Field label={ui('archive.note_date')} hint={ui('archive.note_date_hint')}>
        <input className="rof-input" type="date" value={date} max={max} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={ui('archive.note_body')}>
        <textarea className="rof-input" rows={5} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)}
          placeholder={ui('archive.note_body_placeholder')} style={{ resize: 'vertical', lineHeight: 1.55 }} />
      </Field>

      <PhotoPicker slots={slots} onChange={setSlots} onError={setError}
        preparing={preparing} setPreparing={setPreparing} saving={busy} />

      <div className="flex items-start" style={{
        gap: 10, padding: '10px 12px', background: 'var(--color-parchment)', border: '2px solid var(--color-brown)',
      }}>
        <Sprite name="nav-journal" size={18} />
        <span style={{ fontSize: 'var(--text-small)', lineHeight: 1.5, color: 'var(--color-ink-2)' }}>{ui('archive.note_public')}</span>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ remove */

function RemoveSheet({
  note, onClose, onRemoved,
}: { note: ArchiveNote; onClose: () => void; onRemoved: (message: string) => void }) {
  const { ui } = useI18n();
  const remove = useDeleteArchiveNote();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const images = (await remove.mutateAsync({ p_id: note.id })) as string[] | null;
      removePhotos(images ?? []).catch(() => {});
      onRemoved(ui('archive.removed'));
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current) setError(errText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Sheet
      title={ui('archive.remove_title')}
      onClose={onClose}
      footer={
        <div style={{ display: 'grid', gap: 10 }}>
          <Button tone="red" size="lg" block onClick={confirm} loading={busy}>
            {busy ? ui('archive.removing') : ui('archive.remove_confirm')}
          </Button>
          <Button tone="secondary" size="lg" block onClick={onClose} disabled={busy}>{ui('archive.keep')}</Button>
        </div>
      }
    >
      <p style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--color-ink-2)' }}>
        {fill(ui('archive.remove_body'), { title: note.title })}
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Sheet>
  );
}
