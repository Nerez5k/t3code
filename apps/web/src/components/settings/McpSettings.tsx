import type { GlobalMcpServer } from "@t3tools/contracts";
import { ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

type Target = "kiro" | "codex";
type Listed = {
  readonly servers: ReadonlyArray<GlobalMcpServer>;
  kiroFile: string;
  codexFile: string;
};

const TARGET_LABEL: Record<Target, string> = { kiro: "Kiro", codex: "Codex" };

/** One MCP list for every agent: Kiro, both Codex accounts and their delegates. */
export function McpSettings() {
  const environmentId = usePrimaryEnvironmentId();
  const list = useAtomCommand(serverEnvironment.listGlobalMcp, { reportFailure: false });
  const upsert = useAtomCommand(serverEnvironment.upsertGlobalMcp, { reportFailure: true });
  const setEnabled = useAtomCommand(serverEnvironment.setGlobalMcpEnabled, { reportFailure: true });
  const setLead = useAtomCommand(serverEnvironment.setGlobalMcpLeadAccess, { reportFailure: true });
  const remove = useAtomCommand(serverEnvironment.removeGlobalMcp, { reportFailure: true });
  const [data, setData] = useState<Listed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);

  const apply = (result: { _tag: string; value?: unknown }) => {
    if (result._tag === "Success") {
      setData(result.value as Listed);
      setError(null);
    } else {
      setError("Could not update the MCP configuration.");
    }
  };
  const load = async () => {
    if (!environmentId) return;
    apply(await list({ environmentId, input: {} }));
  };
  const loadSoon = () => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- MCP config lives in Kiro and Codex files, read when the page opens
  useEffect(loadSoon, [environmentId]);

  const run = async (call: Promise<{ _tag: string; value?: unknown }>) => apply(await call);
  if (!environmentId) return null;

  const servers = data?.servers ?? [];
  const shared = servers.filter((server) => !server.managedByKiroCrew);
  const crew = servers.filter((server) => server.managedByKiroCrew);

  return (
    <SettingsPageContainer>
      <SettingsSection
        id="mcp-servers"
        title="MCP servers"
        headerAction={
          <Button size="xs" variant="ghost" onClick={() => setAdding((value) => !value)}>
            <PlusIcon className="size-3.5" /> Add server
          </Button>
        }
      >
        <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground sm:px-4">
          Shared by Kiro, both Codex accounts and delegated tasks. Changes apply to new sessions.
        </p>
        {adding ? (
          <AddServerForm
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              await run(upsert({ environmentId, input }));
              setAdding(false);
            }}
          />
        ) : null}
        {shared.map((server) => (
          <ServerRow
            key={server.name}
            server={server}
            onToggle={(enabled) =>
              void run(setEnabled({ environmentId, input: { name: server.name, enabled } }))
            }
            onLead={(allowed) =>
              void run(setLead({ environmentId, input: { name: server.name, allowed } }))
            }
            onShare={(target) =>
              void run(
                upsert({
                  environmentId,
                  input: {
                    name: server.name,
                    transport: server.transport,
                    ...(server.command ? { command: server.command } : {}),
                    ...(server.args ? { args: [...server.args] } : {}),
                    ...(server.url ? { url: server.url } : {}),
                    targets: [target],
                  },
                }),
              )
            }
            onRemove={() =>
              void run(
                remove({
                  environmentId,
                  input: {
                    name: server.name,
                    targets: (["kiro", "codex"] as const).filter((t) => server[t].present),
                  },
                }),
              )
            }
          />
        ))}
        {error ? <p className="px-4 py-2 text-xs text-destructive">{error}</p> : null}
      </SettingsSection>

      {crew.length > 0 ? (
        <SettingsSection id="mcp-crew" title="Managed by Kiro Crew">
          <button
            type="button"
            aria-expanded={crewOpen}
            onClick={() => setCrewOpen((value) => !value)}
            className="flex w-full items-center gap-2 px-3 py-3 text-left text-xs text-muted-foreground hover:text-foreground sm:px-4"
          >
            <ChevronRightIcon
              className={cn("size-3 transition-transform", crewOpen && "rotate-90")}
            />
            {crew.length} servers live only in Kiro Crew agents. Kiro Crew rewrites those files, so
            they are shown here read-only.
          </button>
          {crewOpen
            ? crew.map((server) => (
                <SettingsRow
                  key={server.name}
                  title={server.name}
                  description={server.url ?? [server.command, ...(server.args ?? [])].join(" ")}
                />
              ))
            : null}
        </SettingsSection>
      ) : null}

      {data ? (
        <p className="px-4 text-2xs text-muted-foreground">
          Kiro: {data.kiroFile} · Codex: {data.codexFile}. A dated .t3bak copy is kept before each
          change.
        </p>
      ) : null}
    </SettingsPageContainer>
  );
}

function ServerRow(props: {
  readonly server: GlobalMcpServer;
  readonly onToggle: (enabled: boolean) => void;
  readonly onLead: (allowed: boolean) => void;
  readonly onShare: (target: Target) => void;
  readonly onRemove: () => void;
}) {
  const { server } = props;
  const targets = (["kiro", "codex"] as const).filter((target) => server[target].present);
  const enabled = targets.some((target) => server[target].enabled);
  const detail = server.url ?? [server.command, ...(server.args ?? [])].join(" ");
  return (
    <SettingsRow
      title={
        <span className="flex flex-wrap items-center gap-1.5">
          {server.name}
          {(["kiro", "codex"] as const).map((target) =>
            server[target].present ? (
              <span
                key={target}
                className={cn(
                  "rounded px-1.5 text-2xs",
                  server[target].enabled
                    ? "bg-accent text-foreground"
                    : "bg-muted text-muted-foreground line-through",
                )}
              >
                {TARGET_LABEL[target]}
              </span>
            ) : (
              <button
                key={target}
                type="button"
                onClick={() => props.onShare(target)}
                className="rounded border border-dashed border-border px-1.5 text-2xs text-muted-foreground hover:text-foreground"
              >
                + {TARGET_LABEL[target]}
              </button>
            ),
          )}
          {server.writeCapable ? (
            <span className="rounded bg-destructive/10 px-1.5 text-2xs text-destructive">
              can write
            </span>
          ) : null}
        </span>
      }
      description={
        <span className="block truncate font-mono text-2xs">
          {detail}
          {server.envKeys.length > 0 ? ` · env: ${server.envKeys.join(", ")}` : ""}
        </span>
      }
      control={
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger render={<span className="flex items-center gap-1.5 text-2xs" />}>
              <span className="text-muted-foreground">Lead</span>
              <Switch
                size="sm"
                checked={server.leadAccess}
                disabled={server.writeCapable || !server.kiro.present}
                aria-label={`Let t3-lead use ${server.name}`}
                onCheckedChange={(checked) => props.onLead(Boolean(checked))}
              />
            </TooltipTrigger>
            <TooltipPopup>
              {server.writeCapable
                ? "Can write data, so t3-lead never gets it."
                : !server.kiro.present
                  ? "Add it to Kiro first."
                  : "t3-lead may use this read-only server."}
            </TooltipPopup>
          </Tooltip>
          <Switch
            checked={enabled}
            aria-label={`${enabled ? "Disable" : "Enable"} ${server.name}`}
            onCheckedChange={(checked) => props.onToggle(Boolean(checked))}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Remove ${server.name}`}
            onClick={props.onRemove}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      }
    />
  );
}

function AddServerForm(props: {
  readonly onCancel: () => void;
  readonly onSave: (input: {
    name: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    targets: Target[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState("");
  const [targets, setTargets] = useState<ReadonlySet<Target>>(new Set(["kiro", "codex"]));
  const valid =
    /^[A-Za-z0-9_.-]{1,64}$/.test(name) &&
    (transport === "http" ? /^https?:\/\//.test(url) : command.trim().length > 0) &&
    targets.size > 0;
  const save = () => {
    const parts = command.trim().split(/\s+/);
    const envEntries = env
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1)]);
    void props.onSave({
      name,
      transport,
      ...(transport === "http"
        ? { url: url.trim() }
        : { command: parts[0] ?? "", args: parts.slice(1) }),
      ...(envEntries.length > 0 ? { env: Object.fromEntries(envEntries) } : {}),
      targets: [...targets],
    });
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-3 sm:px-4">
      <div className="flex gap-2">
        <Input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {(["stdio", "http"] as const).map((value) => (
            <Button
              key={value}
              size="xs"
              variant={transport === value ? "secondary" : "ghost"}
              onClick={() => setTransport(value)}
            >
              {value === "stdio" ? "Command" : "URL"}
            </Button>
          ))}
        </div>
      </div>
      {transport === "stdio" ? (
        <Input
          placeholder="npx -y some-mcp-server"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
      ) : (
        <Input placeholder="https://…/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
      )}
      <textarea
        placeholder={"API_KEY=…  (one per line, optional)"}
        value={env}
        onChange={(e) => setEnv(e.target.value)}
        rows={2}
        className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
      />
      <div className="flex items-center gap-3 text-xs">
        {(["kiro", "codex"] as const).map((target) => (
          <label key={target} className="flex items-center gap-1.5">
            <Switch
              size="sm"
              checked={targets.has(target)}
              onCheckedChange={(checked) =>
                setTargets((current) => {
                  const next = new Set(current);
                  if (checked) next.add(target);
                  else next.delete(target);
                  return next;
                })
              }
            />
            {TARGET_LABEL[target]}
          </label>
        ))}
        <span className="flex-1" />
        <Button size="xs" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={!valid} onClick={save}>
          Add
        </Button>
      </div>
    </div>
  );
}
