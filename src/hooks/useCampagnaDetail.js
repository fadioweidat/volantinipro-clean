import { useEffect, useState } from 'react'
import { ensureSupabaseSessionBridge, supabase } from '../supabaseClient'
import { normalizeCustomerCampaign } from '../lib/customerCampaigns.js'

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
        setCampagna(data ? normalizeCustomerCampaign(data, data.campaign_zones) : null)
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
