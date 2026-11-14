import * as Schema from "effect/Schema";

export const GlobalMcpTarget = Schema.Literals(["kiro", "codex"]);
const Name = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.-]{1,64}$/));
const Availability = Schema.Struct({ present: Schema.Boolean, enabled: Schema.Boolean });
export const GlobalMcpServer = Schema.Struct({
  name: Schema.String,
  transport: Schema.Literals(["stdio", "http"]),
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.optional(Schema.String),
  envKeys: Schema.Array(Schema.String),
  kiro: Availability,
  codex: Availability,
  writeCapable: Schema.Boolean,
  leadAccess: Schema.Boolean,
  managedByKiroCrew: Schema.optional(Schema.Boolean),
});
export type GlobalMcpServer = typeof GlobalMcpServer.Type;
export const GlobalMcpList = Schema.Struct({
  servers: Schema.Array(GlobalMcpServer),
  kiroFile: Schema.String,
  codexFile: Schema.String,
});
export const UpsertGlobalMcpInput = Schema.Struct({
  name: Name,
  transport: Schema.Literals(["stdio", "http"]),
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  targets: Schema.Array(GlobalMcpTarget),
});
export const SetGlobalMcpEnabledInput = Schema.Struct({
  name: Name,
  enabled: Schema.Boolean,
  targets: Schema.optional(Schema.Array(GlobalMcpTarget)),
});
export const SetGlobalMcpLeadAccessInput = Schema.Struct({ name: Name, allowed: Schema.Boolean });
export const RemoveGlobalMcpInput = Schema.Struct({
  name: Name,
  targets: Schema.Array(GlobalMcpTarget),
});
export class GlobalMcpError extends Schema.TaggedError<GlobalMcpError>()("GlobalMcpError", {}) {
  override get message() {
    return "Cannot read or update global MCP configuration.";
  }
}
