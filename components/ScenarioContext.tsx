"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ScenarioPlayer } from '@/lib/scenarios/player';

const Context = createContext<{ player: ScenarioPlayer | null; setPlayer: (player: ScenarioPlayer | null) => void }>({ player: null, setPlayer: () => {} });
export function ScenarioProvider({ children }: { children: ReactNode }) {
    const [player, setPlayer] = useState<ScenarioPlayer | null>(null);
    return <Context.Provider value={{ player, setPlayer }}>{children}</Context.Provider>;
}
export const useScenarioController = () => useContext(Context);
const subscribeEmpty = () => () => {};
const empty = () => null;
export function useScenario() {
    const { player } = useContext(Context);
    const snapshot = useSyncExternalStore(player?.subscribe ?? subscribeEmpty, player?.getSnapshot ?? empty, player?.getSnapshot ?? empty);
    return { player, snapshot };
}
