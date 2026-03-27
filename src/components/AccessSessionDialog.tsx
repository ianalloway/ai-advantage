import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  getAccessState,
  getCurrentCryptoAccount,
  signInWithCryptoAccount,
  signOutAccessSession,
  type AccessState,
  type CryptoAccessAccount,
} from "@/lib/stripe";
import { KeyRound, LockOpen, LogIn, LogOut, UserCircle2 } from "lucide-react";

interface AccessSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionChange?: () => void;
}

function shorten(value: string, start = 6, end = 4): string {
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export default function AccessSessionDialog({
  open,
  onOpenChange,
  onSessionChange,
}: AccessSessionDialogProps) {
  const [email, setEmail] = useState("");
  const [txHash, setTxHash] = useState("");
  const [access, setAccess] = useState<AccessState>(getAccessState());
  const [currentAccount, setCurrentAccount] = useState<CryptoAccessAccount | null>(
    getCurrentCryptoAccount(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const hasDeviceAccess = access.tier !== "free";
  const expiresText = useMemo(() => {
    if (!currentAccount?.expiresAt) return "Never expires";
    return new Date(currentAccount.expiresAt).toLocaleString();
  }, [currentAccount]);

  useEffect(() => {
    if (!open) return;
    setAccess(getAccessState());
    setCurrentAccount(getCurrentCryptoAccount());
    onSessionChange?.();
  }, [open, onSessionChange]);

  const handleSignIn = async () => {
    setIsSubmitting(true);
    const result = signInWithCryptoAccount({ email, txHash });
    setIsSubmitting(false);

    toast({
      title: result.success ? "Signed in" : "Could not sign in",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });

    if (!result.success) return;

    setAccess(getAccessState());
    setCurrentAccount(getCurrentCryptoAccount());
    onSessionChange?.();
    setEmail("");
    setTxHash("");
    onOpenChange(false);
  };

  const handleLogout = () => {
    signOutAccessSession();
    setAccess(getAccessState());
    setCurrentAccount(getCurrentCryptoAccount());
    onSessionChange?.();
    toast({
      title: "Logged out",
      description: "This device no longer has active premium access.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[linear-gradient(180deg,rgba(7,10,20,0.98),rgba(4,7,16,0.98))] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5 text-brand-300" />
            Restore paid access
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            This is for restoring a paid crypto pass on this browser. Site account login now lives on its own dedicated login page.
          </DialogDescription>
        </DialogHeader>

        {currentAccount ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/80">
                    Active crypto session
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">{currentAccount.label}</p>
                </div>
                <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
                  {currentAccount.tier === "premium" ? "Knowledge Vault" : "Event pass"}
                </Badge>
              </div>

              <dl className="mt-4 space-y-2 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Email</dt>
                  <dd>{currentAccount.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Wallet</dt>
                  <dd className="font-mono">{shorten(currentAccount.walletAddress)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Tx hash</dt>
                  <dd className="font-mono">{shorten(currentAccount.txHash, 10, 6)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Access window</dt>
                  <dd>{expiresText}</dd>
                </div>
              </dl>
            </div>

            <Button
              variant="outline"
              className="w-full border-white/10 text-zinc-100 hover:bg-white/[0.06]"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out of this device
            </Button>
            <Button asChild className="w-full bg-brand-600 text-white hover:bg-brand-700">
              <Link to="/profile" onClick={() => onOpenChange(false)}>
                <UserCircle2 className="mr-2 h-4 w-4" />
                Go to my profile
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full border-white/10 text-zinc-100 hover:bg-white/[0.06]">
              <Link to="/login" onClick={() => onOpenChange(false)}>
                Site account login
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {hasDeviceAccess ? (
              <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">
                <div className="flex items-center gap-2 font-semibold">
                  <LockOpen className="h-4 w-4" />
                  Device access is already active
                </div>
                <p className="mt-2 text-yellow-100/80">
                  This browser is currently unlocked as {access.label}. You can clear it with logout, then sign into a saved crypto access account.
                </p>
                <Button
                  variant="outline"
                  className="mt-4 w-full border-yellow-300/20 text-yellow-100 hover:bg-yellow-400/10"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out current device access
                </Button>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="access-email" className="text-sm text-zinc-300">
                Access email
              </label>
              <Input
                id="access-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="access-tx" className="text-sm text-zinc-300">
                Transaction hash
              </label>
              <Input
                id="access-tx"
                value={txHash}
                onChange={(event) => setTxHash(event.target.value)}
                placeholder="0x..."
                className="border-white/10 bg-white/[0.03] font-mono text-white placeholder:text-zinc-500"
              />
            </div>

            <p className="text-xs leading-relaxed text-zinc-500">
              This restores a crypto unlock previously verified on this device. The event pass still expires after its access window.
            </p>

            <Button
              className="w-full bg-brand-600 font-semibold text-white hover:bg-brand-700"
              disabled={isSubmitting}
              onClick={() => void handleSignIn()}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign in with crypto receipt
            </Button>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="border-white/10 text-zinc-100 hover:bg-white/[0.06]">
                <Link to="/login" onClick={() => onOpenChange(false)}>
                  Site login
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/10 text-zinc-100 hover:bg-white/[0.06]">
                <Link to="/signup" onClick={() => onOpenChange(false)}>
                  Create account
                </Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
