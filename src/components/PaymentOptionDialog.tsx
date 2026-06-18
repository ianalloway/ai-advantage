import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Coins, ShieldCheck, Flame } from "lucide-react";

interface PaymentOptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectStripe: () => void;
  onSelectCrypto: () => void;
}

export default function PaymentOptionDialog({
  open,
  onOpenChange,
  onSelectStripe,
  onSelectCrypto,
}: PaymentOptionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[linear-gradient(180deg,rgba(7,10,20,0.98),rgba(4,7,16,0.98))] text-white shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-300">
            <Flame className="h-6 w-6 text-yellow-400 animate-pulse" />
          </div>
          <DialogTitle className="text-center text-xl font-bold tracking-tight">
            Unlock the Live Board
          </DialogTitle>
          <DialogDescription className="text-center text-zinc-400">
            Get 72-hour full access to the live board, recommended side, execution edge, and Kelly sizing.
          </DialogDescription>
        </DialogHeader>

        <div className="my-6 space-y-4">
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-center">
            <div className="text-3xl font-extrabold text-white">$10</div>
            <div className="text-xs text-zinc-400">One-time / 72-hour pass</div>
          </div>

          <div className="grid gap-3">
            <Button
              onClick={onSelectStripe}
              className="relative flex h-14 items-center justify-start gap-4 rounded-xl border border-white/10 bg-white/5 px-4 text-left font-semibold text-white transition-all hover:bg-white/10 hover:border-brand-500/30"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Pay with Card</div>
                <div className="text-xs font-normal text-zinc-400">Secure Stripe checkout</div>
              </div>
            </Button>

            <Button
              onClick={onSelectCrypto}
              className="relative flex h-14 items-center justify-start gap-4 rounded-xl border border-white/10 bg-white/5 px-4 text-left font-semibold text-white transition-all hover:bg-white/10 hover:border-brand-500/30"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-400">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Pay with Crypto</div>
                <div className="text-xs font-normal text-zinc-400">ETH or USDC on Ethereum</div>
              </div>
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
          <span>Access is tied securely to your device session.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
