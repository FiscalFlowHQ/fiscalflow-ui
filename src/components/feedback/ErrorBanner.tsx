export type ErrorBannerProps = {
  title?: string;
  message: string;
  tone?: "error" | "info" | "warn";
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
  children?: React.ReactNode;
};

/** Sticky run-level error / recovery banner (task 11). */
export default function ErrorBanner({
  title,
  message,
  tone = "error",
  onRetry,
  onDismiss,
  retryLabel = "Retry",
  children,
}: ErrorBannerProps) {
  return (
    <div className={`error-banner error-banner--${tone}`} role="alert">
      <div className="error-banner__body">
        {title && <h3 className="error-banner__title">{title}</h3>}
        <p className="error-banner__message">{message}</p>
        {children}
      </div>
      <div className="error-banner__actions">
        {onRetry && (
          <button type="button" className="btn-secondary" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button type="button" className="btn-secondary" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
