import { describe, expect, it } from "@effect/vitest";
import { normalizeMcpStatus, getMcpStatus, updateMcpStatus } from "./mcpStatus.ts";

describe("Kiro MCP status", () => {
  it("normalizes user and agent resources without leaking unrelated fields", () => {
    const result = normalizeMcpStatus(
      {
        sessionId: "native",
        servers: [
          {
            name: "db",
            status: "failed",
            tools: [{ name: "query" }],
            failedAuthorization: true,
            authorizationUrl: "https://auth.example/?token=secret",
            _meta: {
              kiro: {
                resource: {
                  layer: "user-local",
                  krn: "krn:user-local::mcp-server/settings/mcp.json#mcpServers/db",
                },
              },
            },
          },
          {
            name: "seo",
            status: "disabled",
            _meta: {
              kiro: {
                resource: {
                  layer: "agent",
                  krn: "krn:agent:krn%3Auser-local%3A%3Aagent/kirocrew.json:mcp-server/mcpServers/seo",
                },
              },
            },
          },
        ],
      },
      "/tmp/test-home",
    );
    expect(result?.snapshot.servers[0]).toMatchObject({
      name: "db",
      toolCount: 1,
      needsAuth: true,
      definedIn: "/tmp/test-home/.kiro/settings/mcp.json",
    });
    expect(result?.snapshot.servers[1]).toMatchObject({
      definedIn: "/tmp/test-home/.kiro/agents/kirocrew.json",
      needsAuth: false,
    });
  });
  it("derives absolute workspace resources and refuses unknown resource files", () => {
    const result = normalizeMcpStatus({
      sessionId: "workspace",
      servers: [
        {
          name: "local",
          status: "connected",
          _meta: {
            kiro: {
              resource: {
                layer: "workspace",
                krn: "krn:workspace:/tmp/project:mcp-server/settings/mcp.json#mcpServers/local",
              },
            },
          },
        },
        {
          name: "unknown",
          status: "connecting",
          _meta: {
            kiro: {
              resource: {
                layer: "user-local",
                krn: "invalid%",
              },
            },
          },
        },
      ],
    });
    expect(result?.snapshot.servers[0]?.definedIn).toBe("/tmp/project/.kiro/settings/mcp.json");
    expect(result?.snapshot.servers[1]?.definedIn).toBeUndefined();
  });
  it("ignores malformed payloads and keeps the latest snapshot per native session", () => {
    expect(normalizeMcpStatus(null)).toBeUndefined();
    expect(normalizeMcpStatus({ sessionId: 1, servers: [] })).toBeUndefined();
    updateMcpStatus({ sessionId: "latest", servers: [{ name: "x", status: "connected" }, null] });
    expect(getMcpStatus("latest")?.servers).toHaveLength(1);
    updateMcpStatus({ sessionId: "latest", servers: [] });
    expect(getMcpStatus("latest")?.servers).toEqual([]);
  });
});
