import React, { useMemo } from "react";
import { buildTerritorialAiSnapshot } from "../../../lib/step2/buildTerritorialAiSnapshot.mjs";

const TerritorialAiAssistantPanel = React.lazy(() => import("../../../components/ai/territory/TerritorialAiAssistantPanel.jsx"));

export default function TerritorialStep2AiBoundary({
  truthModel,
  viewModel,
  loading = false,
  error = false,
  identity = null,
  contextId = null,
  activeCampaignRef = null,
  activeQuoteRef = null,
}) {
  const snapshot = useMemo(() => buildTerritorialAiSnapshot({
    truthModel,
    viewModel,
    loading,
    error,
  }), [truthModel, viewModel, loading, error]);

  return <TerritorialAiAssistantPanel
    snapshot={snapshot}
    identity={identity}
    contextId={contextId}
    activeCampaignRef={activeCampaignRef}
    activeQuoteRef={activeQuoteRef}
  />;
}
