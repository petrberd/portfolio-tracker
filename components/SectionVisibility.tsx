"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface Ctx {
  isHidden: (id: string) => boolean;
  hide: (id: string, label: string) => void;
  show: (id: string) => void;
  hiddenList: { id: string; label: string }[];
}

const SectionVisibilityContext = createContext<Ctx | null>(null);

/**
 * Which dashboard sections are hidden — loaded once from the server (so it
 * follows the user across devices) and updated optimistically on toggle.
 * Labels for the "restore" list are kept client-side only (not persisted) —
 * they're just whatever title was showing when the section was hidden.
 */
export function SectionVisibilityProvider({
  children,
  endpoint = "/api/section-visibility",
}: {
  children: React.ReactNode;
  /** /demo passes "/api/demo/section-visibility" — its own store, shared across
   * demo visitors but never touching the real portfolio's. */
  endpoint?: string;
}) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setHiddenIds(new Set(j.hidden ?? [])))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [endpoint]);

  const hide = useCallback(
    (id: string, label: string) => {
      setHiddenIds((prev) => new Set(prev).add(id));
      setLabels((prev) => ({ ...prev, [id]: label }));
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, hidden: true }),
      }).catch(() => {});
    },
    [endpoint]
  );

  const show = useCallback(
    (id: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, hidden: false }),
      }).catch(() => {});
    },
    [endpoint]
  );

  const isHidden = useCallback((id: string) => hiddenIds.has(id), [hiddenIds]);
  const hiddenList = [...hiddenIds].map((id) => ({ id, label: labels[id] ?? id }));

  // Don't render dashboard content until we know what's hidden — otherwise
  // every section would flash visible for a moment before disappearing.
  if (!loaded) return null;

  return (
    <SectionVisibilityContext.Provider value={{ isHidden, hide, show, hiddenList }}>
      {children}
    </SectionVisibilityContext.Provider>
  );
}

export function useSectionVisibility(): Ctx {
  const ctx = useContext(SectionVisibilityContext);
  if (!ctx) throw new Error("useSectionVisibility must be used within SectionVisibilityProvider");
  return ctx;
}

/** Chip near the header: "Skryté sekce (N)" — click to reveal a list of one-click restores. */
export function HiddenSectionsChip() {
  const { hiddenList, show } = useSectionVisibility();
  const [open, setOpen] = useState(false);

  if (!hiddenList.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm px-3 py-2 rounded-xl border border-line hover:bg-panel2 transition text-muted"
      >
        Skryté sekce ({hiddenList.length})
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 bg-panel2 border border-line rounded-xl shadow-xl overflow-hidden">
            {hiddenList.map((h) => (
              <button
                key={h.id}
                onClick={() => {
                  show(h.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-panel transition flex items-center justify-between gap-2"
              >
                <span className="truncate">{h.label}</span>
                <span className="text-brand text-xs shrink-0">Zobrazit</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
