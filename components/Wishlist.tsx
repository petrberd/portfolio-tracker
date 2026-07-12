"use client";

import { useEffect, useRef, useState } from "react";
import { pct } from "@/lib/format";
import { InfoTip } from "@/components/InfoTip";
import { notifyPriceAlerts } from "@/lib/notifyAlerts";

const money = (v: number, ccy: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(v ?? 0);

interface Suggestion {
  symbol: string;
  name: string;
  exchange: string;
}

interface WishlistItem {
  symbol: string;
  name: string;
  addedAt: string;
  alert?: { targetPrice: number; direction: "above" | "below" };
  price: number;
  currency: string;
  dayChangePercent: number;
  triggered: boolean;
  targetPrice: number | null; // analyst average 12m price target — null if no coverage
  upsidePct: number | null;
  analystCount: number;
}

export function Wishlist({ onSelect, refreshTick = 0 }: { onSelect: (symbol: string, name: string) => void; refreshTick?: number }) {
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDir, setAlertDir] = useState<"above" | "below">("above");
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setNotifPerm("unsupported");
      return;
    }
    setNotifPerm(Notification.permission);
  }, []);

  const requestNotifPermission = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  const load = (force = false) =>
    fetch(`/api/wishlist${force ? "?refresh=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const loaded: WishlistItem[] = j.items ?? [];
        setItems(loaded);
        notifyPriceAlerts(loaded, notifiedRef);
      })
      .catch(() => setItems([]));

  // refreshTick bumps on "Obnovit ceny" (and every 5 min) — force past the price cache then,
  // same as the other panels; the initial mount fetch stays cached.
  useEffect(() => {
    if (refreshTick > 0) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/wishlist/search?q=${encodeURIComponent(query)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setSuggestions(j.results ?? []))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const addItem = async (s: Suggestion) => {
    setQuery("");
    setSuggestions([]);
    await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: s.symbol, name: s.name }),
    });
    load();
  };

  const removeItem = async (symbol: string) => {
    await fetch(`/api/wishlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    load();
  };

  const openAlertEditor = (item: WishlistItem) => {
    setEditingSymbol(item.symbol);
    setAlertPrice(item.alert ? String(item.alert.targetPrice) : item.price ? item.price.toFixed(2) : "");
    setAlertDir(item.alert?.direction ?? "above");
  };

  const saveAlert = async (symbol: string) => {
    const price = parseFloat(alertPrice.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) return;
    await fetch("/api/wishlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, targetPrice: price, direction: alertDir }),
    });
    setEditingSymbol(null);
    load();
  };

  const clearAlert = async (symbol: string) => {
    await fetch("/api/wishlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, clear: true }),
    });
    load();
  };

  return (
    <div>
      <div className="relative mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Přidat titul (ticker nebo název firmy)…"
          className="w-full bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-brand"
        />
        {(suggestions.length > 0 || searching) && query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full bg-panel2 border border-line rounded-xl shadow-xl overflow-hidden">
            {searching && <div className="px-3 py-2 text-sm text-muted">Hledám…</div>}
            {!searching && !suggestions.length && <div className="px-3 py-2 text-sm text-muted">Nic nenalezeno.</div>}
            {!searching &&
              suggestions.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => addItem(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-panel transition flex items-center justify-between gap-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-muted text-xs">{s.symbol}</span>
                  </span>
                  <span className="text-muted text-xs shrink-0">{s.exchange}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {items === null && <div className="h-[80px] flex items-center justify-center text-muted text-sm">Načítám…</div>}
      {items?.length === 0 && (
        <div className="h-[80px] flex items-center justify-center text-muted text-sm text-center px-6">
          Zatím žádné sledované tituly — přidej první podle tickeru nebo názvu firmy.
        </div>
      )}

      {!!items?.length && (
        <ul className="divide-y divide-line/50">
          <li className="pb-2 hidden sm:flex items-center gap-3 text-muted text-xs uppercase tracking-wide">
            <span className="flex-1">Titul</span>
            <span className="shrink-0 w-[88px] text-right">Cena</span>
            <span className="shrink-0 w-28 text-right">Cíl analytiků</span>
            <span className="shrink-0 w-8" />
          </li>
          {items.map((item) => (
            <li key={item.symbol} className={`py-3 ${item.triggered ? "bg-pos/5 -mx-2 px-2 rounded-lg" : ""}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => onSelect(item.symbol, item.name)} className="min-w-0 flex-1 text-left group">
                  <div className="font-medium truncate group-hover:text-brand transition">{item.name}</div>
                  <div className="text-muted text-xs">{item.symbol}</div>
                </button>
                <div className="text-right shrink-0 tabular-nums w-[88px]">
                  <div className="font-medium">{money(item.price, item.currency)}</div>
                  <div className={`text-xs ${item.dayChangePercent >= 0 ? "text-pos" : "text-neg"}`}>
                    {pct(item.dayChangePercent)}
                  </div>
                </div>
                <div className="text-right shrink-0 tabular-nums w-28 hidden sm:block">
                  {item.targetPrice != null ? (
                    <>
                      <div className="text-sm">{money(item.targetPrice, item.currency)}</div>
                      <div className={`text-xs ${item.upsidePct != null && item.upsidePct >= 0 ? "text-pos" : "text-neg"}`}>
                        {item.upsidePct! >= 0 ? "+" : ""}
                        {item.upsidePct!.toFixed(1)} %
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted">bez pokrytí</div>
                  )}
                </div>
                <button
                  onClick={() => removeItem(item.symbol)}
                  aria-label={`Odebrat ${item.name}`}
                  className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-neg hover:bg-panel2 transition"
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {item.triggered && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-pos bg-pos/10">
                    🔔 Cíl dosažen
                  </span>
                )}
                {item.alert && !editingSymbol && (
                  <button
                    onClick={() => openAlertEditor(item)}
                    className="text-xs px-2 py-1 rounded-lg border border-line text-muted hover:bg-panel2 transition"
                  >
                    Alert {item.alert.direction === "above" ? "≥" : "≤"} {money(item.alert.targetPrice, item.currency)}
                  </button>
                )}
                {item.alert && editingSymbol !== item.symbol && (
                  <button
                    onClick={() => clearAlert(item.symbol)}
                    aria-label="Smazat alert"
                    className="text-xs text-muted hover:text-neg transition"
                  >
                    zrušit
                  </button>
                )}
                {!item.alert && editingSymbol !== item.symbol && (
                  <button
                    onClick={() => openAlertEditor(item)}
                    className="text-xs px-2 py-1 rounded-lg border border-line text-muted hover:bg-panel2 transition"
                  >
                    + Nastavit alert
                  </button>
                )}

                {editingSymbol === item.symbol && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={alertDir}
                      onChange={(e) => setAlertDir(e.target.value as "above" | "below")}
                      className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand"
                    >
                      <option value="above">při růstu nad</option>
                      <option value="below">při poklesu pod</option>
                    </select>
                    <input
                      value={alertPrice}
                      onChange={(e) => setAlertPrice(e.target.value)}
                      inputMode="decimal"
                      className="w-24 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand"
                    />
                    <button
                      onClick={() => saveAlert(item.symbol)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-brand text-white hover:opacity-90 transition"
                    >
                      Uložit
                    </button>
                    <button
                      onClick={() => setEditingSymbol(null)}
                      className="text-xs px-2 py-1.5 rounded-lg text-muted hover:bg-panel2 transition"
                    >
                      Zrušit
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {notifPerm === "default" && (
          <button
            onClick={requestNotifPermission}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-line text-muted hover:bg-panel2 transition"
          >
            🔔 Povolit notifikace v prohlížeči
          </button>
        )}
        {notifPerm === "granted" && (
          <span className="text-xs text-muted">🔔 Notifikace povoleny — přijdou i při obnovení na pozadí.</span>
        )}
        {notifPerm === "denied" && (
          <span className="text-xs text-muted">🔕 Notifikace zablokovány v nastavení prohlížeče.</span>
        )}
      </div>
      <p className="text-muted text-[11px] mt-2">
        Alert se kontroluje při načtení stránky a při automatickém obnovení cen (každých 5 min, jen
        dokud je tahle záložka otevřená). Když povolíš notifikace, appka při dosažení cíle pošle i
        systémovou notifikaci Chromu.
        <InfoTip text="Appka nemá backend běžící na pozadí, takže notifikace nepřijde, když je záložka úplně zavřená. Funguje, dokud běží prohlížeč (i na pozadí/jiné kartě) a appka je otevřená alespoň v jedné záložce." />
      </p>
    </div>
  );
}
