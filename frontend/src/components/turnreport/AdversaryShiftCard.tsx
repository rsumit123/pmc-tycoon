export function AdversaryShiftCard({ shift }: { shift: { event_type: string; payload: Record<string, unknown> } }) {
  const headline = (shift.payload.headline as string) ?? shift.event_type.replace(/_/g, " ");
  return (
    <div className="bg-slate-900 border border-slate-800 border-l-4 border-l-rose-500 rounded-lg p-3">
      <p className="text-xs font-tech tracking-wide">{headline}</p>
    </div>
  );
}
