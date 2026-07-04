import { useEffect, useState } from 'react'
import { supabase, ensureSupabaseSessionBridge } from '../supabaseClient'
import { allowMockData } from '../lib/runtimeFlags'

const DEV_CAMPAGNE = [
  {
    id: 'dev-001',
    created_at: new Date().toISOString(),
    servizio: 'd2d',
    comune_principale: 'Varedo',
    comuni_selezionati: ['Varedo', 'Paderno Dugnano'],
    quantita: 10000,
    stato: 'in_distribuzione',
    stato_pagamento: 'pagato',
    smart_pairing_sconto: -40,
    totale_euro: 386.00,
    data_inizio: '2026-05-13',
    data_fine: '2026-05-15',
    copertura_pct: 91,
    causale_bonifico: 'VP-20260513-DEV01',
  }
]

function safeMeta(row) {
  if (!row?.metadata) return {}
  if (typeof row.metadata === 'object' && !Array.isArray(row.metadata)) return row.metadata
  try { return JSON.parse(row.metadata) || {} } catch { return {} }
}

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

function campaignBelongsToClient(row, user, cliente) {
  if (!row || !user?.email) return false
  const meta = safeMeta(row)
  const clientId = cliente?.id || null
  const email = user.email
  if (clientId && row.cliente_id && String(row.cliente_id) === String(clientId)) return true
  if (sameText(row.email, email) || sameText(row.client_email, email) || sameText(row.cliente_email, email)) return true
  if (sameText(meta.client_email, email) || sameText(meta.email, email) || sameText(meta.cliente_email, email)) return true
  return false
}

export function useCampagne() {
  const [campagne, setCampagne] = useState(() => allowMockData ? DEV_CAMPAGNE : [])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      try {
        await ensureSupabaseSessionBridge()
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user || null
        if (!user?.email) {
          setCampagne([])
          setLoading(false)
          return
        }
        const { data: cliente } = await supabase.from('clienti').select('*').eq('email', user.email).maybeSingle()
        if (import.meta.env.DEV) console.log('[DASHBOARD_LIST_CAMPAIGNS_REQUEST]')
        const { data, error } = await supabase.from('campagne').select('*').order('created_at', { ascending: false })
        if (error) throw error
        const rows = Array.isArray(data) ? data : []
        const owned = rows.filter(row => campaignBelongsToClient(row, user, cliente))
        if (import.meta.env.DEV) console.log('[DASHBOARD_LIST_CAMPAIGNS_RESULT]', { count: owned.length, rawCount: rows.length })
        if (rows.length > 0 && owned.length === 0) console.warn('[DASHBOARD_CLIENT_PRIVACY_FILTER_EMPTY]', { rawCount: rows.length, email: user.email })
        setCampagne(owned)
      } catch (e) {
        if (import.meta.env.DEV) console.log('[DASHBOARD_LIST_CAMPAIGNS_ERROR]', e.message)
        setError(e.message)
        if (!allowMockData) setCampagne([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { campagne, loading, error }
}
