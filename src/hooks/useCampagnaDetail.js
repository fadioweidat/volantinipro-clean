import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { allowMockData } from '../lib/runtimeFlags'

// Regex patterns for ID classification
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VP_CODE_RE = /^VP-/i   // e.g. VP-12052026-001

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
    _isDemoData: true,
  }
}

export function useCampagnaDetail(id) {
  const [campagna, setCampagna] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [source, setSource]     = useState('not_found')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      // ── CASE 1: no ID provided ──
      if (!id || id === 'null' || id === 'undefined') {
        setCampagna(null)
        setSource('not_found')
        setLoading(false)
        return
      }

      // ── CASE 2: demo mode ──
      const isDemoSearchParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demoMode') === 'true'
      if (id === 'demo' || (import.meta.env.DEV && isDemoSearchParam)) {
        if (allowMockData || (import.meta.env.DEV && isDemoSearchParam)) {
          setCampagna(getDevCampaign('demo'))
          setSource('demo')
        } else {
          setCampagna(null)
          setSource('not_found')
        }
        setLoading(false)
        return
      }

      // ── CASE 3: VP-code (e.g. VP-12052026-001) ──
      if (VP_CODE_RE.test(id)) {
        if (import.meta.env.DEV) {
          console.log('[useCampagnaDetail] VP-code detected:', id)
        }
        if (supabase) {
          try {
            const { data, error: sbErr } = await supabase
              .from('campagne')
              .select('*, clienti(*)')
              .eq('causale_bonifico', id)
              .maybeSingle()
            if (sbErr) {
              setError({ message: `Errore database su codice ${id}: ${sbErr.message}`, code: 'VP_CODE_ERROR' })
              setCampagna(null)
              setSource('error')
            } else if (data) {
              setCampagna(data)
              setSource('supabase:codice')
            } else {
              setError({ message: `Codice campagna non collegato al database`, code: 'VP_CODE_NO_MATCH' })
              setCampagna(null)
              setSource('not_found')
            }
          } catch (e) {
            setError({ message: 'Errore di rete durante la ricerca del codice campagna.', code: 'VP_CODE_ERROR' })
            setCampagna(null)
            setSource('error')
          }
        } else {
          setError({ message: `Codice campagna non collegato al database (backend non configurato).`, code: 'NO_SUPABASE' })
          setCampagna(null)
          setSource('not_found')
        }
        setLoading(false)
        return
      }

      // ── CASE 4: UUID → real Supabase lookup ──
      if (UUID_RE.test(id)) {
        if (!supabase) {
          setError({ message: 'Database non configurato.', code: 'NO_SUPABASE' })
          setCampagna(null)
          setSource('not_found')
          setLoading(false)
          return
        }
        try {
          let data = null
          let sbErr = null
          // Try without FK join first (avoids PostgREST 400 when clienti FK is not configured)
          const res = await supabase
            .from('campagne')
            .select('*')
            .eq('id', id)
            .maybeSingle()
          data = res.data
          sbErr = res.error
          if (sbErr) {
            setError(sbErr)
            setCampagna(null)
            setSource('error')
          } else if (data) {
            setCampagna(data)
            setSource('supabase:id')
          } else {
            setCampagna(null)
            setSource('not_found')
          }
        } catch (e) {
          setError(e)
          setCampagna(null)
          setSource('error')
        } finally {
          setLoading(false)
        }
        return
      }

      // ── CASE 5: unknown format → invalid ID ──
      setError({ message: `ID campagna non valido`, code: 'INVALID_ID' })
      setCampagna(null)
      setSource('invalid_id')
      setLoading(false)
    }

    load()
  }, [id])

  return { campagna, loading, error, source }
}
