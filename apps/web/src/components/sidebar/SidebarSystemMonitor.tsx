import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, HostResourcesSnapshot } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { memo, useContext, useEffect } from "react";

import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const REFRESH_MS = 5_000;

export type SystemMetricTone = "normal" | "warning" | "error";

export interface SystemMetric {
  readonly id: "cpu" | "mem" | "dsk";
  readonly label: string;
  readonly percent: number;
  readonly tone: SystemMetricTone;
  readonly detail: string;
}

function toneFor(percent: number): SystemMetricTone {
  return percent >= 90 ? "error" : percent >= 70 ? "warning" : "normal";
}

function formatBytes(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  return gib >= 100 ? `${Math.round(gib)} GB` : `${gib.toFixed(1)} GB`;
}

function usedPercent(available: number, total: number): number {
  return Math.round(Math.max(0, Math.min(100, (1 - available / total) * 100)));
}

/** CPU, memory and disk use as shown in the sidebar; metrics the host did not report are left out. */
export function systemMetrics(snapshot: HostResourcesSnapshot): readonly SystemMetric[] {
  const metrics: SystemMetric[] = [];
  if (snapshot.cpuUtilization !== null) {
    const percent = Math.round(snapshot.cpuUtilization * 100);
    metrics.push({
      id: "cpu",
      label: "CPU",
      percent,
      tone: toneFor(percent),
      detail: `${percent}% of ${snapshot.cpuCount} cores`,
    });
  }
  if (snapshot.totalMemoryBytes > 0) {
    const percent = usedPercent(snapshot.availableMemoryBytes, snapshot.totalMemoryBytes);
    metrics.push({
      id: "mem",
      label: "MEM",
      percent,
      tone: toneFor(percent),
      detail: `${formatBytes(snapshot.totalMemoryBytes - snapshot.availableMemoryBytes)} of ${formatBytes(snapshot.totalMemoryBytes)} used`,
    });
  }
  if (snapshot.diskTotalBytes !== undefined && snapshot.diskAvailableBytes !== undefined) {
    const percent = usedPercent(snapshot.diskAvailableBytes, snapshot.diskTotalBytes);
    metrics.push({
      id: "dsk",
      label: "DSK",
      percent,
      tone: toneFor(percent),
      detail: `${formatBytes(snapshot.diskAvailableBytes)} free of ${formatBytes(snapshot.diskTotalBytes)}`,
    });
  }
  return metrics;
}

/** Refreshes while the window is visible and focused, so a background app costs nothing. */
function useFocusedRefresh(environmentId: EnvironmentId) {
  const registry = useContext(RegistryContext);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the host only while the window has focus and stops on blur or hide
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const refresh = () =>
      registry.refresh(serverEnvironment.hostResources({ environmentId, input: {} }));
    const sync = () => {
      const active = document.visibilityState === "visible" && document.hasFocus();
      if (active && timer === null) {
        refresh();
        timer = setInterval(refresh, REFRESH_MS);
      } else if (!active && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (timer !== null) clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [registry, environmentId]);
}

const TONE_CLASS: Record<SystemMetricTone, string> = {
  normal: "text-foreground/75",
  warning: "text-warning-foreground",
  error: "text-error-foreground",
};

function SystemMonitorReadout({ environmentId }: { readonly environmentId: EnvironmentId }) {
  useFocusedRefresh(environmentId);
  const navigate = useNavigate();
  const result = useAtomValue(serverEnvironment.hostResources({ environmentId, input: {} }));
  if (result._tag !== "Success") return null;
  const metrics = systemMetrics(result.value);
  if (metrics.length === 0) return null;
  return (
    <div
      data-sidebar-system-monitor
      className="flex items-center gap-0.5 px-1 font-mono text-2xs leading-none tabular-nums"
    >
      {metrics.map((metric) => (
        <Tooltip key={metric.id}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`${metric.label} ${metric.percent}%: ${metric.detail}`}
                onClick={() => void navigate({ to: "/settings/diagnostics" })}
                className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-accent"
              />
            }
          >
            <span className="text-muted-foreground/70 tracking-wide">{metric.label}</span>
            <span className={cn("font-medium", TONE_CLASS[metric.tone])}>{metric.percent}%</span>
          </TooltipTrigger>
          <TooltipPopup side="top">{metric.detail}</TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}

/** A Kiro-style readout of this machine's CPU, memory and disk use. */
export const SidebarSystemMonitor = memo(function SidebarSystemMonitor() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <SystemMonitorReadout environmentId={environmentId} />;
});
