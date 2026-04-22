import { useState } from "react";
import type { BaseMarker, MissileStock } from "../../lib/types";

export interface MissileTransferModalProps {
  weaponId: string;
  fromBase: BaseMarker;
  availableStock: number;
  allBases: BaseMarker[];
  allStocks: MissileStock[];
  onClose: () => void;
  onTransfer: (toBaseId: number, quantity: number) => Promise<void>;
}

function shortBaseName(name: string): string {
  return name.replace(/\s+Air Force Station\b.*$/, "").replace(/\s+AFS\b.*$/, "");
}

export function MissileTransferModal({
  weaponId, fromBase, availableStock, allBases, allStocks, onClose, onTransfer,
}: MissileTransferModalProps) {
  const [toBaseId, setToBaseId] = useState<number | "">("");
  const [qty, setQty] = useState<number>(Math.min(availableStock, 20));
  const [submitting, setSubmitting] = useState(false);

  const eligibleBases = allBases.filter((b) => b.id !== fromBase.id);
  const destStock =
    typeof toBaseId === "number"
      ? (allStocks.find((s) => s.base_id === toBaseId && s.weapon_id === weaponId)?.stock ?? 0)
      : null;

  const canSubmit = typeof toBaseId === "number" && qty > 0 && qty <= availableStock && !submitting;

  const submit = async () => {
    if (!canSubmit || typeof toBaseId !== "number") return;
    setSubmitting(true);
    try {
      await onTransfer(toBaseId, qty);
      onClose();
    } catch {
      // toast pushed by store
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`Transfer ${weaponId}`}
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Rebase {weaponId.toUpperCase().replace(/_/g, "-")}</h3>
            <p className="text-[11px] opacity-70">
              From <span className="font-semibold">{shortBaseName(fromBase.name)}</span> · {availableStock} in stock
            </p>
          </div>
          <button onClick={onClose} aria-label="close" className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700">×</button>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Destination base</span>
          <select
            value={toBaseId === "" ? "" : String(toBaseId)}
            onChange={(e) => {
              const v = e.target.value;
              setToBaseId(v === "" ? "" : Number(v));
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
          >
            <option value="">Pick a destination…</option>
            {eligibleBases.map((b) => {
              const cur = allStocks.find(
                (s) => s.base_id === b.id && s.weapon_id === weaponId,
              )?.stock ?? 0;
              return (
                <option key={b.id} value={b.id}>
                  {shortBaseName(b.name)} — depot {cur}
                </option>
              );
            })}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Quantity (max {availableStock})</span>
          <input
            type="number"
            min={1}
            max={availableStock}
            value={qty}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) setQty(Math.max(1, Math.min(availableStock, v)));
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
          />
        </label>

        {destStock !== null && (
          <div className="text-xs bg-slate-950/40 border border-slate-800 rounded px-2 py-1.5">
            After transfer: source <span className="font-mono">{availableStock - qty}</span>
            {" · dest "}<span className="font-mono">{destStock + qty}</span>
          </div>
        )}

        <p className="text-[10px] opacity-60 italic">
          Ground transport between IAF bases — no cost, stock is instantly repositioned.
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={[
            "w-full rounded py-2 text-sm font-semibold",
            canSubmit
              ? "bg-amber-600 hover:bg-amber-500 text-slate-900"
              : "bg-slate-800 text-slate-500 cursor-not-allowed",
          ].join(" ")}
        >
          {submitting ? "Transferring…" : "Rebase missiles"}
        </button>
      </div>
    </div>
  );
}
