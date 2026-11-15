import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

/** At most this many thread tabs; opening one more drops the least recently opened. */
export const MAX_THREAD_TABS = 8;

export interface ThreadTab {
  readonly ref: ScopedThreadRef;
  readonly openedAt: number;
}

const isThreadRef = Schema.is(ScopedThreadRef);

const sameRef = (a: ScopedThreadRef, b: ScopedThreadRef) =>
  scopedThreadKey(a) === scopedThreadKey(b);

/** Marks a thread as just opened: refreshes its tab in place, or appends a new one. */
export function openThreadTab(
  tabs: readonly ThreadTab[],
  ref: ScopedThreadRef,
  now: number,
): readonly ThreadTab[] {
  if (tabs.some((tab) => sameRef(tab.ref, ref))) {
    return tabs.map((tab) => (sameRef(tab.ref, ref) ? { ref: tab.ref, openedAt: now } : tab));
  }
  const next = [...tabs, { ref, openedAt: now }];
  while (next.length > MAX_THREAD_TABS) {
    let oldest = 0;
    for (let index = 1; index < next.length; index++) {
      if (next[index]!.openedAt < next[oldest]!.openedAt) oldest = index;
    }
    next.splice(oldest, 1);
  }
  return next;
}

export function closeThreadTabs(
  tabs: readonly ThreadTab[],
  shouldClose: (ref: ScopedThreadRef) => boolean,
): readonly ThreadTab[] {
  const next = tabs.filter((tab) => !shouldClose(tab.ref));
  return next.length === tabs.length ? tabs : next;
}

/** Moves the tab with `fromKey` to where `toKey` sits, as a drag drop does. */
export function moveThreadTab(
  tabs: readonly ThreadTab[],
  fromKey: string,
  toKey: string,
): readonly ThreadTab[] {
  const from = tabs.findIndex((tab) => scopedThreadKey(tab.ref) === fromKey);
  const to = tabs.findIndex((tab) => scopedThreadKey(tab.ref) === toKey);
  if (from === -1 || to === -1 || from === to) return tabs;
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** The tab to show after closing `closedKey` while it was active: its right neighbour, else its left. */
export function neighbourAfterClose(
  tabs: readonly ThreadTab[],
  closedKey: string,
): ScopedThreadRef | null {
  const index = tabs.findIndex((tab) => scopedThreadKey(tab.ref) === closedKey);
  if (index === -1) return null;
  return (tabs[index + 1] ?? tabs[index - 1])?.ref ?? null;
}

interface ThreadTabsState {
  tabs: readonly ThreadTab[];
  open: (ref: ScopedThreadRef) => void;
  close: (shouldClose: (ref: ScopedThreadRef) => boolean) => void;
  move: (fromKey: string, toKey: string) => void;
}

export const useThreadTabsStore = create<ThreadTabsState>()(
  persist(
    (set) => ({
      tabs: [],
      open: (ref) => set((state) => ({ tabs: openThreadTab(state.tabs, ref, Date.now()) })),
      close: (shouldClose) => set((state) => ({ tabs: closeThreadTabs(state.tabs, shouldClose) })),
      move: (fromKey, toKey) =>
        set((state) => ({ tabs: moveThreadTab(state.tabs, fromKey, toKey) })),
    }),
    {
      name: "synthia:thread-tabs:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: (state) => ({ tabs: state.tabs }),
      // Stored tabs are checked on every load, so a corrupt entry never reaches the strip.
      merge: (persisted, current) => {
        const tabs = (persisted as { tabs?: unknown } | null)?.tabs;
        return {
          ...current,
          tabs: Array.isArray(tabs)
            ? tabs
                .filter(
                  (tab): tab is ThreadTab =>
                    isThreadRef((tab as ThreadTab | null)?.ref) &&
                    typeof (tab as ThreadTab).openedAt === "number",
                )
                .slice(0, MAX_THREAD_TABS)
            : [],
        };
      },
    },
  ),
);
