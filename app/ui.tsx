import { STATUS_LABEL, type Status } from '@/lib/rules';

const TONE: Record<Status, string> = {
  to_contact: 'border-line text-muted', sent: 'border-accent/40 text-accent', accepted: 'border-accent/40 text-accent',
  replied: 'border-good/40 text-good', conversation: 'border-good/40 text-good', closed: 'border-line text-muted',
  skipped: 'border-line text-muted/70', reference: 'border-line text-muted',
};

export function StatusChip({ s }: { s: Status }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs ${TONE[s]}`}>{STATUS_LABEL[s]}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-10 text-center text-muted">{children}</div>;
}
