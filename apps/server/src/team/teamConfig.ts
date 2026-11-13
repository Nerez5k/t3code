import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  TeamConfig,
  TeamConfigError,
  type TeamAccountStatus,
  type TeamStatus,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const teamDir = () => NodePath.join(NodeOS.homedir(), ".kiro", "t3-team");
const configPath = () => NodePath.join(teamDir(), "team.json");
const leadAgentPath = () => NodePath.join(NodeOS.homedir(), ".kiro", "agents", "t3-lead.json");
const helperPath = () => NodePath.join(teamDir(), "bin", "t3-team");

// Every enabled Codex instance in T3 settings, so one switched off for the team can come back.
const knownCodexInstances = Effect.promise(async () => {
  const path = NodePath.join(NodeOS.homedir(), ".t3", "userdata", "settings.json");
  const settings = await NodeFSP.readFile(path, "utf8")
    .then(
      (text) =>
        JSON.parse(text) as {
          providerInstances?: Record<string, { driver?: string; enabled?: boolean }>;
        },
    )
    .catch(() => undefined);
  return Object.entries(settings?.providerInstances ?? {})
    .filter(([, instance]) => instance.driver === "codex" && instance.enabled !== false)
    .map(([id]) => id)
    .toSorted();
});

const decodeConfig = Schema.decodeUnknownEffect(TeamConfig);

const exists = (path: string) =>
  Effect.promise(() =>
    NodeFSP.access(path).then(
      () => true,
      () => false,
    ),
  );

// The helper reads T3's own usage-limit caches, so the page and the lead agent agree on a pick.
const runHelperStatus = Effect.callback<
  { pick?: string | null; accounts?: ReadonlyArray<TeamAccountStatus> } | undefined
>((resume) => {
  NodeChildProcess.execFile(helperPath(), ["status"], { timeout: 10_000 }, (error, stdout) => {
    if (error) return resume(Effect.succeed(undefined));
    try {
      resume(Effect.succeed(JSON.parse(stdout)));
    } catch {
      resume(Effect.succeed(undefined));
    }
  });
});

export const readTeamStatus: Effect.Effect<TeamStatus> = Effect.gen(function* () {
  const path = configPath();
  const installed = yield* exists(path);
  const leadAgentInstalled = yield* exists(leadAgentPath());
  if (!installed) {
    return { installed, leadAgentInstalled, configPath: path, accounts: [] };
  }
  const raw = yield* Effect.tryPromise(() => NodeFSP.readFile(path, "utf8")).pipe(
    Effect.flatMap((text) => Effect.try(() => JSON.parse(text) as unknown)),
    Effect.flatMap(decodeConfig),
    Effect.result,
  );
  const helper = yield* runHelperStatus;
  const known = yield* knownCodexInstances;
  const reported = helper?.accounts ?? [];
  const missing = known
    .filter((id) => !reported.some((account) => account.id === id))
    .map((id) => ({ id, usable: false, why: "Not used by the team" }));
  const accounts = [...reported, ...missing].map((account) => ({
    id: account.id,
    usable: account.usable,
    ...(account.why ? { why: account.why } : {}),
    ...(account.resetsAt ? { resetsAt: account.resetsAt } : {}),
    ...(account.used ? { used: account.used } : {}),
  }));
  return {
    installed,
    leadAgentInstalled,
    configPath: path,
    ...(raw._tag === "Success" ? { config: raw.success } : { error: "team.json is invalid." }),
    pick: helper?.pick ?? null,
    accounts,
  };
});

export const writeTeamConfig = Effect.fn("TeamConfig.write")(function* (config: TeamConfig) {
  const path = configPath();
  if (!(yield* exists(teamDir()))) {
    return yield* new TeamConfigError({ detail: `${teamDir()} does not exist.` });
  }
  const temp = `${path}.tmp`;
  yield* Effect.tryPromise({
    try: async () => {
      await NodeFSP.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      await NodeFSP.rename(temp, path);
    },
    catch: (cause) => new TeamConfigError({ detail: `Could not save team.json: ${String(cause)}` }),
  });
  return yield* readTeamStatus;
});
