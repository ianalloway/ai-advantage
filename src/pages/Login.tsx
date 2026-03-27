import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getCurrentSiteUser, signInSiteUser } from "@/lib/auth";
import { getAccessState, getCurrentCryptoAccount } from "@/lib/stripe";
import { ArrowLeft, KeyRound, LockOpen, UserCircle2 } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(getCurrentSiteUser());
  const access = getAccessState();
  const cryptoAccount = getCurrentCryptoAccount();

  useEffect(() => {
    setCurrentUser(getCurrentSiteUser());
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await signInSiteUser({ login, password });
    setIsSubmitting(false);

    toast({
      title: result.success ? "Logged in" : "Login failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });

    if (!result.success) return;

    navigate("/profile");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(5,9,18,0.99))] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-8">
            <p className="text-xs uppercase tracking-[0.22em] text-brand-300/80">Site Login</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Log back into your account.</h1>
            <p className="mt-4 text-base leading-7 text-zinc-400">
              Your site account saves your username, profile settings, and personal desk setup. Paid access stays separate and can be restored after login.
            </p>

            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <UserCircle2 className="h-4 w-4 text-brand-300" />
                  Site account
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  Use your email or username plus password to get back to your saved profile.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <KeyRound className="h-4 w-4 text-yellow-300" />
                  Paid access restore
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  Crypto passes still use your payment email and transaction hash. Log in here first, then restore paid access if needed.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-white/10 text-zinc-300">
                Site account {currentUser ? "active" : "not active"}
              </Badge>
              <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                {access.label}
              </Badge>
              {cryptoAccount ? (
                <Badge variant="outline" className="border-brand-400/30 bg-brand-400/10 text-brand-200">
                  Crypto pass on device
                </Badge>
              ) : null}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,24,0.98),rgba(4,8,18,0.98))] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.38)]">
            {currentUser ? (
              <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 p-6">
                <div className="flex items-center gap-2 text-lg font-semibold text-white">
                  <LockOpen className="h-5 w-5 text-emerald-300" />
                  You are already logged in
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  Signed in as <span className="font-semibold text-white">@{currentUser.username}</span>. You can go straight to your profile or jump into the live board.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild className="bg-brand-600 text-white hover:bg-brand-700">
                    <Link to="/profile">Open profile</Link>
                  </Button>
                  <Button asChild variant="outline" className="border-white/10 text-zinc-200 hover:bg-white/[0.06]">
                    <Link to="/daily-picks">Go to live board</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Welcome back</p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight">Log in</h2>
                </div>

                <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
                  <div className="space-y-2">
                    <label htmlFor="login" className="text-sm text-zinc-300">
                      Email or username
                    </label>
                    <Input
                      id="login"
                      value={login}
                      onChange={(event) => setLogin(event.target.value)}
                      placeholder="you@example.com or your username"
                      autoComplete="username"
                      className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm text-zinc-300">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-brand-600 text-white hover:bg-brand-700"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Logging in..." : "Log in"}
                  </Button>
                </form>

                <p className="mt-6 text-sm text-zinc-400">
                  Need an account?{" "}
                  <Link to="/signup" className="font-medium text-brand-300 transition-colors hover:text-brand-200">
                    Create one here
                  </Link>
                  .
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
