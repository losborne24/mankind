import { create } from "zustand";
import type { EnvironmentClass } from "@/map/environment/model";

interface EnvironmentSettings {
  visibility: Record<EnvironmentClass, boolean>;
  unavailable: boolean;
  setVisible: (key: EnvironmentClass, visible: boolean) => void;
  setUnavailable: (unavailable: boolean) => void;
}
export const useEnvironmentStore = create<EnvironmentSettings>((set) => ({
  visibility: { forest: true, grassland: true, shrubland: true, desert: true, wetland: true, water: true, ice: false },
  unavailable: false,
  setVisible: (key, visible) => set((s) => ({ visibility: { ...s.visibility, [key]: visible } })),
  setUnavailable: (unavailable) => set({ unavailable }),
}));
