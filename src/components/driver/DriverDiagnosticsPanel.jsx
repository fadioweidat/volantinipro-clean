import { useState } from 'react';
import { driverDiag } from '../../lib/diagnostics/driverDiagnostics.js';

// TEMP diagnostics panel (BUG D). Renders NOTHING unless this device has the
// diagnostics flag on (localStorage vp_diag_driver=1). Export is local only:
// copy to clipboard, download a file, or select the text manually. Nothing is
// transmitted anywhere.
const btn = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.35)',
  background: 'rgba(15,23,42,.92)', color: '#fff', fontSize: 12, fontWeight: 700,
};

export function DriverDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  if (!driverDiag.enabled) return null;

  const refresh = () => {
    driverDiag.flush();
    const next = driverDiag.exportText();
    setText(next);
    return next;
  };

  const copy = async () => {
    const value = refresh();
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copiato negli appunti.');
    } catch {
      setStatus('Copia automatica non disponibile: seleziona il testo e copia.');
    }
  };

  const download = () => {
    const value = refresh();
    try {
      const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vp-driver-diag.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus('File scaricato.');
    } catch {
      setStatus('Download non disponibile: usa Copia.');
    }
  };

  const wipe = () => {
    driverDiag.clear();
    setText('');
    setStatus('Buffer cancellato.');
  };

  const turnOff = () => {
    driverDiag.disable();
    window.location.reload();
  };

  return (
    <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 2147483000, maxWidth: 'calc(100vw - 16px)' }}>
      {!open && (
        <button type="button" style={btn} onClick={() => { setOpen(true); refresh(); }}>DIAG</button>
      )}
      {open && (
        <div style={{ background: 'rgba(15,23,42,.96)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 10, padding: 8, width: 320, maxWidth: '100%' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <button type="button" style={btn} onClick={copy}>Copia</button>
            <button type="button" style={btn} onClick={download}>Scarica</button>
            <button type="button" style={btn} onClick={refresh}>Aggiorna</button>
            <button type="button" style={btn} onClick={wipe}>Cancella</button>
            <button type="button" style={btn} onClick={turnOff}>Disattiva</button>
            <button type="button" style={btn} onClick={() => setOpen(false)}>Chiudi</button>
          </div>
          {status && <div style={{ color: '#86EFAC', fontSize: 11, marginBottom: 4 }}>{status}</div>}
          <textarea readOnly value={text} onFocus={(e) => e.target.select()}
            style={{ width: '100%', height: 140, fontSize: 10, background: '#0b1020', color: '#cbd5e1', border: '1px solid rgba(255,255,255,.2)', borderRadius: 6 }} />
        </div>
      )}
    </div>
  );
}
