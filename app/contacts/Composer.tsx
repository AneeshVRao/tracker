'use client';

import { useState, useTransition } from 'react';
import { editContact } from '@/app/actions';
import type { EmailConfidence } from '@/lib/parse';
import { gmailComposeUrl, hasBlockers } from '@/lib/template';

type Props = {
  id: number; channel: 'email' | 'linkedin'; to: string | null; confidence: EmailConfidence | null; linkedinUrl: string | null;
  subject: string; body: string; firstEmail: boolean; canSaveMessage: boolean;
};

export function Composer(p: Props) {
  const [text, setText] = useState(p.body);
  const [override, setOverride] = useState(false);
  const [toast, setToast] = useState('');
  const [saving, start] = useTransition();
  const limit = p.channel === 'linkedin' ? 300 : null;
  const over = limit !== null && text.length > limit;
  const blocked = hasBlockers(text) || (over && !override);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const copy = async () => { await navigator.clipboard.writeText(text); flash('Copied'); };
  const open = async () => {
    if (p.channel === 'linkedin') { if (p.linkedinUrl) window.open(p.linkedinUrl, '_blank', 'noopener'); return; }
    if (!p.to) return;
    const { url, bodyCopied } = gmailComposeUrl(p.to, p.subject, text);
    if (bodyCopied) { await navigator.clipboard.writeText(text); flash('Body copied. Paste it into Gmail.'); }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-2">
      {p.channel === 'email' && !p.to && <p className="text-xs text-bad">No email address in the sheet.</p>}
      {p.channel === 'email' && p.confidence === 'inferred' && <p className="text-xs text-warn">Inferred email ({p.to}). Verify it before sending.</p>}
      {p.channel === 'linkedin' && !p.linkedinUrl && <p className="text-xs text-bad">No LinkedIn URL in the sheet.</p>}
      {p.firstEmail && <p className="text-xs text-muted">Attach your CV.</p>}
      {p.subject && <p><span className="text-muted">Subject </span>{p.subject}</p>}
      <textarea value={text} onChange={e => setText(e.target.value)} rows={p.channel === 'email' ? 14 : 6}
        className="input w-full font-mono text-[13px] leading-relaxed" aria-label="Message" />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={copy} disabled={blocked} className="btn-primary">Copy</button>
        <button onClick={open} disabled={p.channel === 'email' ? !p.to || blocked : !p.linkedinUrl} className="btn">
          {p.channel === 'email' ? 'Open in Gmail' : 'Open LinkedIn'}
        </button>
        {p.canSaveMessage && text !== p.body && (
          <button className="btn" disabled={saving} onClick={() => start(() => editContact(p.id, 'message', text))}>Save note</button>
        )}
        {limit !== null && <span className={`ml-auto tabular-nums ${over ? 'text-bad' : 'text-muted'}`}>{text.length}/{limit}</span>}
      </div>
      {over && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /> Copy anyway (LinkedIn cuts notes at 300)
        </label>
      )}
      {hasBlockers(text) && <p className="text-xs text-warn">Replace every [[…]] before copying.</p>}
      {toast && <p role="status" className="text-xs text-good">{toast}</p>}
    </div>
  );
}
