import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  MAX_THREAD_TABS,
  closeThreadTabs,
  moveThreadTab,
  neighbourAfterClose,
  openThreadTab,
  type ThreadTab,
} from "./threadTabsStore";

const env = EnvironmentId.make("env-1");
const ref = (id: string) => scopeThreadRef(env, ThreadId.make(id));
const ids = (tabs: readonly ThreadTab[]) => tabs.map((tab) => tab.ref.threadId as string);

describe("openThreadTab", () => {
  it("appends a new thread and refreshes a known one in place", () => {
    let tabs = openThreadTab([], ref("a"), 1);
    tabs = openThreadTab(tabs, ref("b"), 2);
    tabs = openThreadTab(tabs, ref("a"), 3);
    expect(ids(tabs)).toEqual(["a", "b"]);
    expect(tabs[0]?.openedAt).toBe(3);
  });

  it("drops the least recently opened tab past the limit, wherever it sits", () => {
    let tabs: readonly ThreadTab[] = [];
    for (let index = 0; index < MAX_THREAD_TABS; index++) {
      tabs = openThreadTab(tabs, ref(`t${index}`), index + 10);
    }
    // Re-open the first tab so the second becomes the oldest.
    tabs = openThreadTab(tabs, ref("t0"), 100);
    tabs = openThreadTab(tabs, ref("new"), 101);
    expect(tabs).toHaveLength(MAX_THREAD_TABS);
    expect(ids(tabs)).not.toContain("t1");
    expect(ids(tabs)[0]).toBe("t0");
    expect(ids(tabs).at(-1)).toBe("new");
  });
});

describe("tab editing", () => {
  const tabs = ["a", "b", "c", "d"].map((id, index) => ({ ref: ref(id), openedAt: index }));
  const key = (id: string) => scopedThreadKey(ref(id));

  it("moves a dragged tab to the drop target's place", () => {
    expect(ids(moveThreadTab(tabs, key("a"), key("c")))).toEqual(["b", "c", "a", "d"]);
    expect(ids(moveThreadTab(tabs, key("d"), key("a")))).toEqual(["d", "a", "b", "c"]);
    expect(moveThreadTab(tabs, key("a"), key("missing"))).toBe(tabs);
  });

  it("closes the chosen tabs", () => {
    expect(ids(closeThreadTabs(tabs, (tabRef) => tabRef.threadId !== "b"))).toEqual(["b"]);
    expect(closeThreadTabs(tabs, () => false)).toBe(tabs);
  });

  it("falls back to the right neighbour, then the left one", () => {
    expect(neighbourAfterClose(tabs, key("b"))?.threadId).toBe("c");
    expect(neighbourAfterClose(tabs, key("d"))?.threadId).toBe("c");
    expect(neighbourAfterClose(tabs.slice(0, 1), key("a"))).toBeNull();
  });
});
