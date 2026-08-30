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
        
        let finalCoveragePct = null;
        if (data) {
          try {
            const coverage = await getFinalCoverage(id);
            finalCoveragePct = coverage?.final_operational_coverage_pct ?? null;
          } catch (e) {
            console.warn('[CAMPAIGN_DETAIL_COVERAGE_FAILED]', e?.message);
          }
        }
        
        const normalized = data ? normalizeCustomerCampaign(data, data.campaign_zones) : null;
        if (normalized) {
          normalized.copertura_pct = finalCoveragePct;
        }
        
        setCampagna(normalized)
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
