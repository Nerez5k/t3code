import { createFileRoute } from "@tanstack/react-router";

import { OrchestrationSettings } from "../components/settings/OrchestrationSettings";

export const Route = createFileRoute("/_chat/settings/orchestration")({
  component: OrchestrationSettings,
});
