import { useEffect, useState } from 'react'
import { ensureSupabaseSessionBridge, supabase } from '../supabaseClient'
import { normalizeCustomerCampaign } from '../lib/customerCampaigns.js'

export function useCampagne() {
  const [campagne, setCampagne] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      try {
        await ensureSupabaseSessionBridge()
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user?.id) throw authError || new Error('Autenticazione Cliente richiesta.')
        const { data, error: queryError } = await supabase
          .from('campaigns')
          .select('*, campaign_zones(*)')
          .eq('user_id', authData.user.id)
          .order('created_at', { ascending: false })
        if (queryError) throw queryError
        setCampagne((data || []).map((row) => normalizeCustomerCampaign(row, row.campaign_zones)))
      } catch (loadError) {
        const log = /auth session missing|autenticazione cliente richiesta/i.test(loadError?.message || '') ? console.warn : console.error
        log('[CUSTOMER_CAMPAIGNS_LOAD_FAILED]', { code: loadError?.code || null, message: loadError?.message || 'Errore sconosciuto' })
        setError(loadError?.message || 'Campagne non disponibili.')
        setCampagne([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { campagne, loading, error }
}
