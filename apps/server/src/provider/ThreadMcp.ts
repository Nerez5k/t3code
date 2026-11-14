// @effect-diagnostics nodeBuiltinImport:off -- Atomic replacement and backup use the native filesystem boundary.
// @effect-diagnostics globalDate:off -- Backup day comparisons use filesystem timestamps in this Promise boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import { ThreadMcpError, type ThreadId, type ThreadMcpStatus } from "@t3tools/contracts";
import { getMcpStatus } from "@t3tools/provider-kiro/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";

export async function editMcpServer(file: string, name: string, enabled: boolean) {
  const original = await NodeFSP.readFile(file, "utf8");
  const config = JSON.parse(original);
  if (
    !config ||
    typeof config !== "object" ||
    !config.mcpServers ||
    !Object.hasOwn(config.mcpServers, name)
  )
    throw new Error("Unknown MCP server");
  const entry = config.mcpServers[name];
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    throw new Error("Invalid MCP entry");
  if (enabled) delete entry.disabled;
  else entry.disabled = true;
  const backup = file + ".t3bak";
  const today = new Date().toISOString().slice(0, 10);
  const previous = await NodeFSP.stat(backup).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (!previous || previous.mtime.toISOString().slice(0, 10) !== today) {
    await NodeFSP.copyFile(file, backup);
  }
  const temporary = file + "." + NodeCrypto.randomUUID() + ".tmp";
  try {
    const stat = await NodeFSP.stat(file);
    await NodeFSP.writeFile(temporary, JSON.stringify(config, null, 2) + "\n", {
      flag: "wx",
      mode: stat.mode & 0o777,
    });
    // Do not overwrite configuration changed by another writer during this operation.
    if ((await NodeFSP.readFile(file, "utf8")) !== original)
      throw new Error("Configuration changed");
    await NodeFSP.rename(temporary, file);
  } finally {
    await NodeFSP.rm(temporary, { force: true });
  }
  return {
    file,
    appliesTo: "new-sessions" as const,
    managedByKiroCrew: NodePath.basename(file).startsWith("kirocrew"),
  };
}

export class ThreadMcp extends Context.Service<
  ThreadMcp,
  {
    readonly get: (threadId: ThreadId) => Effect.Effect<ThreadMcpStatus, ThreadMcpError>;
    readonly setEnabled: (input: {
      threadId: ThreadId;
      name: string;
      enabled: boolean;
    }) => Effect.Effect<
      { file: string; appliesTo: "new-sessions"; managedByKiroCrew: boolean },
      ThreadMcpError
    >;
  }
>()("t3/provider/ThreadMcp") {}

export const layer = Layer.effect(
  ThreadMcp,
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const get = Effect.fn("ThreadMcp.get")(function* (threadId: ThreadId) {
      const records = yield* orchestrator
        .getThreadRecords(threadId, ["providerThreads"])
        .pipe(Effect.mapError(() => new ThreadMcpError({})));
      const provider = records?.providerThreads.findLast(
        (candidate) => candidate.appThreadId === threadId && candidate.nativeThreadRef !== null,
      );
      if (!provider || provider.driver !== "kiro") return { supported: false, servers: [] };
      const nativeId = provider.nativeThreadRef?.nativeId;
      const snapshot = nativeId ? getMcpStatus(nativeId) : undefined;
      return { supported: true, servers: [], ...snapshot };
    });
    const setEnabled = Effect.fn("ThreadMcp.setEnabled")(function* (input: {
      threadId: ThreadId;
      name: string;
      enabled: boolean;
    }) {
      const status = yield* get(input.threadId);
      const server = status.servers.find((server) => server.name === input.name);
      if (!server?.definedIn) return yield* new ThreadMcpError({});
      return yield* Effect.tryPromise({
        try: () => editMcpServer(server.definedIn!, input.name, input.enabled),
        catch: () => new ThreadMcpError({}),
      });
    });
    return ThreadMcp.of({ get, setEnabled });
  }),
);
