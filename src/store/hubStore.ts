// ─────────────────────────────────────────────────────────────────
//  hubStore — which hub the player picked, plus hubs they added.
//  Persisted under 'bow-game-hub-v1'. Only hub URLs live here; the
//  chia-gaming client keeps its own session and channel state.
// ─────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BUILT_IN_HUBS, normalizeHubUrl, type HubInfo } from '../lib/gameHub';

interface HubState {
  selectedHubId: string | null;
  customHubs: HubInfo[];
  /** true while the embedded game client is open */
  playing: boolean;

  selectHub: (id: string) => void;
  /** Returns an error message, or null on success. */
  addCustomHub: (name: string, url: string) => string | null;
  removeCustomHub: (id: string) => void;
  setPlaying: (playing: boolean) => void;
}

export const useHubStore = create<HubState>()(
  persist(
    (set, get) => ({
      selectedHubId: BUILT_IN_HUBS[0]?.id ?? null,
      customHubs: [],
      playing: false,

      selectHub: (id) => set({ selectedHubId: id }),

      addCustomHub: (name, url) => {
        const origin = normalizeHubUrl(url);
        if (!origin) return 'Enter an https:// hub address.';
        const all = [...BUILT_IN_HUBS, ...get().customHubs];
        if (all.some((h) => h.id === origin)) return 'That hub is already in the list.';
        const hub: HubInfo = { id: origin, name: name.trim() || new URL(origin).hostname, url: origin, custom: true };
        set({ customHubs: [...get().customHubs, hub], selectedHubId: hub.id });
        return null;
      },

      removeCustomHub: (id) => {
        const customHubs = get().customHubs.filter((h) => h.id !== id);
        const selectedHubId = get().selectedHubId === id ? (BUILT_IN_HUBS[0]?.id ?? null) : get().selectedHubId;
        set({ customHubs, selectedHubId });
      },

      setPlaying: (playing) => set({ playing }),
    }),
    {
      name: 'bow-game-hub-v1',
      partialize: (s) => ({ selectedHubId: s.selectedHubId, customHubs: s.customHubs }),
    },
  ),
);

export function allHubs(customHubs: HubInfo[]): HubInfo[] {
  return [...BUILT_IN_HUBS, ...customHubs];
}
