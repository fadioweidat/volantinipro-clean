import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
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

export function useCampagne() {
  const [campagne, setCampagne] = useState(() => allowMockData ? DEV_CAMPAGNE : [])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      try {
        const { data, error } = await supabase.from('campagne').select('*').order('created_at', { ascending: false })
        if (error) throw error
        if (data?.length > 0) setCampagne(data)
      } catch (e) {
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
