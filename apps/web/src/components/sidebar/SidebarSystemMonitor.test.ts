import { describe, expect, it } from "vite-plus/test";

import { systemMetrics } from "./SidebarSystemMonitor";

const GiB = 1024 ** 3;

describe("systemMetrics", () => {
  it("reports CPU, memory and disk with Kiro-style tones", () => {
    const metrics = systemMetrics({
      sampledAt: 0,
      cpuUtilization: 0.13,
      cpuCount: 10,
      availableMemoryBytes: 4.32 * GiB,
      totalMemoryBytes: 16 * GiB,
      diskAvailableBytes: 4.9 * GiB,
      diskTotalBytes: 460 * GiB,
    });
    expect(metrics.map(({ label, percent, tone }) => [label, percent, tone])).toEqual([
      ["CPU", 13, "normal"],
      ["MEM", 73, "warning"],
      ["DSK", 99, "error"],
    ]);
    expect(metrics[2]?.detail).toBe("4.9 GB free of 460 GB");
  });

  it("leaves out metrics an older or limited host does not report", () => {
    const metrics = systemMetrics({
      sampledAt: 0,
      cpuUtilization: null,
      cpuCount: 4,
      availableMemoryBytes: 8 * GiB,
      totalMemoryBytes: 16 * GiB,
    });
    expect(metrics.map((metric) => metric.id)).toEqual(["mem"]);
  });
});
