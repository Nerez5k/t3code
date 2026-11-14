// @effect-diagnostics nodeBuiltinImport:off -- KRN normalization is synchronous at the native ACP boundary.
// @effect-diagnostics globalDate:off -- Native notifications are timestamped outside an Effect clock.
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export interface McpServerStatus {
  name: string;
  status: "connected" | "connecting" | "failed" | "disabled";
  toolCount: number;
  layer?: string;
  definedIn?: string;
  needsAuth: boolean;
  authorizationUrl?: string;
}
export interface McpSnapshot {
  checkedAt: string;
  servers: McpServerStatus[];
}
const snapshots = new Map<string, McpSnapshot>();
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function normalizeMcpStatus(payload: unknown, home = NodeOS.homedir()) {
  const input = record(payload);
  if (typeof input?.sessionId !== "string" || !Array.isArray(input.servers)) return;
  const servers: McpServerStatus[] = [];
  for (const raw of input.servers) {
    const server = record(raw);
    if (
      !server ||
      typeof server.name !== "string" ||
      !["connected", "connecting", "failed", "disabled"].includes(String(server.status))
    )
      continue;
    const resource = record(record(record(server._meta)?.kiro)?.resource);
    const layer = typeof resource?.layer === "string" ? resource.layer : undefined;
    let definedIn: string | undefined;
    if (typeof resource?.krn === "string") {
      try {
        const krn = decodeURIComponent(resource.krn);
        if (
          layer === "user-local" &&
          krn.startsWith("krn:user-local::mcp-server/settings/mcp.json#")
        ) {
          definedIn = NodePath.join(home, ".kiro/settings/mcp.json");
        } else if (layer === "workspace") {
          const workspace = krn.match(
            /^krn:workspace:(\/.*):mcp-server\/settings\/mcp\.json#/,
          )?.[1];
          if (workspace && NodePath.isAbsolute(workspace)) {
            definedIn = NodePath.join(workspace, ".kiro/settings/mcp.json");
          }
        } else if (layer === "agent") {
          const agent = krn.match(/:agent\/([^/]+\.json):mcp-server\//)?.[1];
          if (agent && agent !== "..") definedIn = NodePath.join(home, ".kiro/agents", agent);
        }
      } catch {
        /* Malformed resource identifiers cannot define editable files. */
      }
    }
    servers.push({
      name: server.name,
      status: server.status as McpServerStatus["status"],
      toolCount: Array.isArray(server.tools) ? server.tools.length : 0,
      ...(layer ? { layer } : {}),
      ...(definedIn ? { definedIn } : {}),
      needsAuth: server.failedAuthorization === true,
      ...(typeof server.authorizationUrl === "string"
        ? { authorizationUrl: server.authorizationUrl }
        : {}),
    });
  }
  return { sessionId: input.sessionId, snapshot: { checkedAt: new Date().toISOString(), servers } };
}
export function updateMcpStatus(payload: unknown) {
  const normalized = normalizeMcpStatus(payload);
  if (normalized) snapshots.set(normalized.sessionId, normalized.snapshot);
  return normalized?.sessionId;
}
export const getMcpStatus = (sessionId: string) => snapshots.get(sessionId);
