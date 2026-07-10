"use client";

/** Small "i" icon that reveals an explanatory tooltip on hover. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group align-middle ml-1">
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-muted/50 text-muted text-[9px] font-semibold leading-none cursor-help select-none normal-case">
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max max-w-[180px] sm:max-w-[230px] px-2.5 py-1.5 rounded-lg bg-panel2 border border-line text-[11px] font-normal normal-case tracking-normal leading-snug text-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-xl"
      >
        {text}
      </span>
    </span>
  );
}
