"use client";

import { useEnvironmentStore } from "@/state/environmentStore";
import styles from "@/map/environment/styles.json";
import type { EnvironmentClass } from "@/map/environment/model";

export function EnvironmentPanel() {
  const { visibility, setVisible, unavailable } = useEnvironmentStore();
  return (
    <aside aria-label="Environmental reference layers" className="absolute left-4 top-20 z-10 max-w-[280px] rounded-lg border border-white/10 bg-[#0a121c]/90 p-3 text-xs text-slate-300 backdrop-blur-sm sm:left-6">
      <p className="text-[10px] tracking-[0.16em] text-amber-200/80">PROVISIONAL ENVIRONMENT</p>
      <p className="mt-1 leading-relaxed text-white/55">Natural ground materials & modern rivers.<br />Not reconstructed for the selected year.</p>
      {unavailable && <p role="status" className="mt-2 text-amber-200">Some environmental tiles are unavailable. Material failures restore the biome reference; uncovered areas retain neutral terrain.</p>}
      <details className="mt-2">
        <summary className="cursor-pointer text-white/75">Layers & evidence</summary>
        <div className="mt-3 grid gap-2">
          {(Object.keys(styles) as EnvironmentClass[]).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={visibility[key]} disabled={key === "ice"} onChange={(e) => setVisible(key, e.target.checked)} className="accent-amber-300" />
              <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: styles[key].color }} />
              <span className={key === "ice" ? "text-white/35" : ""}>{styles[key].label}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 leading-relaxed text-white/50">Modern ecological fallback; Beyer and CHELSA are not loaded. Regional ecological units, not ancient vegetation boundaries. Sahara retreat, forest clearance, wetlands and lake levels are unresolved. Tundra, rock and ice remain neutral. Material detail is procedural, not observed historical detail. No timeline interpolation.</p>
        <p className="mt-2 leading-relaxed text-white/50">Wetlands show flooded grasslands and mangroves only. Hydrography uses modern major rivers and natural lakes; reservoirs excluded.</p>
        <p className="mt-2 leading-relaxed">
          <a className="underline" href="https://ecoregions.world/" target="_blank" rel="noreferrer">RESOLVE 2017</a> · <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · reclassified & rasterised.<br />
          <a className="underline" href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth 1:50m</a> · public domain.
        </p>
      </details>
    </aside>
  );
}
