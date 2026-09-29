import { ImportWizard } from './ImportWizard';

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Import a workbook</h1>
      <p className="text-muted">Pick an .xlsx. Each tab becomes a list. Re-importing the same file updates contacts without touching your statuses, notes or edited messages.</p>
      <ImportWizard />
    </div>
  );
}
