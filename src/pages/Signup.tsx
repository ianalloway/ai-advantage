import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getCurrentSiteUser, signUpSiteUser } from "@/lib/auth";
import { getAccessState, getCurrentCryptoAccount } from "@/lib/stripe";
import { Check, Sparkles, UserPlus } from "lucide-react";
import BrandedHeader from "@/components/BrandedHeader";

export default function Signup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(getCurrentSiteUser());
  const access = getAccessState();
  const cryptoAccount = getCurrentCryptoAccount();

  useEffect(() => {
    const nextUser = getCurrentSiteUser();
    setCurrentUser(nextUser);
    if (cryptoAccount && !nextUser) {
      setEmail(cryptoAccount.email);
      setDisplayName(cryptoAccount.email.split("@")[0]);
    }
  }, [cryptoAccount]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await signUpSiteUser({ email, username, displayName, password });
    setIsSubmitting(false);

    toast({
      title: result.success ? "Account created" : "Could not create account",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });

    if (!result.success) return;

    navigate("/profile");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.12),_transparent_25%),radial-gradient(circle_at_80%_10%,_rgba(56,189,248,0.12),_transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(5,9,18,0.99))] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <BrandedHeader />

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.22em] text-yellow-300/80 font-bold">Create Account</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight leading-tight">Pick your username and claim your profile.</h1>
            <p className="mt-4 text-base leading-7 text-zinc-400">
              Your account gives the site a stable identity for your profile, desk preferences, and future personalized workflows.
            </p>

            <div className="mt-8 space-y-4">
              {[
                "Your chosen username becomes the top-line profile identity.",
                "Your saved bankroll, sports mix, and notes stay attached to your account.",
                "Paid access can be restored after signup, so crypto and account identity work together.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-5 transition-colors hover:bg-black/30 text-sm text-zinc-300 leading-relaxed">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-300" />
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-white/10 text-zinc-300 px-3 py-1">
                {access.label}
              </Badge>
              {cryptoAccount ? (
                <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300 px-3 py-1">
                  Crypto access detected
                </Badge>
              ) : null}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,24,0.98),rgba(4,8,18,0.98))] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.38)] relative overflow-hidden">
            {/* Subtle glow effect */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-500/10 blur-[80px] rounded-full pointer-events-none" />

            {currentUser ? (
              <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 p-8">
                <div className="flex items-center gap-3 text-xl font-bold text-white">
                  <Sparkles className="h-6 w-6 text-emerald-300" />
                  Your account is already live
                </div>
                <p className="mt-4 text-base leading-7 text-zinc-300">
                  You are signed in as <span className="font-semibold text-white">@{currentUser.username}</span>. Jump into your profile and keep building it out there.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button asChild className="h-11 px-6 bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-600/20">
                    <Link to="/profile">Open profile</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 px-6 border-white/10 text-zinc-200 hover:bg-white/[0.06]">
                    <Link to="/login">Account login</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500 font-bold">New account</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight">Sign up</h2>
                </div>

                <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-zinc-300">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="h-12 border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500 focus:border-brand-500/50 focus:ring-brand-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="username" className="text-sm font-medium text-zinc-300">
                      Username
                    </label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      placeholder="marketmaker"
                      className="h-12 border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500 focus:border-brand-500/50 focus:ring-brand-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="display-name" className="text-sm font-medium text-zinc-300">
                      Display name
                    </label>
                    <Input
                      id="display-name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="How you want your profile to read"
                      className="h-12 border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500 focus:border-brand-500/50 focus:ring-brand-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      className="h-12 border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500 focus:border-brand-500/50 focus:ring-brand-500/20"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-bold bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-600/20 transition-all active:scale-[0.98]"
                    disabled={isSubmitting}
                  >
                    <UserPlus className="mr-2 h-5 w-5" />
                    {isSubmitting ? "Creating account..." : "Create account"}
                  </Button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/5">
                  <p className="text-sm text-zinc-400">
                    Already have an account?{" "}
                    <Link to="/login" className="font-bold text-brand-300 transition-colors hover:text-brand-200 underline underline-offset-4 decoration-brand-500/30 hover:decoration-brand-500">
                      Log in here
                    </Link>
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
