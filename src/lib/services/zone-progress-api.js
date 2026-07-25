import { supabase } from '../../supabaseClient.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {Object} ZoneProgress
 * @property {string} campaign_zone_id
 * @property {string} campaign_id
 * @property {string|null} zone_name
 * @property {string|null} address_label
 * @property {number} effective_percent
 * @property {string|null} updated_at
 * @property {number|null} automatic_percent
 * @property {number|null} manual_percent
 * @property {boolean|null} manual_override_enabled
 * @property {string|null} override_reason
 * @property {string|null} calculation_version
 * @property {Record<string, unknown>} source_summary
 * @property {string|null} automatic_updated_at
 * @property {string|null} updated_by
 */

/**
 * @typedef {Object} ZoneProgressHistoryEntry
 * @property {string} id
 * @property {string|null} progress_id
 * @property {string|null} campaign_zone_id
 * @property {string|null} campaign_id
 * @property {string} campaign_zone_id_snapshot
 * @property {string} campaign_id_snapshot
 * @property {string|null} zone_name_snapshot
 * @property {'automatic_recalc'|'manual_override'|'manual_clear'} event_type
 * @property {number|null} old_effective_percent
 * @property {number|null} new_effective_percent
 * @property {number|null} old_manual_percent
 * @property {number|null} new_manual_percent
 * @property {string} reason
 * @property {string|null} changed_by
 * @property {string} created_at
 */

export class ZoneProgressError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'ZoneProgressError';
    this.code = code;
    this.cause = cause;
  }
}

export function isZoneProgressAuthorizationError(error) {
  return error?.code === 'zone_progress_forbidden';
}

export function createZoneProgressClient(client) {
  function requireClient() {
    if (!client) {
      throw new ZoneProgressError(
        'zone_progress_unconfigured',
        'Servizio avanzamento zone non configurato.',
      );
    }
    return client;
  }

  return {
    /** @returns {Promise<ZoneProgress[]>} */
    async getCampaignZoneProgress(campaignId) {
      assertUuid(campaignId, 'campaignId');
      const { data, error } = await requireClient().rpc('get_campaign_zone_progress', {
        p_campaign_id: campaignId,
      });
      if (error) throw mapZoneProgressError(error);
      if (!Array.isArray(data)) {
        throw new ZoneProgressError(
          'zone_progress_invalid_response',
          'Risposta avanzamento zone non valida.',
        );
      }
      return data.map(normalizeProgressRow);
    },

    /** @returns {Promise<ZoneProgress>} */
    async setZoneManualProgress(campaignZoneId, manualPercent, reason) {
      assertUuid(campaignZoneId, 'campaignZoneId');
      const percent = Number(manualPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new ZoneProgressError(
          'zone_progress_invalid_percent',
          'La percentuale deve essere compresa tra 0 e 100.',
        );
      }
      const normalizedReason = normalizeReason(reason);
      const { data, error } = await requireClient().rpc('admin_set_zone_manual_progress', {
        p_campaign_zone_id: campaignZoneId,
        p_manual_percent: percent,
        p_reason: normalizedReason,
      });
      if (error) throw mapZoneProgressError(error);
      return normalizeProgressRow(unwrapProgressRow(data));
    },

    /** @returns {Promise<ZoneProgress>} */
    async clearZoneManualProgress(campaignZoneId, reason) {
      assertUuid(campaignZoneId, 'campaignZoneId');
      const normalizedReason = normalizeReason(reason);
      const { data, error } = await requireClient().rpc('admin_clear_zone_manual_progress', {
        p_campaign_zone_id: campaignZoneId,
        p_reason: normalizedReason,
      });
      if (error) throw mapZoneProgressError(error);
      return normalizeProgressRow(unwrapProgressRow(data));
    },

    /**
     * Admin-only history reader. No history RPC exists; access is enforced by
     * the table's Admin SELECT policy and uses the immutable campaign snapshot.
     * @returns {Promise<ZoneProgressHistoryEntry[]>}
     */
    async getCampaignZoneProgressHistory(campaignId) {
      assertUuid(campaignId, 'campaignId');
      const { data, error } = await requireClient()
        .from('campaign_zone_progress_history')
        .select([
          'id',
          'progress_id',
          'campaign_zone_id',
          'campaign_id',
          'campaign_zone_id_snapshot',
          'campaign_id_snapshot',
          'zone_name_snapshot',
          'event_type',
          'old_effective_percent',
          'new_effective_percent',
          'old_manual_percent',
          'new_manual_percent',
          'reason',
          'changed_by',
          'created_at',
        ].join(','))
        .eq('campaign_id_snapshot', campaignId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw mapZoneProgressError(error);
      if (!Array.isArray(data)) {
        throw new ZoneProgressError(
          'zone_progress_invalid_response',
          'Risposta storico avanzamento zone non valida.',
        );
      }
      return data.map(normalizeHistoryRow);
    },
  };
}

export const zoneProgressClient = createZoneProgressClient(supabase);

function assertUuid(value, field) {
  if (!UUID_PATTERN.test(String(value || ''))) {
    throw new ZoneProgressError(
      'zone_progress_invalid_id',
      `Identificativo ${field} non valido.`,
    );
  }
}

function normalizeReason(reason) {
  const normalized = String(reason || '').trim();
  if (!normalized) {
    throw new ZoneProgressError(
      'zone_progress_reason_required',
      'Il motivo della modifica è obbligatorio.',
    );
  }
  return normalized;
}

function unwrapProgressRow(data) {
  if (!Array.isArray(data)) return data;
  if (data.length !== 1) {
    throw new ZoneProgressError(
      'zone_progress_invalid_response',
      'Risposta avanzamento zona non valida.',
    );
  }
  return data[0];
}

function normalizeProgressRow(row) {
  if (!row || typeof row !== 'object' || !row.campaign_zone_id || !row.campaign_id) {
    throw new ZoneProgressError(
      'zone_progress_invalid_response',
      'Risposta avanzamento zona non valida.',
    );
  }
  const effectivePercent = nullableNumber(row.effective_percent);
  if (effectivePercent == null || effectivePercent < 0 || effectivePercent > 100) {
    throw new ZoneProgressError(
      'zone_progress_invalid_response',
      'Risposta avanzamento zona non valida.',
    );
  }
  return {
    campaign_zone_id: String(row.campaign_zone_id),
    campaign_id: String(row.campaign_id),
    zone_name: nullableText(row.zone_name),
    address_label: nullableText(row.address_label),
    effective_percent: effectivePercent,
    updated_at: nullableText(row.updated_at),
    automatic_percent: nullableNumber(row.automatic_percent),
    manual_percent: nullableNumber(row.manual_percent),
    manual_override_enabled: typeof row.manual_override_enabled === 'boolean'
      ? row.manual_override_enabled
      : null,
    override_reason: nullableText(row.override_reason),
    calculation_version: nullableText(row.calculation_version),
    source_summary: row.source_summary && typeof row.source_summary === 'object'
      ? row.source_summary
      : {},
    automatic_updated_at: nullableText(row.automatic_updated_at),
    updated_by: nullableText(row.updated_by),
  };
}

function normalizeHistoryRow(row) {
  if (
    !row ||
    typeof row !== 'object' ||
    !row.id ||
    !row.campaign_zone_id_snapshot ||
    !row.campaign_id_snapshot ||
    !['automatic_recalc', 'manual_override', 'manual_clear'].includes(row.event_type) ||
    typeof row.reason !== 'string' ||
    !row.created_at
  ) {
    throw new ZoneProgressError(
      'zone_progress_invalid_response',
      'Risposta storico avanzamento zone non valida.',
    );
  }
  return {
    ...row,
    old_effective_percent: nullableNumber(row.old_effective_percent),
    new_effective_percent: nullableNumber(row.new_effective_percent),
    old_manual_percent: nullableNumber(row.old_manual_percent),
    new_manual_percent: nullableNumber(row.new_manual_percent),
  };
}

function mapZoneProgressError(error) {
  const databaseCode = String(error?.code || '').toUpperCase();
  const databaseMessage = String(error?.message || error?.details || '').toUpperCase();
  if (
    databaseCode === '42501' ||
    databaseMessage.includes('NON_AUTORIZZAT') ||
    databaseMessage.includes('UTENTE_NON_AUTENTICATO')
  ) {
    return new ZoneProgressError(
      'zone_progress_forbidden',
      'Non hai i permessi per consultare o modificare questi progressi.',
      error,
    );
  }
  if (databaseCode === 'P0002' || databaseMessage.includes('ZONA_CAMPAGNA_NON_TROVATA')) {
    return new ZoneProgressError(
      'zone_progress_not_found',
      'Zona della campagna non trovata.',
      error,
    );
  }
  if (databaseCode === '22023') {
    return new ZoneProgressError(
      'zone_progress_invalid_input',
      'Dati avanzamento non validi.',
      error,
    );
  }
  return new ZoneProgressError(
    'zone_progress_request_failed',
    'Operazione avanzamento zone non riuscita.',
    error,
  );
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableText(value) {
  return value == null || value === '' ? null : String(value);
}
