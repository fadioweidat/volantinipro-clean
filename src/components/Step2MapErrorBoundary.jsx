import React from "react";

// Boundary locale, solo intorno a <Step2Map>. Se la mappa Leaflet crasha
// (es. geometria corrotta sfuggita alla validazione, vedi
// lib/map/geometryValidation.js), il resto di Step2 (KPI, form, riepilogo)
// deve restare utilizzabile: senza questo boundary l'errore risale fino al
// primo boundary React a monte (nessuno, oggi), sbiancando l'intera pagina.
export class Step2MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Non nascosto in console dev: solo intercettato per non sbiancare la pagina.
    console.error("[Step2MapErrorBoundary] Step2Map crash", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: this.props.minHeight || 420,
          borderRadius: 16,
          background: "rgba(8,15,30,.55)",
          border: "1px solid rgba(239,68,68,.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
          color: "#FCA5A5",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 600,
        }}>
          Impossibile visualizzare temporaneamente la mappa.
        </div>
      );
    }
    return this.props.children;
  }
}
