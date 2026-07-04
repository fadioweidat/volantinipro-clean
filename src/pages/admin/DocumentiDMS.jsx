import { useEffect, useRef, useState } from "react";
import { listDocumenti, uploadDocumento, deleteDocumento, getDocumentoSignedUrl, formatBytes, isSupportedFile, DMS_CATEGORIE, DMS_CATEGORIA_LABELS } from "../../lib/services/dms-api.js";

const C = { orange: "#E8571A", green: "#2ECC8A", yellow: "#FBBF24", blue: "#60A5FA", red: "#F87171", white: "#FFFFFF" };
const F = { sans: "'DM Sans', Inter, system-ui, sans-serif", serif: "'DM Serif Display', Georgia, serif" };

export default function DocumentiDMS() {
  const [state, setState] = useState({ loading: true, error: null, rows: [], available: true });
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [uploadCategoria, setUploadCategoria] = useState(DMS_CATEGORIE[0]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const fileInputRef = useRef(null);

  const reload = async () => {
    setState((prev) => ({ ...prev, loading: true }));
    const result = await listDocumenti({ categoria: categoriaFilter, search });
    console.info("[DMS_DOCUMENTI_LOAD]", { count: result.rows.length, available: result.available, categoriaFilter, search });
    setState({ loading: false, error: result.error || null, rows: result.rows, available: result.available });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaFilter]);

  useEffect(() => {
    const timer = setTimeout(reload, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleFilePicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isSupportedFile(file)) {
      setNotice("Formato non supportato. Ammessi: PDF, JPEG, PNG, WEBP, DOCX, XLSX, CSV, ZIP, TXT.");
      return;
    }
    setUploading(true);
    try {
      await uploadDocumento({ file, categoria: uploadCategoria });
      setNotice(`"${file.name}" caricato.`);
      reload();
    } catch (err) {
      setNotice(err?.message || "Errore durante il caricamento.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const url = await getDocumentoSignedUrl(doc.storage_path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setNotice(err?.message || "Impossibile generare il link di download.");
    }
  };

  const handleDelete = async (doc) => {
    setBusyId(doc.id);
    try {
      await deleteDocumento(doc);
      setNotice(`"${doc.nome_file}" eliminato.`);
      reload();
    } catch (err) {
      setNotice(err?.message || "Errore durante l'eliminazione.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px", minHeight: "100vh" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={badgeStyle}>DMS</div>
        <h1 style={{ fontFamily: F.serif, fontSize: 30, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" }}>Archivio documenti</h1>
        <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)", margin: 0 }}>Upload/download reali su Supabase Storage — metadati e hash calcolati sul file effettivo.</p>
      </header>

      {notice && <div style={noticeStyle}>{notice}</div>}
      {state.error && <div style={{ ...noticeStyle, borderColor: "rgba(248,113,113,.3)", color: C.red }}>{state.error}</div>}
      {!state.available && !state.loading && (
        <div style={{ ...noticeStyle, borderColor: "rgba(251,191,36,.3)", color: C.yellow }}>
          Tabella "documenti" o bucket "documents" non ancora configurati (vedi DMS_ARCHIVIO_SETUP.sql).
        </div>
      )}

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <p style={eyebrowStyle}>Carica documento</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={uploadCategoria} onChange={(e) => setUploadCategoria(e.target.value)} style={selectStyle}>
            {DMS_CATEGORIE.map((id) => <option key={id} value={id}>{DMS_CATEGORIA_LABELS[id]}</option>)}
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={uploadButtonStyle}>
            {uploading ? "Caricamento..." : "Scegli file e carica"}
          </button>
          <input ref={fileInputRef} type="file" onChange={handleFilePicked} style={{ display: "none" }} accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.csv,.zip,.txt" />
          <span style={mutedTinyStyle}>PDF, JPEG, PNG, WEBP, DOCX, XLSX, CSV, ZIP, TXT</span>
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per nome file, tag, note..." style={searchInputStyle} />
        <select value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)} style={selectStyle}>
          <option value="all">Tutte le categorie</option>
          {DMS_CATEGORIE.map((id) => <option key={id} value={id}>{DMS_CATEGORIA_LABELS[id]}</option>)}
        </select>
      </div>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>{state.rows.length} documenti</p>
        {state.loading ? (
          <div style={mutedTinyStyle}>Caricamento...</div>
        ) : state.rows.length === 0 ? (
          <div style={emptyStyle}>Nessun documento reale trovato con questi filtri.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {state.rows.map((doc) => (
              <div key={doc.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.nome_file}</strong>
                  <div style={mutedTinyStyle}>
                    {DMS_CATEGORIA_LABELS[doc.categoria] || doc.categoria} · {formatBytes(doc.dimensione_bytes)} · {doc.formato?.toUpperCase()} · {new Date(doc.created_at).toLocaleString("it-IT")}
                    {doc.autore_email ? ` · ${doc.autore_email}` : ""}
                  </div>
                  {doc.hash && <div style={{ ...mutedTinyStyle, fontFamily: "monospace", opacity: 0.6 }}>SHA-256: {doc.hash.slice(0, 24)}...</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleDownload(doc)} style={actionButtonStyle}>Scarica</button>
                  <button onClick={() => handleDelete(doc)} disabled={busyId === doc.id} style={{ ...actionButtonStyle, color: C.red, borderColor: "rgba(248,113,113,.3)" }}>
                    {busyId === doc.id ? "..." : "Elimina"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const badgeStyle = { display: "inline-flex", padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange };
const cardStyle = { background: "#122036", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: 20 };
const eyebrowStyle = { margin: "0 0 10px", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.45)", letterSpacing: ".1em", textTransform: "uppercase" };
const mutedTinyStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)" };
const emptyStyle = { padding: 16, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 12 };
const noticeStyle = { padding: 12, marginBottom: 14, borderRadius: 10, border: "1px solid rgba(46,204,138,.24)", color: C.green, fontFamily: F.sans, fontSize: 12, background: "#122036" };
const searchInputStyle = { flex: 1, minWidth: 220, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: C.white, fontFamily: F.sans, fontSize: 13 };
const selectStyle = { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "#0c1826", color: C.white, fontFamily: F.sans, fontSize: 13 };
const uploadButtonStyle = { padding: "10px 18px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" };
const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" };
const actionButtonStyle = { padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.8)", fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer" };
