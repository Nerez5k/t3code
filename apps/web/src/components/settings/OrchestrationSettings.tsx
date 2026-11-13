import type { TeamConfig, TeamStatus } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const BACKEND_MODELS = ["gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna"] as const;
const ACCOUNT_LABELS: Readonly<Record<string, string>> = {
  codex_codex_1_cli: "Codex 1",
  codex_codex_2_cli: "Codex 2",
};

function accountLabel(id: string) {
  return ACCOUNT_LABELS[id] ?? id;
}

/** Opus (Kiro, agent t3-lead) leads; GPT via Codex takes backend work. Backed by ~/.kiro/t3-team. */
export function OrchestrationSettings() {
  const environmentId = usePrimaryEnvironmentId();
  const getStatus = useAtomCommand(serverEnvironment.getTeamStatus, { reportFailure: false });
  const setConfig = useAtomCommand(serverEnvironment.setTeamConfig, { reportFailure: true });
  const [status, setStatus] = useState<TeamStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!environmentId) return;
    const result = await getStatus({ environmentId, input: {} });
    if (result._tag === "Success") {
      setStatus(result.value);
      setError(null);
    } else {
      setError("Could not read the team config.");
    }
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync, react/exhaustive-effect-dependencies, react/set-state-in-effect -- team.json lives on disk outside T3 settings; read it once per environment
  useEffect(() => void refresh(), [environmentId]);

  const save = async (patch: Partial<TeamConfig>) => {
    if (!environmentId || !status?.config) return;
    const next = { ...status.config, ...patch };
    setStatus({ ...status, config: next });
    const result = await setConfig({ environmentId, input: next });
    if (result._tag === "Success") {
      setStatus(result.value);
    } else {
      setError("Could not save team.json.");
      void refresh();
    }
  };

  const config = status?.config;
  return (
    <SettingsPageContainer>
      <SettingsSection id="orchestration-mode" title="Team">
        <SettingsRow
          title="Mode"
          description="Team: Opus plans, builds the frontend and reviews; GPT takes backend work. Solo: Opus does everything."
          control={
            <div className="flex gap-1 rounded-lg border border-border p-0.5">
              {(["team", "solo"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="xs"
                  variant={config?.mode === mode ? "secondary" : "ghost"}
                  disabled={!config}
                  onClick={() => void save({ mode })}
                >
                  {mode === "team" ? "Opus + GPT" : "Only Opus"}
                </Button>
              ))}
            </div>
          }
        />
        <SettingsRow
          title="Backend model"
          description="Model the lead delegates backend tasks to."
          control={
            <ValueSelect
              label="Backend model"
              value={config?.backendModel}
              options={BACKEND_MODELS}
              onChange={(backendModel) => void save({ backendModel })}
            />
          }
        />
        <SettingsRow
          title="Backend effort"
          description="Normal tasks, and hard debugging or complex migrations."
          control={
            <div className="flex gap-2">
              <ValueSelect
                label="Normal effort"
                value={config?.backendEffort}
                options={EFFORTS}
                onChange={(backendEffort) => void save({ backendEffort })}
              />
              <ValueSelect
                label="Hard effort"
                value={config?.backendEffortHard}
                options={EFFORTS}
                onChange={(backendEffortHard) => void save({ backendEffortHard })}
              />
            </div>
          }
        />
        <SettingsRow
          title="Parallel delegates"
          description="Most delegated tasks running at once."
          control={
            <ValueSelect
              label="Parallel delegates"
              value={config ? String(config.maxParallelDelegates) : undefined}
              options={["1", "2", "3"]}
              onChange={(value) => void save({ maxParallelDelegates: Number(value) })}
            />
          }
        />
        <SettingsRow
          title="Review risky changes"
          description="Auth, payments, migrations and data deletes get one extra review by the other model."
          control={
            <Switch
              checked={config?.riskReview ?? false}
              disabled={!config}
              onCheckedChange={(checked) => void save({ riskReview: Boolean(checked) })}
              aria-label="Review risky changes"
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        id="orchestration-accounts"
        title="Codex accounts"
        headerAction={
          <Button size="xs" variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      >
        {(status?.accounts ?? []).map((account) => {
          const enabled = config?.codexInstances.includes(account.id) ?? false;
          const used = Object.entries(account.used ?? {})
            .map(([label, percent]) => `${label} ${Math.round(percent)}%`)
            .join(" · ");
          return (
            <SettingsRow
              key={account.id}
              title={
                <span className="flex items-center gap-2">
                  {accountLabel(account.id)}
                  {status?.pick === account.id ? (
                    <span className="rounded bg-accent px-1.5 text-2xs text-foreground">
                      next delegate
                    </span>
                  ) : null}
                </span>
              }
              description={
                account.usable
                  ? used || "Ready"
                  : `${account.why ?? "Unavailable"}${account.resetsAt ? `, resets ${new Date(account.resetsAt).toLocaleString()}` : ""}`
              }
              control={
                <Switch
                  checked={enabled}
                  disabled={!config}
                  aria-label={`Use ${accountLabel(account.id)}`}
                  onCheckedChange={(checked) => {
                    if (!config) return;
                    const others = config.codexInstances.filter((id) => id !== account.id);
                    void save({ codexInstances: checked ? [...others, account.id] : others });
                  }}
                />
              }
            />
          );
        })}
        <SettingsRow
          title="Switch account at"
          description="Usage percent at which the lead stops sending work to an account."
          control={
            <ValueSelect
              label="Switch threshold"
              value={config ? String(config.limitThresholdPercent) : undefined}
              options={["80", "90", "95", "100"]}
              onChange={(value) => void save({ limitThresholdPercent: Number(value) })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="orchestration-setup" title="Setup">
        <SettingsRow
          title="Lead agent"
          description={
            status?.leadAgentInstalled
              ? "Installed. Pick Kiro · Opus · Agent t3-lead in the composer, or set it as the default model in Threads."
              : "Missing: ~/.kiro/agents/t3-lead.json"
          }
          control={<StatusDot ok={status?.leadAgentInstalled ?? false} />}
        />
        <SettingsRow
          title="Team config"
          description={error ?? status?.error ?? status?.configPath ?? "Loading…"}
          control={<StatusDot ok={Boolean(config) && !error} />}
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function StatusDot({ ok }: { readonly ok: boolean }) {
  return (
    <span
      aria-label={ok ? "OK" : "Problem"}
      className={ok ? "size-2 rounded-full bg-diff-addition" : "size-2 rounded-full bg-destructive"}
    />
  );
}

function ValueSelect({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly options: ReadonlyArray<string>;
  readonly onChange: (value: string) => void;
}) {
  const choices = value !== undefined && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select
      value={value ?? ""}
      disabled={value === undefined}
      onValueChange={(next) => {
        if (next !== null && next !== value) onChange(next);
      }}
    >
      <SelectTrigger aria-label={label} className="min-w-28" size="sm">
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {choices.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
