import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
import {
  myNotifications,
  markNotificationRead,
  deleteNotification,
} from "@/lib/faq.functions";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const listFn = useServerFn(myNotifications);
  const markFn = useServerFn(markNotificationRead);
  const delFn = useServerFn(deleteNotification);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });

  const mark = useMutation({
    mutationFn: (v: { id?: string }) => markFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative rounded-full border border-border bg-background/90 p-2 hover:border-primary/40 transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-auto rounded-xl border border-border bg-background shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="text-sm font-medium">Notifications</div>
            <button
              onClick={() => mark.mutate({})}
              disabled={unread === 0 || mark.isPending}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-primary disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>

          {q.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`p-3 text-sm ${n.is_read ? "opacity-70" : "bg-primary/5"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{n.title}</div>
                      {n.body && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                        {n.link && (
                          <Link
                            to={n.link}
                            onClick={() => {
                              if (!n.is_read) mark.mutate({ id: n.id });
                              setOpen(false);
                            }}
                            className="text-[11px] text-primary hover:underline"
                          >
                            View
                          </Link>
                        )}
                        {!n.is_read && (
                          <button
                            onClick={() => mark.mutate({ id: n.id })}
                            className="text-[11px] text-muted-foreground hover:text-primary"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => del.mutate(n.id)}
                      aria-label="Delete"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
