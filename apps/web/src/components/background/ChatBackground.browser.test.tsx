import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { useState } from "react";
import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { render } from "../../../test/render";
import { ChatBackground } from "./Background";

function TwoViews() {
  const [showFirst, setShowFirst] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShowFirst(false)}>
        Drop first
      </button>
      {showFirst ? (
        <div className="relative h-40">
          <ChatBackground hero={false} />
        </div>
      ) : null}
      <div className="relative h-40">
        <ChatBackground hero={false} />
      </div>
    </>
  );
}

it("keeps the glass backdrop while another thread view still paints it", async () => {
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    backgroundPreset: "waves",
    backgroundAnimate: false,
    sidebarSurface: "glass",
  });
  await using _app = await render(<TwoViews />);
  await expect.poll(() => document.documentElement.dataset.appBackdrop).toBe("");
  await page.getByRole("button", { name: "Drop first" }).click();
  // Unmounting one view used to clear the flag and the app surfaces covered the pattern again.
  expect(document.documentElement.dataset.appBackdrop).toBe("");
  expect(document.querySelectorAll('[data-background-layer="window"]').length).toBeGreaterThan(0);
});
