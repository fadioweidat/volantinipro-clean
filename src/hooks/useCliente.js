import { useEffect, useState } from 'react'
import { ensureSupabaseSessionBridge, supabase, clearBridgedSupabaseSession } from '../supabaseClient'

export function useCliente() {
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionInvalid, setSessionInvalid] = useState(false)

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      try {
        await ensureSupabaseSessionBridge()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) {
          // P0: getUser() ha rifiutato il token bridgeato — access_token
          // scaduto E refresh_token non piu' valido (assente, scaduto,
          // revocato: es. vp_supabase_session vecchio rimasto in
          // localStorage). Questo E' il caso ATTESO per un visitatore
          // anonimo o una sessione stale, MAI un errore applicativo: niente
          // throw verso il catch generico sotto (che resta riservato a
          // fallimenti realmente inattesi, es. la query profilo). La
          // sessione viene comunque ripulita, cosi' non mente come "attiva"
          // a chi legge vp_supabase_session altrove (es. il badge di
          // DashboardPage), e il configuratore continua come anonimo senza
          // loggare [CUSTOMER_PROFILE_LOAD_FAILED].
          clearBridgedSupabaseSession()
          setSessionInvalid(true)
          setCliente(null)
          return
        }
        if (!user) { setCliente(null); return }
        const { data, error } = await supabase.from('profiles').select('id, full_name, company_name, role').eq('id', user.id).maybeSingle()
        if (error) throw error
        setCliente({ ...data, nome: data?.full_name || data?.company_name || null, email: user.email })
      } catch (loadError) {
        // Da qui in poi solo errori realmente inattesi (query profilo
        // fallita per rete/DB con uno user.id gia' valido) — il caso
        // "nessuna sessione" e' gestito sopra senza mai arrivare qui.
        console.error('[CUSTOMER_PROFILE_LOAD_FAILED]', { code: loadError?.code || null, message: loadError?.message || 'Errore sconosciuto' })
        setCliente(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { cliente, loading, sessionInvalid }
}
