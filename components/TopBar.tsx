"use client";

/**
 * Compact cinematic top bar: a provisional wordmark and a non-functional
 * location/search placeholder (wired up in a later phase).
 */
export function TopBar() {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <div className="pointer-events-auto flex items-baseline gap-2 select-none">
        <span className="text-sm font-semibold tracking-[0.35em] text-white sm:text-base">
          MANKIND
        </span>
        <span className="hidden text-[10px] uppercase tracking-widest text-white/40 sm:inline">
          a living historical world
        </span>
      </div>

      <div className="pointer-events-auto w-40 sm:w-64">
        <input
          type="search"
          disabled
          placeholder="Search a place…"
          aria-label="Search a place (coming soon)"
          className="w-full cursor-not-allowed rounded-full border border-panel-border bg-panel px-4 py-1.5 text-sm text-white/60 placeholder:text-white/30 backdrop-blur-md"
        />
      </div>
    </header>
  );
}
