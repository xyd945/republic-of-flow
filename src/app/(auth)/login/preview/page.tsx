'use client';

/* TEMPORARY — a gallery of every pixel primitive, so the port can be compared
   against the design system side by side without an authenticated session.
   Delete once the comparison is done. */

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/context';
import {
  Avatar, Bi, Button, Divider, EmptyState, ErrorNote, Field, Panel, ParchmentNote,
  PixelSpinner, Ribbon, SecAction, SectionHeader, Sheet, StatRow, StatusChip,
} from '@/components/pixel';
import { LangSwitch, StatusStrip, TabBar, TopBar } from '@/components/pixel/shell';

export default function PreviewPage() {
  const { lang, setLang } = useI18n();
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState('/people');

  return (
    <div className="rof-frame">
      <div className="rof-phone">
        <div className="rof-screen">
          <StatusStrip />
          <TopBar title="Founder Directory" cn="创始人名录" onBack={() => {}}
            right={<LangSwitch lang={lang} onChange={setLang} />} />

          <main data-scroll-region className="flex-1 overflow-y-auto no-scrollbar"
            style={{ padding: '16px 14px 24px', display: 'grid', gap: 18 }}>

            <SectionHeader icon="nav-discover" cn="统计">Stat Row</SectionHeader>
            <StatRow stats={[
              { icon: 'stat-friends', value: 116, label: 'Founders', cn: '创始人' },
              { icon: 'stat-worlds', value: 33, label: 'Worlds', cn: '隐藏世界' },
              { icon: 'handshake', value: 10, label: 'Open', cn: '进行中' },
            ]} />

            <Ribbon cn="一个共和国，无限连接">One Republic, Infinite Connections</Ribbon>

            <ParchmentNote title="Reality First" cn="现实优先">
              Match, then disappear. When reality is easier, the Republic gets out of the way.
            </ParchmentNote>

            <SectionHeader icon="star" cn="按钮" trailing={<SecAction en="All" zh="全部" onClick={() => {}} />}>
              Buttons
            </SectionHeader>
            <Panel pad={14}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Button tone="primary" size="lg" cn="主要">Primary LG</Button>
                <Button tone="dark" size="md" cn="深色">Dark MD</Button>
                <Button tone="gold" size="sm" cn="金色">Gold SM</Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <Button tone="secondary" size="md">Secondary</Button>
                <Button tone="green" size="md">Green</Button>
                <Button tone="red" size="md">Red</Button>
                <Button tone="tertiary" size="md" disabled>Disabled</Button>
              </div>
              <div style={{ marginTop: 10 }}>
                <Button tone="primary" size="lg" block loading>Loading</Button>
              </div>
            </Panel>

            <SectionHeader cn="状态">Status Chips</SectionHeader>
            <Panel pad={14}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['open', 'active', 'matched', 'closed', 'completed', 'hot', 'wanted', 'offer', 'neutral'] as const)
                  .map((t) => <StatusChip key={t} tone={t}>{t}</StatusChip>)}
              </div>
            </Panel>

            <SectionHeader cn="面板">Panels</SectionHeader>
            <Panel pad={14} corners><Bi en="Cream, corners" zh="米色，带角标" /></Panel>
            <Panel pad={14} tone="gold"><Bi en="Gold" zh="金色" color="var(--color-navy-900)" /></Panel>
            <Panel pad={14} tone="navy"><Bi en="Navy" zh="深蓝" color="var(--color-gold)" /></Panel>
            <Panel pad={14} tone="warm" innerRule={false}><Bi en="Warm, no inner rule" zh="暖色，无内框" /></Panel>

            <SectionHeader cn="排版">Type Scale</SectionHeader>
            <Panel pad={14}>
              {(['hero', 'h1', 'h2', 'h3', 'body', 'small'] as const).map((k) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: `var(--text-${k})`, color: 'var(--color-ink)',
                  }}>Aa {k}</span>
                </div>
              ))}
              <Divider className="my-3" />
              <p style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--color-muted)' }}>
                Body copy at 14px. Someone here knows something you would never guess.
              </p>
            </Panel>

            <SectionHeader cn="表单">Form</SectionHeader>
            <Panel pad={14}>
              <div style={{ display: 'grid', gap: 12 }}>
                <Field label="Full name" cn="姓名">
                  <input className="rof-input" defaultValue="Yudi" />
                </Field>
                <Field label="Headline" cn="一句话" hint="Shown under your name">
                  <input className="rof-input" placeholder="digital nomad" />
                </Field>
                <ErrorNote>Something went wrong and this is the message.</ErrorNote>
              </div>
            </Panel>

            <SectionHeader cn="其他">Misc</SectionHeader>
            <Panel pad={14}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Avatar initials="YU" id="a" size={44} />
                <Avatar initials="MV" id="b" size={44} featured />
                <PixelSpinner size={18} color="var(--color-gold)" />
                <Button tone="secondary" size="sm" onClick={() => setSheet(true)}>Open sheet</Button>
              </div>
            </Panel>
            <EmptyState title="Nothing here yet" cn="还没有内容" body="Try a broader word." />
          </main>

          <TabBar active={tab} onChange={setTab} />
          {sheet && (
            <Sheet title="New listing" cn="新条目" onClose={() => setSheet(false)}
              footer={<Button tone="dark" size="lg" block onClick={() => setSheet(false)}>Publish</Button>}>
              <Field label="Title" cn="标题"><input className="rof-input" /></Field>
              <Field label="Description" cn="描述"><textarea className="rof-input" rows={3} /></Field>
            </Sheet>
          )}
        </div>
      </div>
    </div>
  );
}
