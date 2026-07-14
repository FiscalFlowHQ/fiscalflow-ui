import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "info" | "success" | "error";

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastContextValue = {
  toasts: ToastItem[];
  pushToast: (input: Omit<ToastItem, "id"> & { id?: string }) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: Omit<ToastItem, "id"> & { id?: string }) => {
      const id = input.id ?? `toast-${++toastSeq}`;
      const item: ToastItem = {
        id,
        message: input.message,
        tone: input.tone,
        actionLabel: input.actionLabel,
        onAction: input.onAction,
      };
      setToasts((prev) => [...prev, item]);
      window.setTimeout(() => dismissToast(id), 8000);
      return id;
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({ toasts, pushToast, dismissToast }),
    [toasts, pushToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.tone}`}
            role={t.tone === "error" ? "alert" : "status"}
          >
            <p className="toast__message">{t.message}</p>
            <div className="toast__actions">
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    t.onAction?.();
                    dismissToast(t.id);
                  }}
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

/** Safe for trees that may render outside the provider (tests). */
export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext);
}
