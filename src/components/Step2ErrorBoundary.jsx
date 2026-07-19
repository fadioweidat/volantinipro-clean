import React, { Component, createRef } from 'react';

const ERROR_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createSafeStep2ErrorId() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  const suffix = [...bytes].map(value => ERROR_ID_ALPHABET[value % ERROR_ID_ALPHABET.length]).join('');
  return `S2-${suffix}`;
}

export class Step2ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null, retryKey: 0 };
    this.headingRef = createRef();
  }

  static getDerivedStateFromError() {
    return { hasError: true, errorId: createSafeStep2ErrorId() };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[Step2ErrorBoundary caught]', error, {
        errorId: this.state.errorId,
        componentStack: info?.componentStack,
      });
    }
  }

  componentDidUpdate(_previousProps, previousState) {
    if (!previousState.hasError && this.state.hasError) this.headingRef.current?.focus();
  }

  handleRetry = () => {
    this.setState(previous => ({
      hasError: false,
      errorId: null,
      retryKey: previous.retryKey + 1,
    }));
  };

  handleBack = () => {
    this.props.onBack?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section
          className="vp-step2-error-fallback"
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: 'calc(100vh - 24px)', padding: 'clamp(24px, 7vw, 72px) 20px',
            display: 'grid', placeItems: 'center', background: '#122036', fontFamily: 'DM Sans, sans-serif',
          }}
        >
          <div style={{ width: 'min(620px, 100%)', padding: 'clamp(24px, 5vw, 42px)', borderRadius: 18, background: '#0B192C', border: '1px solid rgba(255,255,255,.12)', color: '#FFFFFF', boxShadow: '0 24px 60px rgba(0,0,0,.24)' }}>
            <div style={{ color: '#FBBF24', fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>Step 2 · Zona e mappa</div>
            <h2 ref={this.headingRef} tabIndex={-1} style={{ fontSize: 'clamp(24px, 4vw, 34px)', lineHeight: 1.15, margin: '0 0 14px', outline: 'none' }}>
              Non siamo riusciti a mostrare questa parte della configurazione.
            </h2>
            <p style={{ color: 'rgba(255,255,255,.74)', fontSize: 15, lineHeight: 1.65, margin: '0 0 8px' }}>
              Le selezioni già inserite non sono state cancellate. Puoi riprovare oppure tornare allo step precedente.
            </p>
            <p style={{ color: 'rgba(255,255,255,.52)', fontSize: 12, margin: '0 0 24px' }}>
              Codice assistenza: <strong data-testid="step2-error-id">{this.state.errorId}</strong>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button type="button" className="vp-navbtn" onClick={this.handleRetry}>Riprova</button>
              <button type="button" className="vp-navbtn" onClick={this.handleBack}>Torna allo Step 1</button>
            </div>
          </div>
        </section>
      );
    }

    return React.Children.map(this.props.children, child => (
      React.isValidElement(child) ? React.cloneElement(child, { key: `step2-retry-${this.state.retryKey}` }) : child
    ));
  }
}
