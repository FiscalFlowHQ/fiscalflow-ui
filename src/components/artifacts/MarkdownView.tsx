import ReactMarkdown from "react-markdown";

export type MarkdownViewProps = {
  source: string;
  className?: string;
  empty?: string;
};

/**
 * Shared markdown renderer. `react-markdown` does not interpret raw HTML by default,
 * so user/model prose is text-escaped — no extra HTML sanitizer required for MVP.
 */
export default function MarkdownView({
  source,
  className = "markdown-view",
  empty = "",
}: MarkdownViewProps) {
  const text = source?.trim() ? source : empty;
  if (!text) {
    return <p className={`${className} markdown-view--empty`}>Nothing to show.</p>;
  }
  return (
    <div className={className}>
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
