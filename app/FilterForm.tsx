'use client';

import Form from 'next/form';

// Dropdowns apply as soon as they change; text boxes apply on Enter (or the Apply button).
export function FilterForm({ action, className, children }: { action: string; className: string; children: React.ReactNode }) {
  return (
    <Form action={action} className={className}
      onChange={e => { if ((e.target as HTMLElement).tagName === 'SELECT') e.currentTarget.requestSubmit(); }}>
      {children}
    </Form>
  );
}
