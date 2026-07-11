"use client";

import { useEffect, useRef, useState } from "react";

/** Small "i" icon that reveals an explanatory tooltip on hover (desktop) or tap (touch). */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex group align-middle ml-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Vysvětlivka"
        aria-expanded={open}
        className="w-6 h-6 -m-1 inline-flex items-center justify-center rounded-full text-muted cursor-help select-none normal-case"
      >
        <span className="w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-muted/50 text-[9px] font-semibold leading-none">
          i
        </span>
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max max-w-[180px] sm:max-w-[230px] px-2.5 py-1.5 rounded-lg bg-panel2 border border-line text-[11px] font-normal normal-case tracking-normal leading-snug text-white/90 transition-opacity duration-150 z-50 shadow-xl ${
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
