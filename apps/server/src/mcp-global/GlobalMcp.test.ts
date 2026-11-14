// @effect-diagnostics nodeBuiltinImport:off -- These fixtures verify native atomic configuration writes.
import { expect, it } from "@effect/vitest";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as Effect from "effect/Effect";
import { isWriteCapable, editToml, makeGlobalMcp, editJsonProperty } from "./GlobalMcp.ts";

it("classifies write access conservatively", () => {
  for (const name of [
    "stripe",
    "ads-write",
    "vercel",
    "appstore-connect",
    "mailerlite",
    "superwall",
  ])
    expect(isWriteCapable(name)).toBe(true);
  expect(isWriteCapable("supabase", "https://example.test/?read_only=true")).toBe(false);
  expect(isWriteCapable("supabase", "https://example.test/")).toBe(true);
  expect(isWriteCapable("search")).toBe(false);
});
it("preserves unrelated TOML byte for byte", () => {
  const prefix = '# global\nmodel = "x"\n[other]\nx = 1 # inline\n';
  const suffix = '[tail]\nvalue = "abc"\n';
  const updated = editToml(prefix + '[mcp_servers.demo]\ncommand = "old"\n' + suffix, "demo", {
    command: "new",
    env: { TOKEN: "secret" },
  });
  expect(updated.startsWith(prefix + suffix)).toBe(true);
  expect(updated).toContain('command = "new"');
  expect(() => editToml("", "../bad", {})).toThrow();
});
it.effect(
  "unions providers, redacts secrets, writes backups and refuses write-capable lead access",
  () =>
    Effect.gen(function* () {
      const home = yield* Effect.promise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "global-mcp-")),
      );
      try {
        yield* Effect.promise(() =>
          NodeFSP.mkdir(NodePath.join(home, ".kiro/agents"), { recursive: true }),
        );
        yield* Effect.promise(() =>
          NodeFSP.writeFile(
            NodePath.join(home, ".kiro/agents/t3-lead.json"),
            '{"name":"lead","tools":[],"allowedTools":[]}\n',
          ),
        );
        const service = makeGlobalMcp(home);
        yield* service.upsert({
          name: "search",
          transport: "stdio",
          command: "node",
          env: { TOKEN: "secret" },
          targets: ["kiro", "codex"],
        });
        const status = yield* service.list();
        expect(status.servers[0]?.envKeys).toEqual(["TOKEN"]);
        expect(JSON.stringify(status)).not.toContain("secret");
        yield* service.setLeadAccess({ name: "search", allowed: true });
        expect((yield* service.list()).servers[0]?.leadAccess).toBe(true);
        yield* service.setEnabled({ name: "search", enabled: false });
        expect((yield* service.list()).servers[0]?.codex.enabled).toBe(false);
        yield* service.upsert({
          name: "stripe",
          transport: "http",
          url: "https://example.test",
          targets: ["kiro"],
        });
        expect(
          (yield* Effect.result(service.setLeadAccess({ name: "stripe", allowed: true })))._tag,
        ).toBe("Failure");
        expect(
          yield* Effect.promise(() =>
            NodeFSP.readFile(NodePath.join(home, ".kiro/settings/mcp.json.t3bak"), "utf8"),
          ),
        ).toContain("search");
        yield* service.remove({ name: "search", targets: ["kiro", "codex"] });
        expect((yield* service.list()).servers.map((s) => s.name)).toEqual(["stripe"]);
      } finally {
        yield* Effect.promise(() => NodeFSP.rm(home, { recursive: true, force: true }));
      }
    }),
);

it("preserves unrelated lead JSON fields and nested tool strings", () => {
  const text = '{"other":{"tools":["nested"]}, "tools": ["a]b"], "allowedTools": []}\n';
  expect(editJsonProperty(text, "tools", ["@demo"])).toBe(
    '{"other":{"tools":["nested"]}, "tools": ["@demo"], "allowedTools": []}\n',
  );
});

it.effect("keeps crew agents and Codex symlinks intact", () =>
  Effect.gen(function* () {
    const home = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "global-mcp-")),
    );
    try {
      const crew =
        '{"mcpServers":{"crew":{"command":"node","headers":{"Authorization":"secret"}}}}';
      yield* Effect.promise(async () => {
        await NodeFSP.mkdir(NodePath.join(home, ".kiro/agents"), { recursive: true });
        await NodeFSP.mkdir(NodePath.join(home, ".codex"), { recursive: true });
        await NodeFSP.writeFile(NodePath.join(home, ".kiro/agents/kirocrew-test.json"), crew);
        await NodeFSP.writeFile(NodePath.join(home, "actual.toml"), '# retained\nmodel = "x"\n');
        await NodeFSP.symlink(
          NodePath.join(home, "actual.toml"),
          NodePath.join(home, ".codex/config.toml"),
        );
      });
      const service = makeGlobalMcp(home);
      const listed = yield* service.list();
      expect(listed.servers[0]?.managedByKiroCrew).toBe(true);
      expect(JSON.stringify(listed)).not.toContain("secret");
      expect((yield* Effect.result(service.remove({ name: "crew", targets: ["kiro"] })))._tag).toBe(
        "Failure",
      );
      yield* service.upsert({
        name: "search",
        transport: "stdio",
        command: "node",
        targets: ["codex"],
      });
      const originalBackup = yield* Effect.promise(() =>
        NodeFSP.readFile(NodePath.join(home, "actual.toml.t3bak"), "utf8"),
      );
      yield* service.setEnabled({ name: "search", enabled: false, targets: ["codex"] });
      yield* Effect.promise(async () => {
        expect(
          (await NodeFSP.lstat(NodePath.join(home, ".codex/config.toml"))).isSymbolicLink(),
        ).toBe(true);
        expect(await NodeFSP.readFile(NodePath.join(home, "actual.toml.t3bak"), "utf8")).toBe(
          originalBackup,
        );
        expect(
          await NodeFSP.readFile(NodePath.join(home, ".kiro/agents/kirocrew-test.json"), "utf8"),
        ).toBe(crew);
      });
    } finally {
      yield* Effect.promise(() => NodeFSP.rm(home, { recursive: true, force: true }));
    }
  }),
);
