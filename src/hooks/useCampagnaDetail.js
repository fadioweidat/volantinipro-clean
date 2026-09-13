import { campaignSettlement, isCreditSettled } from '../lib/campaignSettlement.js';
import { useEffect, useState } from 'react'
import { ensureSupabaseSessionBridge, supabase } from '../supabaseClient'
import { normalizeCustomerCampaign } from '../lib/customerCampaigns.js'
import { getFinalCoverage } from '../lib/services/coverage-adjustments-api.js'

export function useCampagnaDetail(id) {
  const [campagna, setCampagna] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      if (!supabase || !id || id === 'demo') { setLoading(false); return }
      try {
        await ensureSupabaseSessionBridge()
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user?.id) throw authError || new Error('Autenticazione Cliente richiesta.')
        const { data, error: queryError } = await supabase
          .from('campaigns')
          .select('*, campaign_zones(*)')
          .eq('id', id)
          .eq('user_id', authData.user.id)
          .maybeSingle()
        if (queryError) throw queryError
        
        if (!data) {
          setCampagna(null);
          return;
        }

        const [coverageRes, settlementRes] = await Promise.allSettled([
          getFinalCoverage(id),
          campaignSettlement(id),
        ]);

        const finalCoveragePct = coverageRes.status === 'fulfilled'
          ? coverageRes.value?.final_operational_coverage_pct ?? null
          : null;
        if (coverageRes.status === 'rejected') {
          console.warn('[CAMPAIGN_DETAIL_COVERAGE_FAILED]', coverageRes.reason?.message);
        }

        const normalized = normalizeCustomerCampaign(data, data.campaign_zones);
        if (normalized) {
          normalized.copertura_pct = finalCoveragePct;
          const settlement = settlementRes.status === 'fulfilled'
            ? settlementRes.value
            : { settlement_status: 'unavailable', amount_due_cents: null };
          if (settlement.settlement_status === 'not_applicable') {
            normalized.settlement = settlement;
          } else {
            normalized.settlement = settlement;
            normalized.amount_due_euro = settlement.amount_due_cents == null ? null : settlement.amount_due_cents / 100;
            normalized.stato_pagamento = isCreditSettled(settlement)
              ? settlement.settlement_status
              : settlement.settlement_status === 'awaiting_payment' ? 'in_attesa' : 'review_required';
          }
        }

        setCampagna(normalized);
      } catch (loadError) {
        console.error('[CUSTOMER_CAMPAIGN_DETAIL_LOAD_FAILED]', { code: loadError?.code || null, message: loadError?.message || 'Errore sconosciuto' })
        setError(loadError?.message || 'Dettaglio campagna non disponibile.')
        setCampagna(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  return { campagna, loading, error }
}
