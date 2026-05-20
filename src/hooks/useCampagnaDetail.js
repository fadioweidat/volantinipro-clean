import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { allowMockData } from '../lib/runtimeFlags'

function getDevCampaign(id) {
  return {
    id,
    servizio: 'd2d',
    comune_principale: 'Varedo',
    comuni_selezionati: ['Varedo', 'Paderno Dugnano'],
    quantita: 10000,
    stato: 'in_distribuzione',
    stato_pagamento: 'pagato',
    totale_euro: 386.00,
    subtotale_distribuzione: 350.00,
    smart_pairing_sconto: -40,
    smart_pairing_zona: 'Bresso · zona vicina',
    data_inizio: '2026-05-13',
    data_fine: '2026-05-15',
    copertura_pct: 91,
    causale_bonifico: 'VP-20260513-DEV01',
    servizi_extra: ['stampa'],
  }
}

export function useCampagnaDetail(id) {
  const [campagna, setCampagna] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      if (!supabase || !id || id === 'demo') {
        setCampagna(allowMockData ? getDevCampaign(id || 'dev') : null)
        setLoading(false)
        return
      }
      try {
        const { data } = await supabase.from('campagne').select('*, clienti(*)').eq('id', id).single()
        setCampagna(data || (allowMockData ? getDevCampaign(id) : null))
      } catch {
        setCampagna(allowMockData ? getDevCampaign(id) : null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  return { campagna, loading }
}
