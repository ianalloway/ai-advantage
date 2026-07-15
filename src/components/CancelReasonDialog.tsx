import { useState } from "react";
import { Button } from "@/components/ui/button";
import { submitCancelReason } from "@/lib/stripe";
import { useToast } from "@/components/ui/use-toast";

const REASONS = [
  "Too expensive",
  "Not enough edges / alerts",
  "Switched to another tool",
  "Only needed for one event",
  "Other",
];

export default function CancelReasonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white">What made you leave?</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Optional — helps us improve the desk. You can skip.
        </p>
        <div className="mt-4 space-y-2">
          {REASONS.map((item) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200">
              <input
                type="radio"
                name="cancel-reason"
                checked={reason === item}
                onChange={() => setReason(item)}
              />
              {item}
            </label>
          ))}
        </div>
        {reason === "Other" ? (
          <textarea
            className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white"
            rows={3}
            placeholder="Tell us more"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-white/10"
            onClick={() => onOpenChange(false)}
          >
            Skip
          </Button>
          <Button
            className="flex-1 bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              const finalReason = reason === "Other" && note.trim() ? `Other: ${note.trim()}` : reason;
              void submitCancelReason(finalReason)
                .then(() => {
                  toast({ title: "Thanks", description: "Cancel feedback recorded." });
                  onOpenChange(false);
                })
                .finally(() => setSaving(false));
            }}
          >
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
