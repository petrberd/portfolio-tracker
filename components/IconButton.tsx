"use client";

/** Small icon button with a hover tooltip — same visual style as InfoTip's tooltip box. */
export function IconButton({
  onClick,
  label,
  tooltip,
  children,
}: {
  onClick: () => void;
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex group">
      <button
        onClick={onClick}
        aria-label={label}
        className="w-7 h-7 inline-flex items-center justify-center rounded-full text-muted hover:text-white hover:bg-panel2 transition text-sm leading-none shrink-0"
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 bottom-full mb-2 w-max max-w-[200px] px-2.5 py-1.5 rounded-lg bg-panel2 border border-line text-[11px] font-normal normal-case tracking-normal leading-snug text-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-xl"
      >
        {tooltip}
      </span>
    </span>
  );
}
