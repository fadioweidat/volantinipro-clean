import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { allowMockData } from '../lib/runtimeFlags'

export function useCliente() {
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setCliente(allowMockData ? { nome: 'Cliente Dev', email: 'dev@volantinipro.local' } : null)
        setLoading(false)
        return
      }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data } = await supabase.from('clienti').select('*').eq('email', user.email).single()
        setCliente(data || { nome: user.email, email: user.email })
      } catch {
        setCliente(allowMockData ? { nome: 'Cliente Dev', email: 'dev@volantinipro.local' } : null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { cliente, loading }
}
