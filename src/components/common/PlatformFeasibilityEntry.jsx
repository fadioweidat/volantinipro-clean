import React from 'react';
import { openFeasibility } from '../../lib/feasibility/entryPoint.js';
import './platform-feasibility-entry.css';

export default function PlatformFeasibilityEntry({ onNavigate }) {
  return <button type="button" className="vp-platform-feasibility" onClick={() => {
    onNavigate?.();
    openFeasibility(null, window);
  }}>
    <span className="vp-platform-feasibility-title">Studio di Fattibilità AI <span className="vp-platform-feasibility-badge" aria-hidden="true">AI</span></span>
    <span className="vp-platform-feasibility-description">Scopri dove conviene distribuire</span>
  </button>;
}
