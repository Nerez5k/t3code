import {
  AcpRegistryListSessionsResult,
  AcpRegistryOperationError,
  type AcpRegistryOperationErrorReason,
} from "@t3tools/contracts";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import type * as EffectAcpErrors from "effect-acp/errors";
import * as Effect from "effect/Effect";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import type { KiroSettings } from "../settings.ts";
import { makeKiroAcpRuntime } from "./acpSupport.ts";

const TIMEOUT = "30 seconds";

type Services = ChildProcessSpawner.ChildProcessSpawner | SecureRandom.SecureRandom;

function failure(reason: AcpRegistryOperationErrorReason, message: string) {
  return (cause?: unknown) =>
    new AcpRegistryOperationError({ reason, message, ...(cause ? { cause } : {}) });
}

/** Kiro's own sessions (CLI, IDE, Kiro Crew) listed and deleted over ACP, for import into T3. */
export function makeKiroSessionManagement(input: {
  readonly settings: KiroSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly provide: <A, E>(effect: Effect.Effect<A, E, Services>) => Effect.Effect<A, E>;
}): NonNullable<ProviderInstance["acpSessionManagement"]> {
  const withRuntime = <A>(
    cwd: string,
    use: (
      runtime: Effect.Success<ReturnType<typeof makeKiroAcpRuntime>>,
      initialized: { readonly loadSession: boolean; readonly canDelete: boolean },
    ) => Effect.Effect<A, EffectAcpErrors.AcpError>,
    error: ReturnType<typeof failure>,
  ) =>
    input.provide(
      Effect.gen(function* () {
        const runtime = yield* makeKiroAcpRuntime({
          settings: input.settings,
          environment: input.environment,
          cwd,
          clientInfo: { name: "t3-code-session-manager", version: "0.0.0" },
        });
        const started = yield* runtime.initialize();
        const capabilities = started.agentCapabilities;
        return yield* use(runtime, {
          loadSession: capabilities?.loadSession === true,
          canDelete: capabilities?.sessionCapabilities?.delete != null,
        });
      }).pipe(Effect.scoped, Effect.timeout(TIMEOUT), Effect.mapError(error)),
    );

  const unsupported = (reason: AcpRegistryOperationErrorReason, message: string) => () =>
    Effect.fail(failure(reason, message)());

  return {
    listSessions: ({ cwd, cursor }) =>
      withRuntime(
        cwd,
        (runtime, caps) =>
          Effect.map(runtime.listSessions(cursor), (listed) =>
            AcpRegistryListSessionsResult.make({
              sessions: listed.sessions
                .filter((session) => session.sessionId && session.cwd)
                .slice(0, 256)
                .map((session) => ({
                  sessionId: session.sessionId.slice(0, 1_024),
                  cwd: session.cwd.slice(0, 4_096),
                  additionalDirectories: [],
                  title: session.title ? session.title.slice(0, 1_024) : null,
                  updatedAt: session.updatedAt ? session.updatedAt.slice(0, 128) : null,
                  importedThreadId: null,
                })),
              nextCursor: listed.nextCursor ? listed.nextCursor.slice(0, 2_048) : null,
              canLoad: caps.loadSession,
              canResume: false,
              canDelete: caps.canDelete,
            }),
          ),
        failure("probe_failed", "Could not list Kiro sessions."),
      ),
    deleteSession: ({ cwd, sessionId }) =>
      withRuntime(
        cwd,
        (runtime) => Effect.asVoid(runtime.deleteSession(sessionId)),
        failure("session_delete_failed", "Could not delete the Kiro session."),
      ),
    listProviders: unsupported("providers_unsupported", "Kiro manages its own model providers."),
    setProvider: unsupported("providers_unsupported", "Kiro manages its own model providers."),
    disableProvider: unsupported("providers_unsupported", "Kiro manages its own model providers."),
    logout: unsupported("logout_unsupported", "Sign out with `kiro-cli logout`."),
  };
}
