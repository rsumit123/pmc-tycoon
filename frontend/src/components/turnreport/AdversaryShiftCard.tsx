export function AdversaryShiftCard({ shift }: { shift: { event_type: string; payload: Record<string, unknown> } }) {
  const headline = (shift.payload.headline as string) ?? shift.event_type.replace(/_/g, " ");
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <p className="text-xs">{headline}</p>
    </div>
  );
}
