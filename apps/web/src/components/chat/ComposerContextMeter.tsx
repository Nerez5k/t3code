import { formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** What the meter shows: tokens in use, the window size and the auto-compact point. */
export interface ComposerContextUsage {
  readonly usedTokens: number;
  readonly maxTokens: number | null;
  readonly autoCompactThreshold: number | null;
}

/** Percent of the window in use, or null when the provider has not reported a maximum. */
export function contextMeterPercent(usage: ComposerContextUsage): number | null {
  if (usage.maxTokens === null || usage.maxTokens <= 0) return null;
  return Math.round(Math.max(0, Math.min(100, (usage.usedTokens / usage.maxTokens) * 100)));
}

/** A ring beside the model picker that fills with the thread's context use. */
export function ComposerContextMeter({ usage }: { readonly usage: ComposerContextUsage | null }) {
  if (usage === null) return null;
  const percent = contextMeterPercent(usage);
  const usedLabel = formatContextWindowTokens(usage.usedTokens);
  const maxTokens = percent === null ? null : usage.maxTokens;
  const threshold = usage.autoCompactThreshold;
  const tone = percent === null ? null : percent >= 90 ? "error" : percent >= 80 ? "warning" : null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            data-composer-context-meter
            aria-label={
              percent === null
                ? `Context: ${usedLabel} tokens used`
                : `Context: ${percent}% used, ${usedLabel} of ${formatContextWindowTokens(maxTokens)}`
            }
            className="inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-accent"
          />
        }
      >
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-25"
          />
          {percent !== null && percent > 0 ? (
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - Math.max(percent, 4) / 100)}
              className={cn(
                tone === "error"
                  ? "text-error"
                  : tone === "warning"
                    ? "text-warning"
                    : "text-foreground/70",
              )}
            />
          ) : null}
        </svg>
      </TooltipTrigger>
      <TooltipPopup side="top">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="text-foreground">
            {percent === null ? `Context: ${usedLabel} tokens used` : `Context: ${percent}% used`}
          </span>
          {maxTokens !== null ? (
            <span className="text-muted-foreground tabular-nums">
              {usage.usedTokens.toLocaleString("en-US")} / {maxTokens.toLocaleString("en-US")}{" "}
              tokens
            </span>
          ) : (
            <span className="text-muted-foreground">Max context not reported</span>
          )}
          {threshold !== null && threshold > 0 ? (
            <span className="text-muted-foreground">
              {formatContextWindowCompactionMessage(threshold)}
            </span>
          ) : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
