'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { LangSwitch, StatusStrip } from '@/components/pixel/shell';
import { Bi, Button, ErrorNote, Panel, Sprite } from '@/components/pixel';

/** Long enough for a slow phone on classroom wifi, short enough that nobody
    watches a spinner wondering whether their code worked. */
const CLAIM_MS = 4000;

export default function LoginPage() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { lang, setLang, ui } = useI18n();

  const sendCode = async () => {
    const v = email.trim().toLowerCase();
    if (!v || !v.includes('@')) {
      setError(ui('auth.valid_email'));
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({ email: v });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStep('code');
  };

  const verifyCode = async () => {
    if (code.length !== 6) {
      setError(ui('auth.enter_code'));
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'email',
    });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    /* The founder number is handed out here, on the first real sign-in, rather
       than when the invitation was sent — otherwise an invitation nobody
       accepts takes a number with it. Idempotent, so every later login is a
       no-op.

       Bounded, and the result is ignored. By this line the member is already
       authenticated: an optional call must not be able to hold the door shut,
       and a stalled fetch never rejects on its own, so without the abort the
       button would sit on "Verifying..." forever with the session already in
       hand. Whatever is left undone, the app shell picks up on load. */
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    /* Raced, not merely aborted. abortSignal() reaches the fetch, but the
       client resolves the session before there is a fetch to abort — so a
       stall in there would leave the await hanging with the signal pointed at
       nothing. The race is what actually bounds this; the abort is what stops
       an orphaned request. */
    const giveUp = new Promise<void>((resolve) => {
      timer = setTimeout(() => { ctrl.abort(); resolve(); }, CLAIM_MS);
    });
    try {
      await Promise.race([
        supabase.rpc('claim_membership').abortSignal(ctrl.signal).then(() => {}, () => {}),
        giveUp,
      ]);
    } finally {
      clearTimeout(timer);
    }
    setLoading(false);
    window.location.href = '/';
  };

  return (
    <div className="rof-frame">
      <div className="rof-phone">
        <div className="rof-screen">
          <StatusStrip />

          {/* The crest, on the Republic's own navy. This is the one screen with
              room for the logo at a size where its pixels actually read. */}
          <div style={{
            background: 'var(--color-navy-900)', borderBottom: '3px solid var(--color-gold)',
            padding: '22px 18px 20px', textAlign: 'center', position: 'relative', flex: 'none',
          }}>
            <div style={{ position: 'absolute', top: 10, right: 12 }}>
              <LangSwitch lang={lang} onChange={setLang} />
            </div>
            {/* The real mark, on the navy-ground master so it sits flush on the
                masthead rather than on a white tile. This was a drawn stand-in
                while the brand mark could not be fetched whole. */}
            <Sprite name="logo-flat" kind="logo" size={92} alt="" className="mx-auto" />
            {/* Two lines on purpose: one line of this at h2 with display
                tracking is wider than a 375px screen, and the frame clips it. */}
            <h1 style={{
              margin: '14px 0 0',
              fontFamily: lang === 'zh' ? 'var(--font-cjk)' : 'var(--font-display)', fontWeight: 700,
              fontSize: 'var(--text-h1)',
              letterSpacing: lang === 'zh' ? 0 : 'var(--tracking-display)',
              textTransform: lang === 'zh' ? 'none' : 'uppercase',
              color: 'var(--color-gold)', lineHeight: 1.35,
            }}>{lang === 'zh' ? '心流共和国' : <>Republic<br />of Flow</>}</h1>
            <p style={{
              margin: '10px auto 0', maxWidth: 280, fontSize: 'var(--text-small)',
              color: 'rgba(245,237,216,0.72)', lineHeight: 1.6,
            }}>{ui('auth.republic_desc')}</p>
          </div>

          <main data-scroll-region className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column' }}>
            {step === 'email' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
                <div>
                  <Bi en={ui('auth.invitation_only')} zh="仅限受邀" color="var(--color-gold)" />
                  <p style={{ margin: '9px 0 0', fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.65 }}>
                    {ui('auth.members_desc')}
                  </p>
                </div>

                <label style={{ display: 'block' }}>
                  <div style={{ marginBottom: 6 }}><Bi en={ui('auth.email')} zh="邮箱" color="var(--color-gold)" /></div>
                  <input
                    className="rof-input"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendCode(); } }}
                    placeholder="you@school.edu"
                    autoComplete="email"
                  />
                </label>

                {error ? <ErrorNote>{error}</ErrorNote> : null}

                <Button tone="dark" size="lg" block onClick={sendCode} loading={loading} disabled={loading}>
                  {loading ? ui('auth.sending') : ui('auth.send_code')}
                </Button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
                <Panel pad={14} tone="gold" corners>
                  <div className="text-center">
                    <Bi en={ui('auth.check_email')} zh="查收邮件" color="var(--color-navy-900)" />
                    <p style={{ margin: '9px 0 0', fontSize: 'var(--text-body)', color: 'var(--color-ink-2)', lineHeight: 1.6 }}>
                      {ui('auth.code_sent')}{' '}
                      <strong style={{ color: 'var(--color-ink)', wordBreak: 'break-all' }}>{email}</strong>{' '}
                      {ui('auth.code_expires')}
                    </p>
                  </div>
                </Panel>

                <label style={{ display: 'block' }}>
                  <div style={{ marginBottom: 6 }}><Bi en={ui('auth.verification_code')} zh="验证码" color="var(--color-gold)" /></div>
                  {/* A fixed 16px, not a scaled one: the display face is a
                      bitmap and any fractional size puts it off the pixel grid. */}
                  <input
                    className="rof-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(); } }}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    style={{
                      textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700,
                      fontSize: 16, letterSpacing: '0.34em', textIndent: '0.34em',
                    }}
                  />
                </label>

                {error ? <ErrorNote>{error}</ErrorNote> : null}

                <Button tone="gold" size="lg" block onClick={verifyCode} loading={loading} disabled={loading}>
                  {loading ? ui('auth.verifying') : ui('auth.verify')}
                </Button>

                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError(''); }}
                  className="rof-label"
                  style={{
                    background: 'transparent', border: 'none', borderRadius: 0, cursor: 'pointer',
                    color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3,
                    justifySelf: 'center', padding: 4,
                  }}
                >{ui('auth.different_email')}</button>
              </div>
            )}

            {/* Pushed to the foot of the scroll region, and allowed to fold:
                the tagline is a sentence, not a label. */}
            <div className="text-center" style={{ marginTop: 'auto', paddingTop: 26 }}>
              <Bi en={ui('auth.tagline')} color="var(--color-faint)" wrap />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
