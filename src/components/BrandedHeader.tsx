import { Link } from "react-router-dom";
import { TrendingUp, ArrowLeft } from "lucide-react";

interface BrandedHeaderProps {
  backTo?: string;
  backText?: string;
}

export default function BrandedHeader({ 
  backTo = "/", 
  backText = "Back to home" 
}: BrandedHeaderProps) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <Link to="/" className="flex items-center gap-3 group">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10 transition-all group-hover:border-brand-500/50 group-hover:bg-brand-500/20">
          <TrendingUp className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <p className="text-white font-semibold tracking-tight">AI Advantage Sports</p>
          <p className="text-xs text-muted-foreground">Evaluation-first betting intelligence</p>
        </div>
      </Link>

      <Link 
        to={backTo} 
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {backText}
      </Link>
    </div>
  );
}
