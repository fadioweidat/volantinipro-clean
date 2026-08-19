import { useEffect, useState } from 'react'
import { ensureSupabaseSessionBridge, supabase, clearBridgedSupabaseSession } from '../supabaseClient'
import { normalizeCustomerCampaign } from '../lib/customerCampaigns.js'

const PENDING_CLAIM_KEY = 'volantinipro_pending_campaign_claim'

// P0-A: una campagna Step1-4 inviata da anonimo nasce con user_id = NULL
// (submit-campaign-request non crea mai un account). Step4.jsx salva qui
// id + email di QUELLA specifica campagna; al primo load autenticato della
// Dashboard Cliente proviamo a reclamarla una sola volta tramite l'RPC
// claim_public_campaign (verifica server-side: email verificata, campagna
// ancora non posseduta, email coincidente) — mai un claim globale per email.
async function claimPendingCampaignIfAny(authUser) {
  let pending = null
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_CLAIM_KEY) || 'null')
  } catch {
    pending = null
  }
  if (!pending?.campaignId || !pending?.clientEmail) return
  if (String(pending.clientEmail).trim().toLowerCase() !== String(authUser.email || '').trim().toLowerCase()) return

  const { error: claimError } = await supabase.rpc('claim_public_campaign', { p_campaign_id: pending.campaignId })
  if (!claimError) {
    try { localStorage.removeItem(PENDING_CLAIM_KEY) } catch {}
    return
  }
  // EMAIL_NOT_VERIFIED/AUTH_REQUIRED: riprovabile a un prossimo load, non rimuoviamo il pending.
  // CLAIM_NOT_ALLOWED (gia' reclamata da altri o id inesistente): non piu' riprovabile, va rimosso.
  if (/CLAIM_NOT_ALLOWED/.test(claimError.message || '')) {
    try { localStorage.removeItem(PENDING_CLAIM_KEY) } catch {}
  } else {
    console.warn('[PENDING_CAMPAIGN_CLAIM_FAILED]', { code: claimError.code || null, message: claimError.message || null })
  }
}

export function useCampagne() {
  const [campagne, setCampagne] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionInvalid, setSessionInvalid] = useState(false)

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      try {
        await ensureSupabaseSessionBridge()
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) {
          // Stesso motivo di useCliente.js: getUser() ha rifiutato il token
          // bridgeato, la sessione salvata va ripulita (non il pending claim,
          // chiave separata) invece di restare "attiva" indefinitamente.
          clearBridgedSupabaseSession()
          setSessionInvalid(true)
        }
        if (authError || !authData?.user?.id) throw authError || new Error('Autenticazione Cliente richiesta.')
        // Il claim e' un'operazione best-effort accessoria: un suo fallimento
        // imprevisto (es. eccezione di rete su supabase.rpc, non un {error}
        // gestito) non deve mai far fallire il caricamento delle campagne
        // reali gia' possedute dall'utente.
        try {
          await claimPendingCampaignIfAny(authData.user)
        } catch (claimException) {
          console.warn('[PENDING_CAMPAIGN_CLAIM_EXCEPTION]', { message: claimException?.message || null })
        }
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

  return { campagne, loading, error, sessionInvalid }
}
