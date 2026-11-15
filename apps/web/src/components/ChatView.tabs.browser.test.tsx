import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// Loading ChatView takes seconds; importing it here keeps that out of the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import { useThreadTabsStore } from "~/threadTabsStore";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

it("keeps opened threads as title bar tabs and closes one to its neighbour", async () => {
  const first = threadWithHistory("tab-first", 1);
  const second = threadWithHistory("tab-second", 1);
  using _environment = installFakeEnvironment([first, second]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  useThreadTabsStore.setState({ tabs: [] });

  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${first.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });
  await expect.element(page.getByText("tab-first: question 0")).toBeVisible();
  await router.navigate({
    to: "/$environmentId/$threadId",
    params: { environmentId: ENVIRONMENT_ID, threadId: second.id },
  });
  await expect.element(page.getByText("tab-second: question 0")).toBeVisible();

  const tabs = page.getByRole("tablist", { name: "Open threads" }).getByRole("tab");
  await expect.poll(() => tabs.elements().length).toBe(2);
  await expect
    .element(page.getByRole("tab", { name: new RegExp(second.title) }))
    .toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: `Close ${second.title}` }).click();
  await expect.element(page.getByText("tab-first: question 0")).toBeVisible();
  await expect.poll(() => tabs.elements().length).toBe(1);
  expect(useThreadTabsStore.getState().tabs.map((tab) => tab.ref.threadId)).toEqual([first.id]);
});

it("keeps one window-wide background under a glass sidebar while switching threads", async () => {
  const first = threadWithHistory("glass-first", 1);
  const second = threadWithHistory("glass-second", 1);
  using _environment = installFakeEnvironment([first, second]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    backgroundPreset: "waves",
    backgroundAnimate: false,
    sidebarSurface: "glass",
  });
  useThreadTabsStore.setState({ tabs: [] });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${first.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });
  await expect.element(page.getByText("glass-first: question 0")).toBeVisible();
  for (const thread of [second, first, second]) {
    await router.navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: ENVIRONMENT_ID, threadId: thread.id },
    });
    await expect.element(page.getByText(`${thread.id}: question 0`)).toBeVisible();
  }
  await expect
    .poll(() => document.querySelectorAll('[data-background-layer="window"]').length)
    .toBe(1);
  expect(document.documentElement.dataset.appBackdrop).toBe("");
  // The layer lives on <body>, outside every app surface that could cover it.
  expect(document.querySelector('[data-background-layer="window"]')?.parentElement).toBe(
    document.body,
  );
});
