import type { EnvironmentId, ThreadId, ThreadMcpStatus } from "@t3tools/contracts";
import { ChevronRightIcon, PlugIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

type Server = ThreadMcpStatus["servers"][number];
type Group = "running" | "attention" | "off";

const POLL_MS = 15_000;
const GROUPS: ReadonlyArray<{ id: Group; label: string }> = [
  { id: "attention", label: "Needs attention" },
  { id: "running", label: "Running" },
  { id: "off", label: "Off" },
];

function groupOf(server: Server): Group {
  if (server.status === "disabled") return "off";
  if (server.status === "failed" || server.needsAuth) return "attention";
  return "running";
}

const DOT: Record<Server["status"], string> = {
  connected: "bg-diff-addition",
  connecting: "bg-muted-foreground animate-pulse",
  failed: "bg-destructive",
  disabled: "bg-muted-foreground/40",
};

/** The session's MCP servers, folded to one summary line; toggles apply to new sessions. */
export function ThreadDetailsMcp(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const getStatus = useAtomCommand(serverEnvironment.getThreadMcpStatus, { reportFailure: false });
  const setEnabled = useAtomCommand(serverEnvironment.setMcpServerEnabled, { reportFailure: true });
  const [status, setStatus] = useState<ThreadMcpStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    const result = await getStatus({
      environmentId: props.environmentId,
      input: { threadId: props.threadId },
    });
    if (result._tag === "Success") setStatus(result.value);
  };

  const startPolling = () => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- MCP status lives in the provider session; poll it slowly while the panel is mounted
  useEffect(startPolling, [props.environmentId, props.threadId]);

  if (!status?.supported || status.servers.length === 0) return null;

  const toggle = async (server: Server, enabled: boolean) => {
    setPending((current) => new Map(current).set(server.name, enabled));
    const result = await setEnabled({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, name: server.name, enabled },
    });
    if (result._tag === "Success") {
      setNote(
        result.value.managedByKiroCrew
          ? "Saved. Kiro Crew may restore its own agent files."
          : "Saved. Applies to new sessions.",
      );
    } else {
      setPending((current) => {
        const next = new Map(current);
        next.delete(server.name);
        return next;
      });
    }
  };

  const grouped = new Map<Group, Server[]>();
  for (const server of status.servers) {
    const list = grouped.get(groupOf(server)) ?? [];
    list.push(server);
    grouped.set(groupOf(server), list);
  }
  const count = (group: Group) => grouped.get(group)?.length ?? 0;
  const summary = [
    `${count("running")} running`,
    count("attention") > 0 ? `${count("attention")} need attention` : null,
    count("off") > 0 ? `${count("off")} off` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ThreadDetailsSection
      headingId="thread-details-mcp-heading"
      title="MCP servers"
      showHeading={false}
      separated={false}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-accent"
      >
        <PlugIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium text-foreground">MCP</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="mt-1 flex max-h-72 flex-col gap-2 overflow-y-auto pe-1">
          {GROUPS.filter((group) => count(group.id) > 0).map((group) => (
            <div key={group.id} className="flex flex-col">
              <span className="px-1 pb-0.5 text-2xs uppercase tracking-wide text-muted-foreground/80">
                {group.label}
              </span>
              {(grouped.get(group.id) ?? []).map((server) => {
                const enabled = pending.get(server.name) ?? server.status !== "disabled";
                return (
                  <div
                    key={server.name}
                    className="flex min-h-7 items-center gap-2 rounded-md px-1 text-xs hover:bg-accent/50"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", DOT[server.status])} />
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className="min-w-0 flex-1 truncate text-foreground" />}
                      >
                        {server.name}
                      </TooltipTrigger>
                      <TooltipPopup>
                        {server.definedIn ?? server.layer ?? "Defined by the agent"}
                      </TooltipPopup>
                    </Tooltip>
                    {server.needsAuth && server.authorizationUrl ? (
                      <a
                        href={server.authorizationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-2xs text-primary hover:underline"
                      >
                        Sign in
                      </a>
                    ) : server.status === "connected" ? (
                      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                        {server.toolCount} tools
                      </span>
                    ) : server.status === "failed" ? (
                      <span className="shrink-0 text-2xs text-destructive">Failed</span>
                    ) : null}
                    <Switch
                      size="sm"
                      checked={enabled}
                      aria-label={`${enabled ? "Disable" : "Enable"} ${server.name}`}
                      onCheckedChange={(checked) => void toggle(server, Boolean(checked))}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          {note ? <p className="px-1 text-2xs text-muted-foreground">{note}</p> : null}
        </div>
      ) : null}
    </ThreadDetailsSection>
  );
}
