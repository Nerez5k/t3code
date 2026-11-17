import * as Schema from "effect/Schema";

/** The Opus lead + GPT backend team in ~/.kiro/t3-team/team.json (personal fork feature). */
export const TeamMode = Schema.Literals(["team", "solo"]);
export type TeamMode = typeof TeamMode.Type;

export const TeamConfig = Schema.Struct({
  mode: TeamMode,
  backendModel: Schema.String,
  backendEffort: Schema.String,
  backendEffortHard: Schema.String,
  codexInstances: Schema.Array(Schema.String),
  limitThresholdPercent: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  maxParallelDelegates: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
  riskReview: Schema.Boolean,
});
export type TeamConfig = typeof TeamConfig.Type;

export const TeamAccountStatus = Schema.Struct({
  id: Schema.String,
  usable: Schema.Boolean,
  why: Schema.optional(Schema.String),
  resetsAt: Schema.optional(Schema.String),
  used: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
});
export type TeamAccountStatus = typeof TeamAccountStatus.Type;

export const TeamStatus = Schema.Struct({
  installed: Schema.Boolean,
  leadAgentInstalled: Schema.Boolean,
  configPath: Schema.String,
  config: Schema.optional(TeamConfig),
  pick: Schema.optional(Schema.NullOr(Schema.String)),
  accounts: Schema.Array(TeamAccountStatus),
  error: Schema.optional(Schema.String),
});
export type TeamStatus = typeof TeamStatus.Type;

export class TeamConfigError extends Schema.TaggedError<TeamConfigError>()("TeamConfigError", {
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail;
  }
}
