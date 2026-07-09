import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, ExternalLink } from "lucide-react";
import { activeSiteAlerts, type SiteAlert } from "@/lib/faq.functions";

const TONE_STYLES: Record<SiteAlert["tone"], { bg: string; icon: ReactNode }> = {

  info: {
    bg: "bg-blue-500/10 text-blue-900 dark:text-blue-100 border-blue-500/30",
    icon: <Info className="h-4 w-4 shrink-0" />,
  },
  success: {
    bg: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 border-emerald-500/30",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  },
  warning: {
    bg: "bg-amber-500/10 text-amber-900 dark:text-amber-100 border-amber-500/30",
    icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
  },
  danger: {
    bg: "bg-rose-500/10 text-rose-900 dark:text-rose-100 border-rose-500/30",
    icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
  },
};

const DISMISS_KEY = "vidya.dismissedAlerts";

function useDismissed() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) setIds(JSON.parse(raw));
    } catch {
      /* noop */
    }
  }, []);
  const dismiss = (id: string) => {
    setIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };
  return { dismissed: ids, dismiss };
}

export function SiteAlertBanner() {
  const fn = useServerFn(activeSiteAlerts);
  const { dismissed, dismiss } = useDismissed();
  const q = useQuery({
    queryKey: ["activeSiteAlerts"],
    queryFn: () => fn(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const alerts = (q.data ?? []).filter((a) => !dismissed.includes(a.id));
  if (alerts.length === 0) return null;

  return (
    <div className="sticky top-0 z-40 flex flex-col">
      {alerts.map((a) => {
        const style = TONE_STYLES[a.tone] ?? TONE_STYLES.info;
        return (
          <div
            key={a.id}
            className={`border-b px-4 py-2 text-sm flex items-center gap-3 ${style.bg}`}
          >
            {style.icon}
            <div className="flex-1 min-w-0">
              <span>{a.message}</span>
              {a.link_url && (
                <a
                  href={a.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 inline-flex items-center gap-1 underline underline-offset-2 font-medium"
                >
                  {a.link_label ?? "Learn more"} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              aria-label="Dismiss alert"
              className="opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
