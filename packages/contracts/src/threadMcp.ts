import * as Schema from "effect/Schema";
import { ThreadId } from "./baseSchemas.ts";

export const ThreadMcpStatusInput = Schema.Struct({ threadId: ThreadId });
export const ThreadMcpStatus = Schema.Struct({
  supported: Schema.Boolean,
  checkedAt: Schema.optional(Schema.String),
  servers: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      status: Schema.Literals(["connected", "connecting", "failed", "disabled"]),
      toolCount: Schema.Number,
      layer: Schema.optional(Schema.String),
      definedIn: Schema.optional(Schema.String),
      needsAuth: Schema.Boolean,
      authorizationUrl: Schema.optional(Schema.String),
    }),
  ),
});
export type ThreadMcpStatus = typeof ThreadMcpStatus.Type;
export const SetMcpServerEnabledInput = Schema.Struct({
  threadId: ThreadId,
  name: Schema.String,
  enabled: Schema.Boolean,
});
export const SetMcpServerEnabledResult = Schema.Struct({
  file: Schema.String,
  appliesTo: Schema.Literal("new-sessions"),
  managedByKiroCrew: Schema.Boolean,
});
export class ThreadMcpError extends Schema.TaggedError<ThreadMcpError>()("ThreadMcpError", {}) {
  override get message() {
    return "Cannot read or update this thread's MCP configuration.";
  }
}
