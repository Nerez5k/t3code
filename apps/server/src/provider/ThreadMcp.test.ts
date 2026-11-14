// @effect-diagnostics nodeBuiltinImport:off -- Tests exercise atomic writes in isolated temporary directories.

import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { editMcpServer } from "./ThreadMcp.ts";

describe("MCP configuration editing", () => {
  it.each(["settings/mcp.json", "agents/kirocrew.json"])(
    "edits only the selected entry in %s",
    async (relative) => {
      const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-mcp-"));
      try {
        const file = NodePath.join(dir, relative);
        await NodeFSP.mkdir(NodePath.dirname(file), { recursive: true });
        const original = JSON.stringify({
          extra: { keep: 42 },
          mcpServers: {
            first: { command: "test", disabled: false },
            second: { url: "https://example.com" },
          },
        });
        await NodeFSP.writeFile(file, original, { mode: 0o600 });
        expect(await editMcpServer(file, "first", false)).toMatchObject({
          file,
          appliesTo: "new-sessions",
          managedByKiroCrew: relative.includes("kirocrew"),
        });
        const disabled = JSON.parse(await NodeFSP.readFile(file, "utf8"));
        expect(disabled.mcpServers.first.disabled).toBe(true);
        expect(disabled.extra).toEqual({ keep: 42 });
        expect(disabled.mcpServers.second).toEqual({ url: "https://example.com" });
        expect(Object.keys(disabled)).toEqual(["extra", "mcpServers"]);
        await editMcpServer(file, "first", true);
        expect(JSON.parse(await NodeFSP.readFile(file, "utf8")).mcpServers.first).toEqual({
          command: "test",
        });
        expect(await NodeFSP.readFile(file + ".t3bak", "utf8")).toBe(original);
        const before = await NodeFSP.readFile(file, "utf8");
        await expect(editMcpServer(file, "missing", false)).rejects.toThrow();
        expect(await NodeFSP.readFile(file, "utf8")).toBe(before);
      } finally {
        await NodeFSP.rm(dir, { recursive: true, force: true });
      }
    },
  );
});
