"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PLAN_HEIGHT, PLAN_WIDTH, zoningPlanCityView, zoningPlanSvg } from '@/lib/scenarios/zoningPlan';

/** A small picture of the 2D land-use plan that opens it full screen. */
export function ZoningPlanThumbnail({ year, onOpen }: { year: number; onOpen(): void }) {
  // Cropped to the city: the plan's frame also holds the suburbium and the Campagna.
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(zoningPlanSvg(year).replace(/viewBox="[^"]*"/, `viewBox="${zoningPlanCityView()}"`))}`, [year]);
  return <button aria-label="Open the 2D land-use plan" className="mt-3 flex w-full items-center gap-3 rounded-xl border border-white/10 p-1.5 text-left hover:border-accent" onClick={onOpen}>
    {/* eslint-disable-next-line @next/next/no-img-element -- an inline data URL, nothing to optimise */}
    <img src={src} alt="" className="h-16 w-16 shrink-0 rounded-lg" />
    <span className="text-[11px] leading-snug text-white/65"><span className="text-accent">2D plan · land use c. AD {year}</span><br />Zones, markers and the continuous city. Tap to open.</span>
  </button>;
}

/**
 * The 2D land-use plan full screen, drawn from the zoning data. A zone, marker or the city outline opens its evidence card; features
 * dated after the viewing year are hatched. Escape or ✕ closes it.
 */
export function ZoningPlanView({ year, onInspect, onClose }: { year: number; onInspect(id: string): void; onClose(): void }) {
  const svg = useMemo(() => zoningPlanSvg(year), [year]);
  return <PlanDialog title={`2D plan · land use c. AD ${year}`} label={`2D plan, land use c. AD ${year}`} hint="Tap a zone, marker or the city outline for its evidence"
    svg={svg} width={PLAN_WIDTH} height={PLAN_HEIGHT} onInspect={onInspect} onClose={onClose}/>;
}

/**
 * The full-screen, zoomable plan dialog shared by the land-use plan and the general plan review (PlanReviewView). `svg` is generated
 * by the app from its own data; a click on an element with `data-id` calls `onInspect`. `aside` is shown beside the plan.
 */
export function PlanDialog({ title, label, hint, svg, width, height, onInspect, onClose, aside }: { title: string; label: string; hint: string; svg: string; width: number; height: number; onInspect(id: string): void; onClose(): void; aside?: ReactNode }) {
  const [scale, setScale] = useState(1), scroller = useRef<HTMLDivElement>(null), centre = useRef<[number, number] | null>(null);
  // Zoom about the middle of the view: remember which fraction of the plan is centred, and scroll back to it once resized.
  const zoom = (factor: number) => {
    const el = scroller.current;
    if (el) centre.current = [(el.scrollLeft + el.clientWidth / 2) / el.scrollWidth, (el.scrollTop + el.clientHeight / 2) / el.scrollHeight];
    setScale(s => Math.min(4, Math.max(1, s * factor)));
  };
  useLayoutEffect(() => {
    const el = scroller.current, c = centre.current;
    if (!el || !c) return;
    el.scrollLeft = c[0] * el.scrollWidth - el.clientWidth / 2; el.scrollTop = c[1] * el.scrollHeight - el.clientHeight / 2; centre.current = null;
  }, [scale]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const button = 'rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-white/80 hover:border-accent hover:text-white';
  return <div role="dialog" aria-modal="true" aria-label={label} className="pointer-events-auto fixed inset-0 z-[25] flex flex-col bg-black/75 p-3 backdrop-blur-sm sm:p-6">
    <div className="mb-2 flex items-center gap-2 text-white">
      <h2 className="text-sm font-medium">{title}</h2>
      <span className="hidden text-[11px] text-white/50 sm:inline">{hint}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <button className={button} aria-label="Zoom the plan out" onClick={() => zoom(1 / 1.5)} disabled={scale <= 1}>−</button>
        <button className={button} aria-label="Zoom the plan in" onClick={() => zoom(1.5)}>+</button>
        <button className={button} aria-label="Close the 2D plan" onClick={onClose}>✕</button>
      </span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto rounded-xl" onClick={event => { const id = (event.target as Element).closest('[data-id]')?.getAttribute('data-id'); if (id) onInspect(id); }}>
        <div className="mx-auto [&_[data-id]]:cursor-pointer [&_[data-id]:hover]:opacity-80 [&_svg]:h-full [&_svg]:w-full" style={{ aspectRatio: `${width} / ${height}`, width: `calc(${scale} * min(100%, (100dvh - 6.5rem) * ${width / height}))` }}
          // The plan is generated here from the app's own data; nothing user-supplied goes into it.
          dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {aside}
    </div>
  </div>;
}
