const SENTIMENT_CONFIG: Record<string, { bg: string; text: string }> = {
  positive: { bg: "bg-green-500/20", text: "text-green-400" },
  neutral: { bg: "bg-gray-500/20", text: "text-gray-400" },
  negative: { bg: "bg-red-500/20", text: "text-red-400" },
  question: { bg: "bg-blue-500/20", text: "text-blue-400" },
};

interface SentimentBadgeProps {
  sentiment: string;
  className?: string;
}

export function SentimentBadge({ sentiment, className = "" }: SentimentBadgeProps) {
  const config = SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.neutral;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}
    >
      {sentiment}
    </span>
  );
}
