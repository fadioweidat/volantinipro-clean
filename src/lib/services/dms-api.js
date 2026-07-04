import { supabase } from '../../supabaseClient.js';
import { logAuditEvent } from '../audit.js';

// DMS "Archivio base" vertical — real upload/download against Supabase
// Storage bucket `documents` (see DMS_ARCHIVIO_SETUP.sql), real metadata
// (hash/checksum computed client-side, not invented), real categories.
// Versioning, cestino/ripristino, OCR, full-text search, firma digitale are
// separate future verticals — not built here.

const BUCKET = 'documents';

export const DMS_CATEGORIE = [
  'contratto', 'preventivo', 'ordine', 'fattura', 'ricevuta', 'documento_fiscale',
  'ddt', 'report', 'foto', 'video', 'documentazione_cliente', 'documentazione_fornitore',
  'documentazione_operatore', 'allegato',
];

export const DMS_CATEGORIA_LABELS = {
  contratto: 'Contratto',
  preventivo: 'Preventivo',
  ordine: 'Ordine',
  fattura: 'Fattura',
  ricevuta: 'Ricevuta',
  documento_fiscale: 'Documento fiscale',
  ddt: 'DDT',
  report: 'Report',
  foto: 'Foto',
  video: 'Video',
  documentazione_cliente: 'Documentazione cliente',
  documentazione_fornitore: 'Documentazione fornitore',
  documentazione_operatore: 'Documentazione operatore',
  allegato: 'Allegato vario',
};

const ALLOWED_EXTENSIONS = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  zip: 'application/zip',
  txt: 'text/plain',
};

function extensionOf(filename) {
  return (filename || '').split('.').pop()?.toLowerCase() || '';
}

export function isSupportedFile(file) {
  const ext = extensionOf(file?.name);
  return Object.prototype.hasOwnProperty.call(ALLOWED_EXTENSIONS, ext);
}

async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadDocumento({ file, categoria, resourceType = null, resourceId = null, tag = [], note = null }) {
  if (!supabase) throw new Error('Supabase non configurato');
  if (!file) throw new Error('Seleziona un file.');
  if (!isSupportedFile(file)) {
    throw new Error(`Formato non supportato. Formati ammessi: ${Object.keys(ALLOWED_EXTENSIONS).join(', ').toUpperCase()}.`);
  }
  if (!DMS_CATEGORIE.includes(categoria)) throw new Error('Categoria non valida.');

  const ext = extensionOf(file.name);
  const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storagePath = `${categoria}/${Date.now()}-${uuid}.${ext}`;

  let hash = null;
  try {
    hash = await sha256Hex(file);
  } catch {
    // SHA-256 via WebCrypto requires a secure context (https/localhost); if
    // unavailable, upload proceeds without a checksum rather than failing.
  }

  try {
    const upload = await supabase.storage.from(BUCKET).upload(storagePath, file, { cacheControl: '3600', upsert: false });
    if (upload.error) throw upload.error;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user || null;

    const { data, error } = await supabase
      .from('documenti')
      .insert({
        nome_file: file.name,
        categoria,
        formato: ext,
        dimensione_bytes: file.size,
        hash,
        storage_path: storagePath,
        autore_id: user?.id || null,
        autore_email: user?.email || null,
        resource_type: resourceType,
        resource_id: resourceId ? String(resourceId) : null,
        tag: Array.isArray(tag) ? tag : [],
        note,
      })
      .select('*')
      .single();
    if (error) throw error;

    logAuditEvent({ action: 'dms_document_uploaded', resourceType: 'documenti', resourceId: data.id, metadata: { categoria, formato: ext, size: file.size } });
    return data;
  } catch (err) {
    logAuditEvent({ action: 'dms_document_upload_failed', resourceType: 'documenti', success: false, errorMessage: err?.message || String(err), metadata: { categoria } });
    throw err;
  }
}

export async function listDocumenti({ categoria = 'all', search = '', resourceType = null, resourceId = null } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    let query = supabase.from('documenti').select('*').order('created_at', { ascending: false });
    if (categoria !== 'all') query = query.eq('categoria', categoria);
    if (resourceType) query = query.eq('resource_type', resourceType);
    if (resourceId) query = query.eq('resource_id', String(resourceId));
    const { data, error } = await query;
    if (error) return { rows: [], available: false, error: error.message };
    let rows = Array.isArray(data) ? data : [];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((row) => [row.nome_file, row.categoria, row.note, ...(Array.isArray(row.tag) ? row.tag : [])].filter(Boolean).join(' ').toLowerCase().includes(needle));
    }
    return { rows, available: true };
  } catch (err) {
    return { rows: [], available: false, error: err?.message || String(err) };
  }
}

export async function getDocumentoSignedUrl(storagePath) {
  if (!supabase || !storagePath) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function deleteDocumento(doc) {
  if (!supabase) throw new Error('Supabase non configurato');
  try {
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await supabase.from('documenti').delete().eq('id', doc.id);
    if (error) throw error;
    logAuditEvent({ action: 'dms_document_deleted', resourceType: 'documenti', resourceId: doc.id, metadata: { nome_file: doc.nome_file } });
    return true;
  } catch (err) {
    logAuditEvent({ action: 'dms_document_delete_failed', resourceType: 'documenti', resourceId: doc.id, success: false, errorMessage: err?.message || String(err) });
    throw err;
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'n/d';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
