import React from "react";
import { ClientCampaignDetailAI } from "./ClientCampaignDetailAI.jsx";

const TRACKING_ITEM_IDS = Object.freeze([
  "client.tracking.gps_points_count",
  "client.tracking.last_update",
  "client.campaign.approved_photos_count",
  "client.tracking.coverage",
]);

export function ClientTrackingAI({ insights, loading = false, error = null }) {
  return <ClientCampaignDetailAI insights={insights} visibleItemIds={TRACKING_ITEM_IDS} title="Tracking spiegato dai dati disponibili" eyebrow="Tracking AI · sola lettura" loading={loading} error={error} />;
}
