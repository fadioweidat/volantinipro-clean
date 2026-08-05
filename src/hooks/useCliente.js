import { useEffect, useState } from 'react'
import { ensureSupabaseSessionBridge, supabase } from '../supabaseClient'

export function useCliente() {
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      try {
        await ensureSupabaseSessionBridge()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!user) { setLoading(false); return }
        const { data, error } = await supabase.from('profiles').select('id, full_name, company_name, role').eq('id', user.id).maybeSingle()
        if (error) throw error
        setCliente({ ...data, nome: data?.full_name || data?.company_name || null, email: user.email })
      } catch (loadError) {
        const log = /auth session missing/i.test(loadError?.message || '') ? console.warn : console.error
        log('[CUSTOMER_PROFILE_LOAD_FAILED]', { code: loadError?.code || null, message: loadError?.message || 'Errore sconosciuto' })
        setCliente(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { cliente, loading }
}
