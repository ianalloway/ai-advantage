import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  getAuthChangeEventName,
  getCurrentSiteUser,
  signOutSiteUser,
  updateCurrentSiteUser,
  type SiteUser,
} from "@/lib/auth";
import {
  getAccessChangeEventName,
  getAccessState,
  getCurrentCryptoAccount,
  signOutAccessSession,
  type AccessState,
  type CryptoAccessAccount,
} from "@/lib/stripe";
import {
  getCurrentUserProfile,
  saveCurrentUserProfile,
  type RiskProfile,
  type UserProfile,
} from "@/lib/profile";
import {
  ArrowLeft,
  BellRing,
  Check,
  Crown,
  KeyRound,
  Save,
  ShieldCheck,
  Sparkles,
  UserCircle2,
} from "lucide-react";

const SPORT_OPTIONS = ["nba", "nfl", "mlb", "nhl", "wnba", "ncaab"];
const RISK_OPTIONS: Array<{ value: RiskProfile; label: string; detail: string }> = [
  { value: "conservative", label: "Conservative", detail: "Smaller Kelly usage and less variance." },
  { value: "balanced", label: "Balanced", detail: "Default operating mode for most boards." },
  { value: "aggressive", label: "Aggressive", detail: "Higher conviction sizing and faster rotation." },
];

function shorten(value: string, start = 8, end = 6): string {
  if (!value) return "";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export default function Profile() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<AccessState>(getAccessState());
  const [cryptoAccount, setCryptoAccount] = useState<CryptoAccessAccount | null>(getCurrentCryptoAccount());
  const [siteUser, setSiteUser] = useState<SiteUser | null>(getCurrentSiteUser());
  const [profile, setProfile] = useState<UserProfile | null>(getCurrentUserProfile());
  const { toast } = useToast();

  useEffect(() => {
    const sync = () => {
      const nextUser = getCurrentSiteUser();
      const nextAccess = getAccessState();
      const nextCrypto = getCurrentCryptoAccount();
      setSiteUser(nextUser);
      setAccess(nextAccess);
      setCryptoAccount(nextCrypto);
      setProfile(getCurrentUserProfile(nextAccess, nextCrypto, nextUser));
    };

    sync();
    window.addEventListener(getAuthChangeEventName(), sync);
    window.addEventListener(getAccessChangeEventName(), sync);
    return () => {
      window.removeEventListener(getAuthChangeEventName(), sync);
      window.removeEventListener(getAccessChangeEventName(), sync);
    };
  }, []);

  const hasPaidAccess = access.tier !== "free";
  const profileHeading = useMemo(() => {
    if (!profile) return "My Profile";
    if (profile.username) return `@${profile.username}`;
    if (profile.displayName) return profile.displayName;
    return "My Profile";
  }, [profile]);
  const accountSummary = useMemo(() => {
    if (!cryptoAccount) return null;
    return [
      { label: "Access email", value: cryptoAccount.email },
      { label: "Wallet", value: shorten(cryptoAccount.walletAddress) },
      { label: "Transaction", value: shorten(cryptoAccount.txHash, 10, 6) },
      { label: "Expires", value: cryptoAccount.expiresAt ? new Date(cryptoAccount.expiresAt).toLocaleString() : "Never" },
    ];
  }, [cryptoAccount]);

  const updateProfile = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  };

  const toggleSport = (sport: string) => {
    setProfile((current) => {
      if (!current) return current;
      const exists = current.favoriteSports.includes(sport);
      return {
        ...current,
        favoriteSports: exists
          ? current.favoriteSports.filter((entry) => entry !== sport)
          : [...current.favoriteSports, sport],
      };
    });
  };

  const handleSave = () => {
    if (!profile || !siteUser) return;

    const accountResult = updateCurrentSiteUser({
      email: profile.email,
      username: profile.username,
      displayName: profile.displayName,
    });
    if (!accountResult.success) {
      toast({
        title: "Could not save profile",
        description: accountResult.message,
        variant: "destructive",
      });
      return;
    }

    const nextProfile = saveCurrentUserProfile(profile, access, cryptoAccount, accountResult.user ?? siteUser);
    if (!nextProfile) {
      toast({
        title: "No active account",
        description: "Log into your site account first so we know which profile to save.",
        variant: "destructive",
      });
      return;
    }

    setSiteUser(accountResult.user ?? siteUser);
    setProfile(nextProfile);
    toast({
      title: "Profile saved",
      description: "Your AI Advantage account settings are updated on this device.",
    });
  };

  if (!siteUser) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,rgba(4,8,18,0.98),rgba(5,9,19,0.98))] px-6 py-16 text-white">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center">
          <KeyRound className="mx-auto h-12 w-12 text-brand-300" />
          <h1 className="mt-6 text-3xl font-bold">My Profile is available after account login</h1>
          <p className="mt-4 text-zinc-400">
            Create or log into a site account first. Once signed in, this page becomes your saved profile hub for username, bankroll, sports preferences, and desk settings.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className="bg-brand-600 text-white hover:bg-brand-700">
              <Link to="/signup">Create account</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/10 text-zinc-200 hover:bg-white/[0.06]">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_30%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(5,9,18,0.99))] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to desk
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-brand-300/80">Profile</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">{profileHeading}</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
              This is the account profile for your current AI Advantage login. Save how you want the product to think about your bankroll, sports mix, and alert posture.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/10 text-zinc-200">
              @{siteUser.username}
            </Badge>
            {hasPaidAccess ? (
              <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                {access.label}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-yellow-400/20 bg-yellow-400/10 text-yellow-200">
                Free account
              </Badge>
            )}
            <Button
              variant="outline"
              className="border-white/10 text-zinc-200 hover:bg-white/[0.06]"
              onClick={() => {
                signOutSiteUser();
                toast({
                  title: "Logged out",
                  description: "Your site account has been logged out on this device.",
                });
                navigate("/login");
              }}
            >
              Log out account
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <UserCircle2 className="h-5 w-5 text-brand-300" />
                <div>
                  <h2 className="text-2xl font-semibold">Account identity</h2>
                  <p className="text-sm text-zinc-400">Set the public-facing profile you want this login to carry.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="display-name" className="text-sm text-zinc-300">Display name</label>
                  <Input
                    id="display-name"
                    value={profile.displayName}
                    onChange={(event) => updateProfile("displayName", event.target.value)}
                    placeholder="Sharp account name"
                    className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="username" className="text-sm text-zinc-300">Username</label>
                  <Input
                    id="username"
                    value={profile.username}
                    onChange={(event) => updateProfile("username", event.target.value)}
                    placeholder="@marketmaker"
                    className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm text-zinc-300">Email</label>
                  <Input
                    id="email"
                    value={profile.email}
                    onChange={(event) => updateProfile("email", event.target.value)}
                    placeholder="you@example.com"
                    className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="home-market" className="text-sm text-zinc-300">Home market</label>
                  <Input
                    id="home-market"
                    value={profile.homeMarket}
                    onChange={(event) => updateProfile("homeMarket", event.target.value)}
                    placeholder="Florida, Vegas, New York"
                    className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <label htmlFor="bio" className="text-sm text-zinc-300">Bio / notes</label>
                <Textarea
                  id="bio"
                  value={profile.bio}
                  onChange={(event) => updateProfile("bio", event.target.value)}
                  placeholder="How you use the board, what you care about, and what kind of edge you’re hunting."
                  className="min-h-[110px] border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-yellow-300" />
                <div>
                  <h2 className="text-2xl font-semibold">Trading profile</h2>
                  <p className="text-sm text-zinc-400">Save the settings that shape your preferred desk experience.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="bankroll" className="text-sm text-zinc-300">Bankroll baseline</label>
                  <Input
                    id="bankroll"
                    type="number"
                    min="0"
                    value={profile.bankroll}
                    onChange={(event) => updateProfile("bankroll", Number(event.target.value) || 0)}
                    className="border-white/10 bg-white/[0.03] text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="favorite-book" className="text-sm text-zinc-300">Favorite book</label>
                  <Input
                    id="favorite-book"
                    value={profile.favoriteBook}
                    onChange={(event) => updateProfile("favoriteBook", event.target.value)}
                    placeholder="DraftKings, FanDuel, Circa"
                    className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-zinc-300">Favorite sports</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SPORT_OPTIONS.map((sport) => {
                    const active = profile.favoriteSports.includes(sport);
                    return (
                      <button
                        key={sport}
                        type="button"
                        onClick={() => toggleSport(sport)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          active
                            ? "border-brand-400/40 bg-brand-400/15 text-brand-200"
                            : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
                        }`}
                      >
                        {sport.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-zinc-300">Risk profile</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {RISK_OPTIONS.map((option) => {
                    const active = profile.riskProfile === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateProfile("riskProfile", option.value)}
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          active
                            ? "border-yellow-400/40 bg-yellow-400/10"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="font-semibold text-white">{option.label}</div>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{option.detail}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <BellRing className="h-5 w-5 text-emerald-300" />
                <div>
                  <h2 className="text-2xl font-semibold">Preferences</h2>
                  <p className="text-sm text-zinc-400">Control what the account should stay tuned for.</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div>
                    <div className="font-medium text-white">Newsletter sync</div>
                    <p className="text-sm text-zinc-400">Keep this profile aligned with writing and product updates.</p>
                  </div>
                  <Switch
                    checked={profile.newsletterOptIn}
                    onCheckedChange={(checked) => updateProfile("newsletterOptIn", checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div>
                    <div className="font-medium text-white">Market alert mode</div>
                    <p className="text-sm text-zinc-400">Save that you want the product biased toward faster execution signals.</p>
                  </div>
                  <Switch
                    checked={profile.marketAlerts}
                    onCheckedChange={(checked) => updateProfile("marketAlerts", checked)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="bg-brand-600 text-white hover:bg-brand-700" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Save profile
              </Button>
              <Button asChild variant="outline" className="border-white/10 text-zinc-200 hover:bg-white/[0.06]">
                <Link to="/daily-picks">Go to live board</Link>
              </Button>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <div>
                  <h2 className="text-xl font-semibold">Session snapshot</h2>
                  <p className="text-sm text-zinc-400">What this browser is currently signed in as.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Access tier</span>
                  {hasPaidAccess ? (
                    <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                      {access.tier}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-white/10 text-zinc-300">
                      free
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Source</span>
                  <span className="text-zinc-200">{access.source}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Site user</span>
                  <span className="text-zinc-200">@{siteUser.username}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Profile status</span>
                  <span className="inline-flex items-center gap-2 text-zinc-200">
                    <Check className="h-4 w-4 text-brand-300" />
                    {profile.displayName || profile.username ? "Account created" : "Needs setup"}
                  </span>
                </div>
              </div>

              {accountSummary ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <Crown className="h-4 w-4 text-yellow-300" />
                    Crypto account
                  </div>
                  <dl className="space-y-3 text-sm">
                    {accountSummary.map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-3">
                        <dt className="text-zinc-500">{item.label}</dt>
                        <dd className="max-w-[13rem] text-right text-zinc-200">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {hasPaidAccess ? (
                <Button
                  variant="outline"
                  className="mt-6 w-full border-white/10 text-zinc-200 hover:bg-white/[0.06]"
                  onClick={() => {
                    signOutAccessSession();
                    toast({
                      title: "Paid access cleared",
                      description: "The paid access session on this browser has been removed.",
                    });
                    navigate("/login");
                  }}
                >
                  Clear paid access on this device
                </Button>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-xl font-semibold">What this unlocks next</h2>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400">
                {hasPaidAccess ? (
                  <>
                    <li className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      Save your preferred sports mix so the product can center the right boards first.
                    </li>
                    <li className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      Keep a stable identity for your paid access instead of relying on a mystery device unlock.
                    </li>
                    <li className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      Set the operating style you want before we add deeper personalized workflows.
                    </li>
                  </>
                ) : (
                  <>
                    <li className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-yellow-100">
                      Your account is live, but paid access is still off. Unlock a pass to connect this profile to the premium board and deeper workflow tools.
                    </li>
                    <li className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      Keep building your identity now, then restore or unlock paid access whenever you are ready.
                    </li>
                  </>
                )}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
