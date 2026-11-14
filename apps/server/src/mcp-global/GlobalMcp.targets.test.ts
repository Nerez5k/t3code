import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeGlobalMcp } from "./GlobalMcp.ts";

function home() {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "gmcp-"));
  NodeFS.mkdirSync(NodePath.join(dir, ".kiro/settings"), { recursive: true });
  NodeFS.mkdirSync(NodePath.join(dir, ".kiro/agents"), { recursive: true });
  NodeFS.mkdirSync(NodePath.join(dir, ".codex"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(dir, ".kiro/settings/mcp.json"),
    JSON.stringify({ mcpServers: { seo: { command: "npx", args: ["seo"] } } }),
  );
  NodeFS.writeFileSync(
    NodePath.join(dir, ".codex/config.toml"),
    [
      "# keep me",
      'model = "x"',
      "",
      "[mcp_servers.seo]",
      'command = "npx"',
      'args = ["seo"]',
      "",
      "[mcp_servers.only_codex]",
      'command = "tool"',
      "",
      "[mcp_servers.only_codex.env]",
      'TOKEN = "secret"',
      "",
    ].join("\n"),
  );
  return dir;
}

const read = (dir: string, file: string) => NodeFS.readFileSync(NodePath.join(dir, file), "utf8");

describe("GlobalMcp targets", () => {
  it.effect("writes each agent's own enabled key and keeps comments", () =>
    Effect.gen(function* () {
      const dir = home();
      yield* makeGlobalMcp(dir).setEnabled({ name: "seo", enabled: false });
      const kiro = JSON.parse(read(dir, ".kiro/settings/mcp.json"));
      const codex = read(dir, ".codex/config.toml");
      expect(kiro.mcpServers.seo).toEqual({ command: "npx", args: ["seo"], disabled: true });
      expect(codex).toContain("# keep me");
      expect(codex).toContain("enabled = false");
      expect(codex).not.toContain("disabled");
      yield* makeGlobalMcp(dir).setEnabled({ name: "seo", enabled: true });
      expect(JSON.parse(read(dir, ".kiro/settings/mcp.json")).mcpServers.seo).toEqual({
        command: "npx",
        args: ["seo"],
      });
    }),
  );

  it.effect("copies env when sharing a server to Kiro without exposing it", () =>
    Effect.gen(function* () {
      const dir = home();
      const listed = yield* makeGlobalMcp(dir).upsert({
        name: "only_codex",
        transport: "stdio",
        command: "tool",
        targets: ["kiro"],
      });
      const kiro = JSON.parse(read(dir, ".kiro/settings/mcp.json"));
      expect(kiro.mcpServers.only_codex.env).toEqual({ TOKEN: "secret" });
      expect(JSON.stringify(listed)).not.toContain("secret");
    }),
  );
});
