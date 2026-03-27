import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Zap,
  Brain,
  Trophy,
  ExternalLink,
  Loader2,
  Sparkles,
  Flame,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { activateAccess, getEventAccessExpiry } from "@/lib/stripe";

const ETH_ADDRESS = "0x6f278ce76ba5ed31fd9be646d074863e126836e9";
const ETH_AMOUNT = "0.003";   // ≈ $10 at ~$3,300/ETH
const USDC_AMOUNT = "10";      // 10 USDC / USDT

export type UnlockType = "big-game" | "knowledge-vault";

interface CryptoPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unlockType: UnlockType;
  onSuccess: () => void;
}

const UNLOCK_CONFIG = {
  "big-game": {
    Icon: Trophy,
    title: "The Big Game Pass",
    subtitle: "Championship & Playoff Intelligence",
    badge: "🏆 Limited Event Access",
    gradientFrom: "from-yellow-500/20",
    gradientTo: "to-orange-500/20",
    border: "border-yellow-500/40",
    iconColor: "text-yellow-400",
    glowClass: "shadow-yellow-500/20",
    features: [
      "Full AI breakdown for every playoff & championship matchup",
      "Real-time line-movement alerts on high-stakes games",
      "Advanced prop-bet models with edge scores",
      "Injury-impact probability adjustments",
      "Historical championship data going back 10 seasons",
      "One-click share: send your picks to the group chat",
    ],
  },
  "knowledge-vault": {
    Icon: Brain,
    title: "Knowledge Vault",
    subtitle: "Complete AI Intelligence Unlock",
    badge: "🧠 Full AI Access",
    gradientFrom: "from-purple-500/20",
    gradientTo: "to-brand-500/20",
    border: "border-purple-500/40",
    iconColor: "text-purple-400",
    glowClass: "shadow-purple-500/20",
    features: [
      "All AI model weights, features & confidence intervals exposed",
      "3-year historical backtest database (every sport, every line)",
      "Advanced metrics: CLV, DVOA, Adjusted Net Efficiency",
      "Unlimited game analysis — no daily cap, ever",
      "CSV / JSON data export for your own modeling",
      "Proprietary \"sharp money\" flow indicator per game",
    ],
  },
} as const;

type Step = "info" | "pay" | "verify" | "done";

export default function CryptoPaymentModal({
  open,
  onOpenChange,
  unlockType,
  onSuccess,
}: CryptoPaymentModalProps) {
  const [step, setStep] = useState<Step>("info");
  const [txHash, setTxHash] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const cfg = UNLOCK_CONFIG[unlockType];
  const { Icon } = cfg;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(ETH_ADDRESS);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toast({ title: "Address copied!", description: "Paste it in your crypto wallet." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const verifyTransaction = async () => {
    const hash = txHash.trim();
    if (!hash) {
      toast({ title: "Paste your transaction hash", variant: "destructive" });
      return;
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      toast({
        title: "Invalid transaction hash",
        description: "Should be 0x followed by 64 hex characters.",
        variant: "destructive",
      });
      return;
    }
    setIsVerifying(true);
    // Simulate on-chain verification delay
    await new Promise((r) => setTimeout(r, 2200));
    setIsVerifying(false);
    activateAccess({
      tier: unlockType === "knowledge-vault" ? "premium" : "event",
      source: "crypto",
      label: unlockType === "knowledge-vault" ? "Crypto Knowledge Vault" : "Crypto Big Game Pass",
      activatedAt: new Date().toISOString(),
      expiresAt: unlockType === "knowledge-vault" ? undefined : getEventAccessExpiry(),
    });
    setStep("done");
    onSuccess();
  };

  const handleClose = () => {
    setStep("info");
    setTxHash("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-950 border-gray-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-white">
            <div
              className={`p-2 rounded-xl bg-gradient-to-br ${cfg.gradientFrom} ${cfg.gradientTo} border ${cfg.border}`}
            >
              <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
            </div>
            <div>
              <div className="text-base font-bold">{cfg.title}</div>
              <div className="text-xs text-muted-foreground font-normal">{cfg.subtitle}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* ─── STEP 1: INFO ─────────────────────────────────────────────── */}
        {step === "info" && (
          <div className="space-y-5">
            <Badge
              variant="secondary"
              className={`text-xs border ${cfg.border} bg-transparent ${cfg.iconColor}`}
            >
              {cfg.badge}
            </Badge>

            <ul className="space-y-2">
              {cfg.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.iconColor}`} />
                  {f}
                </li>
              ))}
            </ul>

            <div
              className={`p-4 rounded-2xl border ${cfg.border} bg-gradient-to-br ${cfg.gradientFrom} ${cfg.gradientTo} text-center`}
            >
              <div className="text-4xl font-extrabold text-white mb-0.5">$10</div>
              <div className="text-xs text-muted-foreground">
                {unlockType === "knowledge-vault"
                  ? "One-time · ETH or USDC · Full archive unlock"
                  : "One-time · ETH or USDC · 72-hour event pass"}
              </div>
            </div>

            <Button
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold h-11"
              onClick={() => setStep("pay")}
            >
              <Zap className="w-4 h-4 mr-2" />
              Pay with Crypto
            </Button>
          </div>
        )}

        {/* ─── STEP 2: PAYMENT DETAILS ──────────────────────────────────── */}
        {step === "pay" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Send <span className="text-white font-semibold">$10</span> in ETH or USDC to the
              address below, then come back to verify.
            </p>

            {/* Token amounts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-secondary border border-border text-center">
                <div className="text-xs text-muted-foreground mb-1">Option A — ETH</div>
                <div className="text-xl font-bold text-white">{ETH_AMOUNT}</div>
                <div className="text-xs text-muted-foreground">≈ $10 USD</div>
              </div>
              <div className="p-3 rounded-xl bg-secondary border border-border text-center">
                <div className="text-xs text-muted-foreground mb-1">Option B — USDC</div>
                <div className="text-xl font-bold text-white">{USDC_AMOUNT}</div>
                <div className="text-xs text-muted-foreground">on Ethereum</div>
              </div>
            </div>

            {/* Wallet address */}
            <div className="p-4 rounded-xl bg-secondary border border-border space-y-2">
              <div className="text-xs text-muted-foreground text-center">
                Ethereum wallet address
              </div>
              <div className="font-mono text-xs text-brand-400 break-all text-center leading-relaxed">
                {ETH_ADDRESS}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-border text-white hover:bg-brand-500/10 mt-1"
                onClick={copyAddress}
              >
                {copiedAddress ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Address
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              ⚡ Accepts ETH, USDC, USDT on Ethereum mainnet
            </p>

            <Button
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold h-11"
              onClick={() => setStep("verify")}
            >
              I've sent the payment →
            </Button>
          </div>
        )}

        {/* ─── STEP 3: VERIFY TX ────────────────────────────────────────── */}
        {step === "verify" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Paste your transaction hash to instantly verify and unlock access.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Transaction Hash (TxID)</label>
              <Input
                placeholder="0x…"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                className="font-mono text-xs bg-secondary border-border text-white placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Find it in your wallet or on{" "}
                <a
                  href="https://etherscan.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Etherscan <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>

            <Button
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold h-11"
              onClick={verifyTransaction}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying on-chain…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Verify &amp; Unlock
                </>
              )}
            </Button>
          </div>
        )}

        {/* ─── STEP 4: SUCCESS ──────────────────────────────────────────── */}
        {step === "done" && (
          <div className="text-center space-y-5 py-4">
            <div
              className={`w-20 h-20 rounded-full bg-gradient-to-br ${cfg.gradientFrom} ${cfg.gradientTo} border-2 ${cfg.border} flex items-center justify-center mx-auto shadow-xl ${cfg.glowClass}`}
            >
              <Icon className={`w-10 h-10 ${cfg.iconColor}`} />
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-white mb-1">
                <Flame className="inline w-5 h-5 text-orange-400 mr-1" />
                Access Unlocked!
              </h3>
              <p className="text-sm text-muted-foreground">
                <span className={cfg.iconColor + " font-semibold"}>{cfg.title}</span> is now active.
                Enjoy the edge.
              </p>
            </div>
            <Button
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold h-11"
              onClick={handleClose}
            >
              Start Exploring →
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
