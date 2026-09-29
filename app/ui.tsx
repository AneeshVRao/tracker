import { STATUS_LABEL, type Status } from '@/lib/rules';

const TONE: Record<Status, string> = {
  to_contact: 'border-line bg-sunken text-muted', sent: 'border-accent/30 bg-accent/10 text-accent', accepted: 'border-accent/30 bg-accent/10 text-accent',
  replied: 'border-good/30 bg-good/10 text-good', conversation: 'border-good/30 bg-good/10 text-good', closed: 'border-line text-muted',
  skipped: 'border-line text-muted line-through decoration-muted/40', reference: 'border-line bg-sunken text-muted',
};

export function StatusChip({ s }: { s: Status }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium ${TONE[s]}`}>{STATUS_LABEL[s]}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-sm px-6 py-16 text-center text-[13px] leading-relaxed text-muted">{children}</div>;
}
