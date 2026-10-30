"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { HistoricalDatasetSession } from '@/lib/history/session';
import type { ScenarioPlayer } from '@/lib/scenarios/player';

const Context = createContext<{ player: ScenarioPlayer | null; setPlayer: (player: ScenarioPlayer | null) => void; historicalSession: HistoricalDatasetSession | null; setHistoricalSession: (session: HistoricalDatasetSession | null) => void }>({ player: null, setPlayer: () => {}, historicalSession: null, setHistoricalSession: () => {} });
export function ScenarioProvider({ children }: { children: ReactNode }) {
    const [player, setPlayer] = useState<ScenarioPlayer | null>(null);
    const [historicalSession, setHistoricalSession] = useState<HistoricalDatasetSession | null>(null);
    return <Context.Provider value={{ player, setPlayer, historicalSession, setHistoricalSession }}>{children}</Context.Provider>;
}
export const useScenarioController = () => useContext(Context);
const subscribeEmpty = () => () => {};
const empty = () => null;
export function useScenario() {
    const { player } = useContext(Context);
    const snapshot = useSyncExternalStore(player?.subscribe ?? subscribeEmpty, player?.getSnapshot ?? empty, player?.getSnapshot ?? empty);
    return { player, snapshot };
}

export function useHistoricalDataset() {
    const { historicalSession } = useContext(Context);
    const snapshot = useSyncExternalStore(historicalSession?.subscribe ?? subscribeEmpty, historicalSession?.getSnapshot ?? empty, historicalSession?.getSnapshot ?? empty);
    return { session: historicalSession, snapshot };
}
