"use client";

import { useEffect, useState } from "react";
import type { Map } from "maplibre-gl";
import {
  DEFAULT_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATIONS,
  TERRAIN_SOURCE,
} from "@/map/mapStyle";

import {
  attachDiagnosticHillshade, DEFAULT_GLOBAL_HILLSHADE_STRENGTH,
  GLOBAL_HILLSHADE_STRENGTH, LOCAL_HILLSHADE_STRENGTH,
} from "@/map/hillshade";
import { attachBiomes, BIOME_BASE_URL } from "@/map/biomes";

import type { RomanTestStatus } from "@/map/threeTestLayer";
import { ROMAN_TEST_CENTER } from "@/map/romanTestScene";

import type { SettlementStatus } from "@/map/settlements/SettlementScene";
import { ROMAN_SETTLEMENT, ROMAN_SETTLEMENT_ALTERNATE, type Coordinate } from "@/map/settlements/romanSettlement";

import type { GenerationResult } from "@/map/settlements/proceduralSettlement";

import { DEFAULT_AMBIENT_LIFE, type AmbientLifeOptions } from "@/map/settlements/AmbientLifeView";

interface DebugPanelProps {
  onAmbientLife: (options: AmbientLifeOptions) => void;
  proceduralStatus: GenerationResult | null;
  onVisitProcedural: (seed: number, origin?: Coordinate) => void;
  map: Map | null;
  terrainWarning: boolean;
  romanStatus: RomanTestStatus;
  settlementStatus: SettlementStatus;
  onSettlementEnabled: (enabled: boolean) => void;
  onVisitSettlement: (origin?: Coordinate) => void;
  onRomanTestEnabled: (enabled: boolean) => void;
  onRetryTerrain: () => void;
}

/** Shared debug panel; add future map controls as separate fieldsets here. */
export function DebugPanel({ onAmbientLife, map, terrainWarning, onRetryTerrain, romanStatus, onRomanTestEnabled, settlementStatus, onSettlementEnabled, onVisitSettlement, proceduralStatus, onVisitProcedural }: DebugPanelProps) {
  const [life, setLife] = useState({ ...DEFAULT_AMBIENT_LIFE });
  const changeLife = (patch: Partial<AmbientLifeOptions>) => { const next = {...life,...patch}; setLife(next); onAmbientLife(next); };
  const [proceduralSeed, setProceduralSeed] = useState("7");
  const [proceduralNearby, setProceduralNearby] = useState(false);
  const seedValid = proceduralSeed.trim() !== "" && Number.isSafeInteger(Number(proceduralSeed));
  const [exaggeration, setExaggeration] = useState(DEFAULT_TERRAIN_EXAGGERATION);
  const [diagnosticShading, setDiagnosticShading] = useState(true);
  const [hillshadeIntensity, setHillshadeIntensity] = useState(0.25);
  const [globalHillshadeStrength, setGlobalHillshadeStrength] = useState(DEFAULT_GLOBAL_HILLSHADE_STRENGTH);
  const [biomesEnabled, setBiomesEnabled] = useState(Boolean(BIOME_BASE_URL));
  const [biomeWarning, setBiomeWarning] = useState("");

  useEffect(() => {
    if (!map || !biomesEnabled) return;
    const controller = new AbortController();
    let detach: (() => void) | undefined;
    void attachBiomes(map, controller.signal).then((cleanup) => {
      if (controller.signal.aborted) cleanup();
      else { detach = cleanup; setBiomeWarning(""); }
    }).catch(() => {
      if (!controller.signal.aborted) setBiomeWarning("Biome tiles unavailable. Showing dark atlas. Toggle to retry.");
    });
    return () => { controller.abort(); detach?.(); };
  }, [map, biomesEnabled]);

  useEffect(() => {
    if (!map || !diagnosticShading) return;
    return attachDiagnosticHillshade(map);
  }, [map, diagnosticShading]);

  useEffect(() => {
    map?.setGlobalStateProperty(GLOBAL_HILLSHADE_STRENGTH, globalHillshadeStrength);
    map?.setGlobalStateProperty(LOCAL_HILLSHADE_STRENGTH, hillshadeIntensity);
  }, [map, globalHillshadeStrength, hillshadeIntensity]);

  return (
    <details open className="absolute top-16 left-4 z-20 max-h-[calc(100%-12rem)] w-56 overflow-y-auto rounded-lg border border-panel-border bg-panel p-3 text-xs text-white/70 backdrop-blur-md sm:left-6">
      <summary className="cursor-pointer tracking-wide">Debug tools</summary>
      <fieldset disabled={!map} className="disabled:opacity-50">
        <legend className="mt-3 text-white/40">Terrain</legend>
        <label className="mt-3 flex items-center justify-between gap-3">
          Elevation exaggeration
          <select
            aria-label="Elevation exaggeration"
            value={exaggeration}
            className="rounded border border-panel-border bg-background p-1 text-white"
            onChange={(event) => {
              const value = Number(event.target.value);
              map?.setTerrain({ source: TERRAIN_SOURCE, exaggeration: value });
              setExaggeration(value);
            }}
          >
            {TERRAIN_EXAGGERATIONS.map((value) => (
              <option key={value} value={value}>{value.toFixed(1)}×</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-white/40">Mapterhorn · physical elevation</p>
        <label className="mt-3 flex items-center gap-2">
          <input type="checkbox" checked={biomesEnabled} onChange={(event) => setBiomesEnabled(event.target.checked)} />
          Biome colours
        </label>
        {biomesEnabled && biomeWarning && <p role="status" className="mt-2 text-amber-200/80">{biomeWarning}</p>}
        <label className="mt-3 flex items-center gap-2">
          <input type="checkbox" checked={diagnosticShading} onChange={(event) => {
            setDiagnosticShading(event.target.checked);
          }} />
          Hillshade
        </label>
        <label className="mt-3 block">
          Hillshade intensity · {hillshadeIntensity.toFixed(2)}
          <input className="mt-1 w-full" aria-label="Hillshade intensity" type="range" min="0" max="0.6" step="0.05" value={hillshadeIntensity}
            onChange={(event) => setHillshadeIntensity(Number(event.target.value))} />
        </label>
        <label className="mt-3 block">
          Global hillshade strength · {globalHillshadeStrength.toFixed(2)}
          <input className="mt-1 w-full" aria-label="Global hillshade strength" type="range" min="0" max="1" step="0.05" value={globalHillshadeStrength}
            onChange={(event) => setGlobalHillshadeStrength(Number(event.target.value))} />
        </label>
        <p className="mt-1 text-white/40">Global relief blends into regional detail from zoom 4 to 6.</p>
      </fieldset>
      <fieldset disabled={!map} className="mt-3 border-t border-panel-border pt-2 disabled:opacity-50">
        <legend className="text-white/40">Roman integration test</legend>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={romanStatus.state !== "disabled"}
            onChange={(event) => onRomanTestEnabled(event.target.checked)} />
          Roman models
        </label>
        <button className="mt-2 underline" onClick={() => {
          if (romanStatus.state === "disabled") onRomanTestEnabled(true);
          map?.flyTo({ center: [...ROMAN_TEST_CENTER], zoom: 19, pitch: 55, bearing: -25 });
        }}>Visit Roman test</button>
        <p className="mt-2 text-white/40">Prototype placement near Giza; no historical claim. Metre-scale models appear at close zoom.</p>
        <p role="status" className="mt-2">{romanStatus.state === "waiting" ? "Visit the test to load models." :
          romanStatus.state === "disabled" ? "Models unloaded." : `${romanStatus.loaded}/3 models · ${romanStatus.state}`}</p>
        {romanStatus.errors.length > 0 && <>
          <p className="mt-2 text-amber-200/80">Models unavailable. Check asset URLs and try again.</p>
          <ul className="mt-1 break-words text-amber-200/80">{romanStatus.errors.map((error) => <li key={error}>{error}</li>)}</ul>
          <button className="mt-2 underline" onClick={() => { onRomanTestEnabled(false); onRomanTestEnabled(true); }}>Retry models</button>
        </>}
      </fieldset>
      <fieldset disabled={!map} className="mt-3 border-t border-panel-border pt-2 disabled:opacity-50">
        <legend className="text-white/40">Settlement rendering · fictional/debug</legend>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={!proceduralStatus && settlementStatus.state !== "unloaded"}
            onChange={(event) => event.target.checked ? onVisitSettlement() : onSettlementEnabled(false)} />
          Hand-authored reference scene
        </label>
        <button className="mt-2 block underline" onClick={() => onVisitSettlement()}>Visit settlement</button>
        <button className="mt-2 block underline" onClick={() => onVisitSettlement(
          settlementStatus.origin[0] === ROMAN_SETTLEMENT.origin[0] ? ROMAN_SETTLEMENT_ALTERNATE : ROMAN_SETTLEMENT.origin,
        )}>Relocate nearby</button>
        <p role="status" className="mt-2">{settlementStatus.loaded}/{settlementStatus.total} buildings · {settlementStatus.state}</p>
        <p className="mt-1 text-white/40">{settlementStatus.sceneryLoaded}/{settlementStatus.sceneryTotal} scenery instances · sun shadows</p>
        <p className="mt-1 text-white/40">{settlementStatus.origin.map((value) => value.toFixed(4)).join(", ")} · Generic prototype near Rome.</p>
        {settlementStatus.terrainPending > 0 && <p className="mt-2 text-amber-200/80">Waiting for terrain on {settlementStatus.terrainPending} surfaces. Unknown ground stays hidden.</p>}
        {settlementStatus.terrainRetained > 0 && <p className="mt-2 text-amber-200/80">Terrain updating; retaining known heights on {settlementStatus.terrainRetained} surfaces.</p>}
        {settlementStatus.scenerySteep > 0 && <p className="mt-2 text-amber-200/80">{settlementStatus.scenerySteep} rigid props hidden on steep ground.</p>}
        {settlementStatus.steepSites > 0 && <p className="mt-2 text-amber-200/80">{settlementStatus.steepSites} building sites exceed the foundation height limit and are hidden.</p>}
        {settlementStatus.errors.length > 0 && <>
          <ul className="mt-2 break-words text-amber-200/80">{settlementStatus.errors.map((error) => <li key={error}>{error}</li>)}</ul>
          <button className="mt-2 underline" onClick={() => { onSettlementEnabled(false); onSettlementEnabled(true); }}>Retry settlement</button>
        </>}
        <p className="mt-2 text-white/40">Project-owned Roman architecture, level foundations and Mediterranean scenery. No historical reconstruction claimed.</p>
      </fieldset>
      <fieldset disabled={!map} className="mt-3 border-t border-panel-border pt-2 disabled:opacity-50">
        <legend className="text-white/40">Procedural Roman village · fictional</legend>
        <label className="mt-2 block">Seed
          <input aria-label="Procedural settlement seed" className="mt-1 w-full rounded border border-panel-border bg-background p-1"
            value={proceduralSeed} onChange={(event) => setProceduralSeed(event.target.value)} inputMode="numeric" />
        </label>
        {!seedValid && <p className="mt-1 text-amber-200/80">Enter a safe integer seed.</p>}
        <button disabled={!seedValid} className="mt-2 block underline disabled:opacity-40" onClick={() => {
          setProceduralNearby(false); onVisitProcedural(Number(proceduralSeed));
        }}>Visit procedural settlement</button>
        <button disabled={!seedValid} className="mt-2 block underline disabled:opacity-40" onClick={() => onVisitProcedural(Number(proceduralSeed), proceduralNearby ? ROMAN_SETTLEMENT_ALTERNATE : ROMAN_SETTLEMENT.origin)}>Regenerate settlement</button>
        <button disabled={!seedValid} className="mt-2 block underline disabled:opacity-40" onClick={() => {
          setProceduralNearby(!proceduralNearby); onVisitProcedural(Number(proceduralSeed), proceduralNearby ? ROMAN_SETTLEMENT.origin : ROMAN_SETTLEMENT_ALTERNATE);
        }}>Relocate procedural nearby</button>
        <button className="mt-2 block underline" onClick={() => onVisitSettlement()}>Return to hand-authored reference</button>
        <button className="mt-2 block underline" disabled={!proceduralStatus} onClick={() => onSettlementEnabled(false)}>Unload procedural settlement</button>
        <p role="status" className="mt-2">{proceduralStatus ? `Seed ${proceduralStatus.seed} · ${proceduralStatus.accepted}/${proceduralStatus.requested} buildings · ${proceduralStatus.state}` : "Procedural scene unloaded."}</p>
        {proceduralStatus && <>
          <p className="mt-1">Terrain {proceduralStatus.terrainReady ? "confirmed" : "pending"} · {proceduralStatus.rejected} rejected plots</p>
          <p className="mt-1">Navigation: {proceduralStatus.navigation.nodes.length} nodes · {proceduralStatus.navigation.edges.length} edges</p>
          <p className="mt-1 text-white/40">{proceduralStatus.message}</p>
        </>}
        <label className="mt-3 block"><input type="checkbox" checked={life.enabled} onChange={e => changeLife({enabled:e.target.checked})} /> Ambient life</label>
        <label className="mt-2 block">Villagers: {life.count}<input aria-label="Villager count" type="range" min="0" max="5" value={life.count} onChange={e => changeLife({count:Number(e.target.value)})} /></label>
        <label className="mt-2 block"><input type="checkbox" checked={life.paths} onChange={e => changeLife({paths:e.target.checked})} /> Show walking graph</label>
        <p role="status" className="mt-2">{settlementStatus.ambientLife?.active ?? 0} active · {settlementStatus.ambientLife?.walking ?? 0} walking · {settlementStatus.ambientLife?.idle ?? 0} idle{settlementStatus.ambientLife?.paused ? " · paused" : ""}</p>
        <p className="mt-2 text-white/40">Fictional debug scenes; independent of historical timeline filtering.</p>
      </fieldset>
      {terrainWarning && (
        <p role="status" className="mt-2 text-amber-200/80">
          Some elevation tiles could not load. Terrain may be incomplete.
          <button className="mt-2 block underline" onClick={onRetryTerrain}>Retry elevation tiles</button>
        </p>
      )}
    </details>
  );
}
