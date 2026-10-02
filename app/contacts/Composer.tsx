'use client';

import { useState, useTransition } from 'react';
import { editContact } from '@/app/actions';
import type { EmailConfidence } from '@/lib/parse';
import { PRESEND_CHECKS, gmailComposeUrl, hasBlockers } from '@/lib/template';

type Props = {
  id: number; channel: 'email' | 'linkedin'; to: string | null; confidence: EmailConfidence | null; linkedinUrl: string | null;
  subject: string; body: string; firstEmail: boolean; canSaveMessage: boolean;
};

export function Composer(p: Props) {
  const [text, setText] = useState(p.body);
  const [override, setOverride] = useState(false);
  const [toast, setToast] = useState('');
  const [saving, start] = useTransition();
  const [saveError, setSaveError] = useState('');
  const limit = p.channel === 'linkedin' ? 300 : null;
  const over = limit !== null && text.length > limit;
  const gated = p.channel === 'email' && p.firstEmail;
  const [checked, setChecked] = useState<boolean[]>(() => PRESEND_CHECKS.map(() => false));
  const unchecked = gated && checked.includes(false);
  const blocked = hasBlockers(text) || hasBlockers(p.subject) || (over && !override) || unchecked;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const write = async () => {
    try { await navigator.clipboard.writeText(text); return true; } catch { flash("Couldn't copy — select the text and copy manually"); return false; }
  };
  const copy = async () => { if (await write()) flash('Copied'); };
  const open = async () => {
    if (p.channel === 'linkedin') { if (p.linkedinUrl) window.open(p.linkedinUrl, '_blank', 'noopener'); return; }
    if (!p.to) return;
    const { url, bodyCopied } = gmailComposeUrl(p.to, p.subject, text);
    if (bodyCopied && (await write())) flash('Body copied. Paste it into Gmail.');
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-2 rounded-lg bg-sunken/70 p-3">
      {p.channel === 'email' && !p.to && <p className="text-xs text-bad">No email address in the sheet.</p>}
      {p.channel === 'email' && p.confidence === 'inferred' && <p className="text-xs text-warn">Inferred email ({p.to}). Verify it before sending.</p>}
      {p.channel === 'linkedin' && !p.linkedinUrl && <p className="text-xs text-bad">No LinkedIn URL in the sheet.</p>}
      {p.subject && <p><span className="label mr-1">Subject</span>{' '}{p.subject}</p>}
      <textarea data-cmd="edit" value={text} onChange={e => setText(e.target.value)} rows={p.channel === 'email' ? 14 : 6}
        className="input w-full px-3.5 py-3 text-[14px] leading-[1.65]" aria-label="Message" />
      {gated && (
        <fieldset className="space-y-1 text-xs">
          <legend className="label">Before you send</legend>
          {PRESEND_CHECKS.map((label, i) => (
            <label key={label} className="flex items-center gap-2">
              <input type="checkbox" checked={checked[i]} onChange={e => setChecked(c => c.map((v, j) => (j === i ? e.target.checked : v)))} />
              {label}
            </label>
          ))}
          <button type="button" data-cmd="checks" className="btn" onClick={() => setChecked(c => c.map(() => !c.every(Boolean)))}>
            {checked.every(Boolean) ? 'Untick all' : 'Tick all'}
          </button>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button data-cmd="copy" onClick={copy} disabled={blocked} className="btn-primary">Copy</button>
        <button data-cmd="open" onClick={open} disabled={p.channel === 'email' ? !p.to || blocked : !p.linkedinUrl} className="btn">
          {p.channel === 'email' ? 'Open in Gmail' : 'Open LinkedIn'}
        </button>
        {p.canSaveMessage && text !== p.body && (
          <button className="btn" disabled={saving} onClick={() => start(async () => { setSaveError(''); const r = await editContact(p.id, 'message', text); if (!r.ok) setSaveError(r.error); })}>Save note</button>
        )}
        {limit !== null && <span className={`ml-auto tabular-nums ${over ? 'text-bad' : 'text-muted'}`}>{text.length}/{limit}</span>}
      </div>
      {over && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /> Copy anyway (LinkedIn cuts notes at 300)
        </label>
      )}
      {(hasBlockers(text) || hasBlockers(p.subject)) && <p className="text-xs text-warn">Replace every [[…]] before copying.</p>}
      {unchecked && <p className="text-xs text-warn">Tick the checklist to copy.</p>}
      {saveError && <p role="alert" className="text-xs text-bad">{saveError}</p>}
      {toast && <p role="status" className="text-xs text-good">{toast}</p>}
    </div>
  );
}
