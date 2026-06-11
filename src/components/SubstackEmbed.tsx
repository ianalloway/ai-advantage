import { useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubstackEmbedProps {
  publicationUrl?: string;
  title?: string;
  height?: number;
  className?: string;
}

function getEmbedUrl(publicationUrl: string): string {
  const normalized = publicationUrl.replace(/\/+$/, "");
  return `${normalized}/embed`;
}

export default function SubstackEmbed({
  publicationUrl = import.meta.env.VITE_SUBSTACK_PUBLICATION_URL || "https://allowayai.substack.com",
  title = "Subscribe to AllowayAI on Substack",
  height = 320,
  className = "",
}: SubstackEmbedProps) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldLoad) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className={className}>
      {shouldLoad ? (
        <iframe
          src={getEmbedUrl(publicationUrl)}
          title={title}
          height={height}
          loading="lazy"
          className="h-full min-h-[320px] w-full rounded-lg border border-white/10 bg-white"
          frameBorder="0"
          scrolling="no"
        />
      ) : (
        <div className="grid min-h-[320px] place-items-center rounded-lg border border-white/10 bg-slate-950/70 p-8 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10">
              <Mail className="h-5 w-5 text-cyan-200" />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">Subscribe to AllowayAI</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
              Load the official Substack form when you are ready to subscribe.
            </p>
            <Button
              type="button"
              className="mt-5 bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              onClick={() => setShouldLoad(true)}
            >
              Load subscribe form
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
