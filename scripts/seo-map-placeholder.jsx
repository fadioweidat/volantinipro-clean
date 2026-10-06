import React from 'react';

// Build-only boundary: the interactive map and territorial requests stay client-side.
// No territorial values or private/customer data are fabricated in the snapshot.
export default function SeoMapPlaceholder() {
  return <div style={{ minHeight: 380 }} aria-label="Mappa interattiva: Cormano e territori nel raggio di 3 chilometri" />;
}
