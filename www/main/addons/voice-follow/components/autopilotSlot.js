import { useSyncExternalStore } from 'react';

// The search pane hands Voice-Follow a DOM node to render the autopilot pane into. Voice-Follow
// itself stays mounted in the Launchpad (its session outlives the pane), so the node is shared
// through this tiny store rather than through the component tree.
let slot = null;
const listeners = new Set();

export const setAutopilotSlot = (node) => {
  if (slot === node) return;
  slot = node;
  listeners.forEach((l) => l());
};

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useAutopilotSlot = () => useSyncExternalStore(subscribe, () => slot);
