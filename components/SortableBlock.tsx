"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Wraps one draggable dashboard block (a Section, or a cluster of a few
 * Sections sharing a desktop grid row) with a small grip handle. Only the
 * handle itself is a drag target — not the whole block — so existing controls
 * inside (toggles, hide button, table row clicks) keep working untouched.
 */
export function SortableBlock({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative opacity-40 z-10" : "relative"}
    >
      <div className="flex items-center h-5 mb-1.5">
        <button
          {...attributes}
          {...listeners}
          aria-label="Přesunout sekci (táhni pro změnu pořadí)"
          title="Přetáhni pro změnu pořadí"
          className="text-muted/60 hover:text-muted cursor-grab active:cursor-grabbing w-7 h-5 inline-flex items-center justify-center rounded transition-colors [touch-action:none]"
        >
          ⠿
        </button>
      </div>
      {children}
    </div>
  );
}
