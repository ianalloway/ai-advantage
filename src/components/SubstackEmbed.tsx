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
  return (
    <div className={className}>
      <iframe
        src={getEmbedUrl(publicationUrl)}
        title={title}
        height={height}
        className="h-full min-h-[320px] w-full rounded-2xl border border-white/10 bg-white"
        frameBorder="0"
        scrolling="no"
      />
    </div>
  );
}
