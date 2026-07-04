import { useEffect, useRef, useState } from 'react'
import { supabase, ensureSupabaseSessionBridge } from '../supabaseClient'
import { allowMockData } from '../lib/runtimeFlags'

export function useCliente() {
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Guards against retrying the auto-create insert multiple times within the
  // same mount (e.g. re-renders while the effect's promise is still pending).
  const clientCreateAttemptedRef = useRef(false)

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setCliente(allowMockData ? { nome: 'Cliente Dev', email: 'dev@volantinipro.local' } : null)
        setLoading(false)
        return
      }
      try {
        await ensureSupabaseSessionBridge()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        if (import.meta.env.DEV) {
          console.log('[CLIENT_LOOKUP_STARTED]', user.email);
          console.log('[DASHBOARD_CLIENT_EMAIL]', user.email);
        }
        const { data, error: lookupError } = await supabase.from('clienti').select('*').eq('email', user.email).maybeSingle();
        if (data) {
          if (import.meta.env.DEV) console.log('[CLIENT_LOOKUP_SUCCESS]', data);
          console.log('[DASHBOARD_CLIENT_ID]', data.id);
          setCliente(data)
          setError(null)
          return
        }

        if (import.meta.env.DEV) console.log('[CLIENT_LOOKUP_NOT_FOUND]', lookupError?.message || user.email);

        if (clientCreateAttemptedRef.current) {
          // Already tried once this mount and it didn't resolve — don't
          // retry in a loop, just report the controlled error state.
          console.log('[DASHBOARD_CLIENT_ID]', null);
          setError('Cliente non configurato. Completa il profilo per vedere le campagne.')
          setCliente({ nome: user.email, email: user.email })
          return
        }
        clientCreateAttemptedRef.current = true

        // No client row for this email yet — auto-create one. The live
        // `clienti` schema has no user_id/updated_at columns, so email is
        // the only correlator and the payload stays minimal/safe.
        const createPayload = { email: user.email, nome: user.email }
        if (import.meta.env.DEV) console.log('[CLIENT_AUTO_CREATE_PAYLOAD]', createPayload);
        const { data: created, error: createError } = await supabase
          .from('clienti')
          .insert(createPayload)
          .select('*')
          .maybeSingle();

        if (createError || !created) {
          if (import.meta.env.DEV) console.error('[CLIENT_AUTO_CREATE_ERROR]', createError?.message || 'Nessuna riga creata');
          console.log('[DASHBOARD_CLIENT_ID]', null);
          setError('Cliente non configurato. Completa il profilo per vedere le campagne.')
          setCliente({ nome: user.email, email: user.email })
        } else {
          if (import.meta.env.DEV) console.log('[CLIENT_AUTO_CREATE_SUCCESS]', created);
          console.log('[DASHBOARD_CLIENT_ID]', created.id);
          setError(null)
          setCliente(created)
        }
      } catch (err) {
        if (import.meta.env.DEV) console.log('[CLIENT_LOOKUP_NOT_FOUND]', err?.message);
        console.log('[DASHBOARD_CLIENT_ID]', null);
        setError('Cliente non configurato. Completa il profilo per vedere le campagne.')
        setCliente(allowMockData ? { nome: 'Cliente Dev', email: 'dev@volantinipro.local' } : null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { cliente, loading, error }
}
