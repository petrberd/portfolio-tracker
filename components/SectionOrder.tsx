"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface Ctx {
  order: string[];
  /** Give the new relative sequence of currently-visible block ids (post-drag);
   * hidden blocks not in that list keep their absolute slot in the full order. */
  reorderVisible: (visibleOrder: string[]) => void;
}

const SectionOrderContext = createContext<Ctx | null>(null);

// Mirrors lib/sectionOrder.ts's DEFAULT_SECTION_ORDER — duplicated rather than
// imported so this client component doesn't pull in the server-only storage
// module; the server is the source of truth once loaded.
const DEFAULT_ORDER = [
  "value",
  "performance",
  "benchmark",
  "vix",
  "allocationCluster",
  "wishlist",
  "analysts",
  "dividendsCluster",
  "dividendProjection",
  "tax",
];

/**
 * Order of the dashboard's draggable blocks — loaded once from the server (so
 * it follows the user across devices, like SectionVisibility) and updated
 * optimistically as the user drags.
 */
export function SectionOrderProvider({
  children,
  endpoint = "/api/section-order",
  defaultOrder = DEFAULT_ORDER,
}: {
  children: React.ReactNode;
  /** /demo passes "/api/demo/section-order" — its own store, shared across demo
   * visitors but never touching the real portfolio's. */
  endpoint?: string;
  /** /demo passes its own default (no "wishlist" block — demo has no wishlist section). */
  defaultOrder?: string[];
}) {
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.order) && j.order.length) setOrder(j.order);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const reorderVisible = useCallback(
    (visibleOrder: string[]) => {
      setOrder((prev) => {
        const visibleSet = new Set(visibleOrder);
        let i = 0;
        const next = prev.map((id) => (visibleSet.has(id) ? visibleOrder[i++] : id));
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next }),
        }).catch(() => {});
        return next;
      });
    },
    [endpoint]
  );

  // Don't render dashboard content until we know the saved order — otherwise
  // blocks would flash in default order for a moment before jumping.
  if (!loaded) return null;

  return <SectionOrderContext.Provider value={{ order, reorderVisible }}>{children}</SectionOrderContext.Provider>;
}

export function useSectionOrder(): Ctx {
  const ctx = useContext(SectionOrderContext);
  if (!ctx) throw new Error("useSectionOrder must be used within SectionOrderProvider");
  return ctx;
}
