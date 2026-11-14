import * as SmolToml from "smol-toml";
// @effect-diagnostics nodeBuiltinImport:off -- Provider configuration files require atomic native filesystem operations.
// @effect-diagnostics globalDate:off -- Daily backup rotation follows filesystem timestamps.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";
import {
  GlobalMcpError,
  type GlobalMcpServer,
  type UpsertGlobalMcpInput,
  type SetGlobalMcpEnabledInput,
  type SetGlobalMcpLeadAccessInput,
  type RemoveGlobalMcpInput,
} from "@t3tools/contracts";

const getToml = () => SmolToml;
type Entry = {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  disabled?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
};
type Config = Record<string, unknown> & {
  mcpServers?: Record<string, Entry>;
  mcp_servers?: Record<string, Entry>;
  tools?: string[];
  allowedTools?: string[];
  includeMcpJson?: boolean;
};
const ownEntry = (entries: Record<string, Entry> | undefined, name: string) =>
  entries && Object.hasOwn(entries, name) ? entries[name] : undefined;

export const isWriteCapable = (name: string, url?: string) =>
  /write|stripe|vercel|appstore|mailerlite|superwall/i.test(name) ||
  (/supabase/i.test(name + " " + (url ?? "")) &&
    !URL.parse(url ?? "")
      ?.searchParams.getAll("read_only")
      .includes("true"));
const validName = (name: string) => {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) throw new Error("Invalid server name");
};
const read = async (file: string) =>
  NodeFSP.readFile(file, "utf8").catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return "";
    throw e;
  });
async function atomicWrite(file: string, original: string, next: string) {
  await NodeFSP.mkdir(NodePath.dirname(file), { recursive: true });
  const backup = file + ".t3bak";
  const previous = await NodeFSP.stat(backup).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
    return undefined;
  });
  const stat = await NodeFSP.stat(file).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
    return undefined;
  });
  if (
    stat &&
    (!previous ||
      previous.mtime.toISOString().slice(0, 10) !== new Date().toISOString().slice(0, 10))
  )
    await NodeFSP.copyFile(file, backup);
  const temporary = file + "." + NodeCrypto.randomUUID() + ".tmp";
  try {
    await NodeFSP.writeFile(temporary, next, {
      flag: "wx",
      mode: stat ? stat.mode & 0o777 : 0o600,
    });
    if ((await read(file)) !== original) throw new Error("Configuration changed");
    await NodeFSP.rename(temporary, file);
  } finally {
    await NodeFSP.rm(temporary, { force: true });
  }
}

export function editToml(text: string, name: string, entry: Entry | undefined) {
  validName(name);
  const lines = text.split(/(?<=\n)/);
  let section = false;
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      const header = line.trim().replace(/\s+#.*$/, "");
      const parsed = getToml().parse(header + "\n");
      const servers = parsed.mcp_servers as Record<string, unknown> | undefined;
      section = !!servers && Object.hasOwn(servers, name);
    }
    if (!section || /^\s*(#|$)/.test(line)) kept.push(line);
  }
  const base = kept.join("");
  return entry
    ? base +
        (!base ? "" : base.endsWith("\n\n") ? "" : base.endsWith("\n") ? "\n" : "\n\n") +
        getToml().stringify({ mcp_servers: { [name]: entry } })
    : base;
}

export function editJsonProperty(text: string, key: string, value: unknown) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i++;
      for (; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      if (depth !== 1 || JSON.parse(text.slice(start, i + 1)) !== key) continue;
      let cursor = i + 1;
      while (/\s/.test(text[cursor] ?? "")) cursor++;
      if (text[cursor] !== ":") continue;
      cursor++;
      while (/\s/.test(text[cursor] ?? "")) cursor++;
      const valueStart = cursor;
      let nested = 0,
        quoted = false;
      for (; cursor < text.length; cursor++) {
        const c = text[cursor];
        if (quoted) {
          if (c === "\\") cursor++;
          else if (c === '"') quoted = false;
          continue;
        }
        if (c === '"') {
          quoted = true;
          continue;
        }
        if (nested === 0 && (c === "," || c === "}")) break;
        if (c === "[" || c === "{") nested++;
        if (c === "]" || c === "}") nested--;
      }
      const end = cursor - (text.slice(valueStart, cursor).match(/\s*$/)?.[0].length ?? 0);
      return text.slice(0, valueStart) + JSON.stringify(value) + text.slice(end);
    }
    if (char === "{" || char === "[") depth++;
    if (char === "}" || char === "]") depth--;
  }
  return text.replace(
    /}\s*$/,
    (end) =>
      (Object.keys(JSON.parse(text)).length ? "," : "") +
      "\n" +
      JSON.stringify(key) +
      ": " +
      JSON.stringify(value) +
      "\n" +
      end,
  );
}

const queues = new Map<string, Promise<void>>();

export function makeGlobalMcp(home = NodeOS.homedir()) {
  const kiroFile = NodePath.join(home, ".kiro/settings/mcp.json");
  const codexFile = NodePath.join(home, ".codex/config.toml");
  const leadFile = NodePath.join(home, ".kiro/agents/t3-lead.json");
  const load = async () => {
    const [k, c, l] = await Promise.all([read(kiroFile), read(codexFile), read(leadFile)]);
    return {
      k,
      c,
      l,
      kiro: (k ? JSON.parse(k) : {}) as Config,
      codex: (c ? getToml().parse(c) : {}) as Config,
      lead: (l ? JSON.parse(l) : {}) as Config,
    };
  };
  const list = async () => {
    const { kiro, codex, lead } = await load();
    const crew = new Map<string, Entry>();
    const agents = await NodeFSP.readdir(NodePath.dirname(leadFile)).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return [];
        throw e;
      },
    );
    for (const file of agents.filter((f) => /^kirocrew.*\.json$/.test(f))) {
      const config = JSON.parse(
        await read(NodePath.join(NodePath.dirname(leadFile), file)),
      ) as Config;
      for (const [name, entry] of Object.entries(config.mcpServers ?? {})) crew.set(name, entry);
    }
    const servers: GlobalMcpServer[] = [
      ...new Set([
        ...Object.keys(kiro.mcpServers ?? {}),
        ...Object.keys(codex.mcp_servers ?? {}),
        ...crew.keys(),
      ]),
    ]
      .sort()
      .map((name) => {
        const k = ownEntry(kiro.mcpServers, name),
          c = ownEntry(codex.mcp_servers, name);
        const entry = k ?? c ?? crew.get(name)!;
        // t3-lead runs in Kiro, so its Kiro definition decides; otherwise any copy that can write.
        const writeCapable = k
          ? isWriteCapable(name, k.url)
          : [c, crew.get(name)].some((e) => e && isWriteCapable(name, e.url));
        return {
          name,
          transport: entry.url ? "http" : "stdio",
          ...(entry.command ? { command: entry.command } : {}),
          ...(entry.args ? { args: entry.args } : {}),
          ...(entry.url ? { url: entry.url } : {}),
          envKeys: [
            ...new Set([
              ...Object.keys(k?.env ?? {}),
              ...Object.keys(c?.env ?? {}),
              ...Object.keys(crew.get(name)?.env ?? {}),
            ]),
          ].sort(),
          kiro: { present: !!k, enabled: !!k && k.disabled !== true },
          codex: { present: !!c, enabled: !!c && c.enabled !== false },
          writeCapable,
          leadAccess:
            !writeCapable &&
            !!lead.tools?.includes("@" + name) &&
            !!lead.allowedTools?.includes("@" + name),
          // Only servers that exist solely in Kiro Crew agents are out of reach.
          ...(crew.has(name) && !k && !c ? { managedByKiroCrew: true } : {}),
        };
      });
    return { servers, kiroFile, codexFile };
  };
  let pending = queues.get(home) ?? Promise.resolve();
  const run = <A>(action: () => Promise<A>) =>
    Effect.tryPromise({
      try: () => {
        const next = (queues.get(home) ?? pending).then(action);
        pending = next.then(
          () => undefined,
          () => undefined,
        );
        queues.set(home, pending);
        return next;
      },
      catch: () => new GlobalMcpError({}),
    });
  const mutate = (action: () => Promise<void>) =>
    run(async () => {
      await action();
      return list();
    });
  const update = async (
    name: string,
    targets: readonly ("kiro" | "codex")[],
    change: (entry: Entry | undefined, target: "kiro" | "codex") => Entry | undefined,
  ) => {
    validName(name);
    const state = await load();
    if ((await list()).servers.find((s) => s.name === name)?.managedByKiroCrew)
      throw new Error("Managed by Kiro Crew");
    for (const target of new Set(targets)) {
      if (target === "kiro") {
        const entries = (state.kiro.mcpServers ??= {});
        const next = change(ownEntry(entries, name), "kiro");
        if (next)
          Object.defineProperty(entries, name, {
            value: next,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        else delete entries[name];
        await atomicWrite(kiroFile, state.k, JSON.stringify(state.kiro, null, 2) + "\n");
      } else {
        const actualFile = await NodeFSP.realpath(codexFile).catch((e: NodeJS.ErrnoException) => {
          if (e.code === "ENOENT") return codexFile;
          throw e;
        });
        await atomicWrite(
          actualFile,
          state.c,
          editToml(state.c, name, change(ownEntry(state.codex.mcp_servers, name), "codex")),
        );
      }
    }
  };
  return {
    list: () => run(list),
    upsert: (input: typeof UpsertGlobalMcpInput.Type) =>
      mutate(async () => {
        if (input.transport === "http" ? !input.url : !input.command)
          throw new Error("Missing transport configuration");
        if (
          isWriteCapable(input.name, input.url) &&
          ((await load()).lead.tools?.includes("@" + input.name) ||
            (await load()).lead.allowedTools?.includes("@" + input.name))
        )
          throw new Error("Revoke lead access first");
        // Sharing a server to the other agent copies its env, which the UI never sees.
        const current = await load();
        const existing =
          ownEntry(current.kiro.mcpServers, input.name) ??
          ownEntry(current.codex.mcp_servers, input.name);
        await update(input.name, input.targets, (old) => {
          const next: Entry = { ...old };
          if (!old && !input.env && existing?.env) next.env = { ...existing.env };
          delete next.url;
          delete next.command;
          delete next.args;
          if (input.transport === "http") next.url = input.url!;
          else {
            next.command = input.command!;
            next.args = [...(input.args ?? [])];
          }
          if (input.env) next.env = { ...input.env };
          return next;
        });
      }),
    setEnabled: (input: typeof SetGlobalMcpEnabledInput.Type) =>
      mutate(() =>
        update(input.name, input.targets ?? ["kiro", "codex"], (old, target) => {
          if (!old) return undefined;
          // Kiro reads `disabled`, Codex reads `enabled`; each file keeps only its own key.
          const { enabled: _enabled, disabled: _disabled, ...rest } = old;
          if (input.enabled) return rest;
          return target === "kiro" ? { ...rest, disabled: true } : { ...rest, enabled: false };
        }),
      ),
    remove: (input: typeof RemoveGlobalMcpInput.Type) =>
      mutate(() => update(input.name, input.targets, () => undefined)),
    setLeadAccess: (input: typeof SetGlobalMcpLeadAccessInput.Type) =>
      mutate(async () => {
        validName(input.name);
        const server = (await list()).servers.find((s) => s.name === input.name);
        if (!server || server.managedByKiroCrew || (input.allowed && server.writeCapable))
          throw new Error("Lead access refused");
        const { l, lead } = await load();
        if (!l) throw new Error("Lead not installed");
        for (const key of ["tools", "allowedTools"] as const)
          lead[key] = [
            ...new Set([
              ...(lead[key] ?? []).filter((t) => t !== "@" + input.name),
              ...(input.allowed ? ["@" + input.name] : []),
            ]),
          ];
        lead.includeMcpJson = true;
        let next = l;
        for (const key of ["tools", "allowedTools", "includeMcpJson"] as const) {
          next = editJsonProperty(next, key, lead[key]);
        }
        await atomicWrite(leadFile, l, next);
      }),
  };
}
