import React from "react";
import VolantiniProAssistantTrigger from "../ai/global/VolantiniProAssistantTrigger.jsx";

export default function InlineHelpCta({ onAsk, expanded = false }) {
  return <VolantiniProAssistantTrigger onAsk={onAsk} expanded={expanded} compactMobile />;
}
