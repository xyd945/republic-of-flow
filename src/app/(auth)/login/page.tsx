'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { WaxSeal, Wordmark, Button, Icon, LanguageSwitcher } from '@/components/ui';
import { useI18n } from '@/lib/i18n/context';
import { LANGUAGES } from '@/lib/i18n/translations';

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
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-surface-page)', backgroundImage: 'radial-gradient(circle at 15% 4%, rgba(143,112,68,0.10), transparent 22%), linear-gradient(180deg, #f9f3e8 0%, #eee2cd 100%)' }}>
      <div className="w-full max-w-[430px] min-h-screen flex flex-col" style={{ background: 'rgba(255,253,248,0.78)' }}>
        {/* Crest header */}
        <div className="pt-[52px] px-[26px] pb-6 text-center">
          <div className="flex justify-end mb-2">
            <LanguageSwitcher languages={LANGUAGES} value={lang} onChange={setLang} />
          </div>
          <WaxSeal size={72} label="R" className="mx-auto mb-5" />
          <Wordmark size="lg" align="center" subtitle={ui('auth.republic_desc')} />
        </div>

        <div className="flex-1 px-[26px] pb-[26px] flex flex-col">
          <div className="border-t border-line pt-[22px]">
            {step === 'email' ? (
              <>
                <div className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze mb-[10px]">
                  {ui('auth.invitation_only')}
                </div>
                <p className="font-serif text-sm leading-[1.6] text-muted mb-[22px]">
                  {ui('auth.members_desc')}
                </p>

                <label className="block">
                  <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">
                    {ui('auth.email')}
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                    placeholder="you@school.edu"
                    autoComplete="email"
                    className="parch-input"
                  />
                </label>

                {error && (
                  <div className="mt-[9px] flex items-center gap-[7px] font-serif text-xs text-red">
                    <Icon name="x" size={14} color="var(--color-red)" />{error}
                  </div>
                )}

                <div className="mt-5">
                  <Button tone="ink" onClick={sendCode} disabled={loading} icon={<Icon name="arrow-right" size={15} color="#fff" />}>
                    {loading ? ui('auth.sending') : ui('auth.send_code')}
                  </Button>
                </div>

              </>
            ) : (
              <div className="text-center pt-2">
                <div className="w-[58px] h-[58px] mx-auto mb-[18px] rounded-full grid place-items-center bg-green-wash" style={{ border: '1px solid rgba(70,90,73,0.3)' }}>
                  <Icon name="check" size={24} color="var(--color-green)" />
                </div>
                <h3 className="font-serif font-semibold text-2xl text-ink mb-2">{ui('auth.check_email')}</h3>
                <p className="font-serif text-sm leading-[1.6] text-muted max-w-[280px] mx-auto mb-4">
                  {ui('auth.code_sent')} <strong className="text-ink">{email}</strong> {ui('auth.code_expires')}
                </p>

                <label className="block text-left mb-4">
                  <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">
                    {ui('auth.verification_code')}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    className="parch-input text-center text-2xl tracking-[0.3em] font-serif"
                  />
                </label>

                {error && (
                  <div className="mb-3 flex items-center justify-center gap-[7px] font-serif text-xs text-red">
                    <Icon name="x" size={14} color="var(--color-red)" />{error}
                  </div>
                )}

                <Button tone="bronze" onClick={verifyCode} disabled={loading} icon={<Icon name="arrow-right" size={15} color="var(--color-dark)" />}>
                  {loading ? ui('auth.verifying') : ui('auth.verify')}
                </Button>

                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError(''); }}
                  className="mt-4 border-none bg-transparent cursor-pointer font-serif text-xs text-muted underline underline-offset-[3px]"
                >
                  {ui('auth.different_email')}
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto pt-[26px] text-center font-serif italic text-xs text-faint leading-[1.6]">
            {ui('auth.tagline')}
          </div>
        </div>
      </div>
    </div>
  );
}
