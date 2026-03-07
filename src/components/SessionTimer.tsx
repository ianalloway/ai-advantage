import { useState, useEffect } from "react";
import { Clock, X } from "lucide-react";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Show reminder every 30 minutes
  useEffect(() => {
    if (elapsed > 0 && elapsed % 1800 === 0) {
      setShowReminder(true);
      setDismissed(false);
    }
  }, [elapsed]);

  if (dismissed && !showReminder) return null;

  return (
    <>
      {/* Floating session pill — bottom-left */}
      <div className="fixed bottom-[4.5rem] md:bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900/90 border border-gray-700 backdrop-blur-sm text-xs text-gray-400 shadow-lg">
        <Clock className="w-3 h-3 text-gray-500" />
        <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
      </div>

      {/* Gentle break reminder overlay */}
      {showReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm mx-4 space-y-4 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-yellow-500/10 border-2 border-yellow-500/30 flex items-center justify-center mx-auto">
              <Clock className="w-7 h-7 text-yellow-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Time for a break?</h3>
            <p className="text-sm text-gray-400">
              You've been active for <span className="text-white font-semibold">{formatDuration(elapsed)}</span>.
              Taking regular breaks helps you make better decisions. Gamble responsibly.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setShowReminder(false);
                  setDismissed(false);
                }}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Got it, thanks
              </button>
            </div>
            <p className="text-[10px] text-gray-600">
              Responsible gambling tools — AI Advantage Sports
            </p>
          </div>
        </div>
      )}
    </>
  );
}
