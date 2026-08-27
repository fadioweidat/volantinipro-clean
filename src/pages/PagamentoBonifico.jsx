import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useCampagnaDetail } from '../hooks/useCampagnaDetail'
import { customerValue } from '../lib/customerCampaigns.js'
import { getBankTransferDetails, BANK_TRANSFER_UNAVAILABLE_MESSAGE } from '../lib/bankTransfer.js'

// Nessun placeholder: coordinate reali solo se VITE_IBAN / VITE_INTESTATARIO
// / VITE_BANCA sono tutte configurate, altrimenti bonifico non disponibile.
const BANK = getBankTransferDetails()

const C = {
  orange: "#E8571A",
  green: "#2ECC8A",
  blue: "#60A5FA",
  yellow: "#FBBF24",
  white: "#FFFFFF",
};
const F = { sans: "'DM Sans',sans-serif", serif: "'DM Serif Display',serif" };

export function PagamentoBonificoPage({ campaignId, onNav }) {
  const { campagna, loading } = useCampagnaDetail(campaignId)
  const [copied, setCopied] = useState(null)
  const [statoPagamento, setStatoPagamento] = useState('in_attesa')

  function copia(testo, label) {
    navigator.clipboard.writeText(testo)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  useEffect(() => {
    if (!supabase || !campaignId) return
    const interval = setInterval(async () => {
      const { data } = await supabase.from('campaigns').select('metadata').eq('id', campaignId).single()
      if (data?.metadata?.payment_status === 'pagato') {
        setStatoPagamento('pagato')
        clearInterval(interval)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [campaignId])

  if (loading) return <div style={{ color: C.white, padding: 40 }}>Caricamento istruzioni...</div>

  if (!campagna) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 20px', color: C.white, fontFamily: F.sans }}>
        <h1 style={{ fontFamily: F.serif, fontSize: 32, marginBottom: 10 }}>Pagamento non disponibile</h1>
        <p style={{ opacity: 0.6, lineHeight: 1.6 }}>Le istruzioni di bonifico richiedono una campagna reale salvata nel database.</p>
      </div>
    )
  }

  const info = campagna

  return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 20px', color: C.white, fontFamily: F.sans }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}></div>
        <h1 style={{ fontFamily: F.serif, fontSize: 32, marginBottom: 10 }}>Campagna confermata!</h1>
        <p style={{ opacity: 0.6, lineHeight: 1.6 }}>Completa il pagamento tramite bonifico bancario per avviare la distribuzione del materiale.</p>
      </div>

      <div style={{ 
        background: 'rgba(255,255,255,.03)', 
        border: '1px solid rgba(255,255,255,.08)', 
        borderRadius: 20, 
        overflow: 'hidden' 
      }}>
        <div style={{ background: 'rgba(255,255,255,.03)', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,.05)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span></span> ISTRUZIONI BONIFICO
        </div>
        
        <div style={{ padding: '24px' }}>
          {!BANK.available ? (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.75)', lineHeight: 1.6, margin: 0 }}>
              {BANK_TRANSFER_UNAVAILABLE_MESSAGE}
            </p>
          ) : (<>
          {[
            { label: 'Intestatario', value: BANK.intestatario },
            { label: 'Banca', value: BANK.banca },
            { label: 'IBAN', value: BANK.iban, copy: true },
            { label: 'Importo', value: info.totale_euro == null ? customerValue(null) : `€${info.totale_euro.toFixed(2)}`, copy: info.totale_euro != null, valueToCopy: info.totale_euro?.toFixed(2) },
            { label: 'Causale', value: customerValue(info.causale_bonifico), copy: Boolean(info.causale_bonifico), bold: true },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i === 4 ? 'none' : '1px solid rgba(255,255,255,.04)' }}>
              <div style={{ opacity: 0.5, fontSize: 14 }}>{row.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: row.bold ? 800 : 500, color: row.bold ? C.orange : C.white }}>{row.value}</span>
                {row.copy && (
                  <button 
                    onClick={() => copia(row.valueToCopy || row.value, row.label)}
                    style={{ background: 'rgba(255,255,255,.05)', border: 'none', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', color: C.white, fontSize: 10 }}
                  >
                    {copied === row.label ? 'Copiato! ' : 'Copia '}
                  </button>
                )}
              </div>
            </div>
          ))}

          <div style={{ marginTop: 24, padding: 16, background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 12 }}>
            <p style={{ fontSize: 13, color: C.yellow, lineHeight: 1.5 }}>
              ️ <strong>Importante:</strong> Inserire la causale ESATTA indicata sopra per permettere l'abbinamento automatico del pagamento.<br/>
              ⏱ La distribuzione parte entro 24h lavorative dal ricevimento del bonifico.
            </p>
          </div>
          </>)}
        </div>
      </div>

      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 14, opacity: 0.5, marginBottom: 24 }}>
           Le istruzioni sono state inviate alla tua email.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statoPagamento === 'pagato' ? C.green : C.yellow }}></div>
          <span style={{ fontWeight: 600 }}> Stato: {statoPagamento === 'pagato' ? ' Pagamento ricevuto!' : '⏳ In attesa del bonifico'}</span>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button style={{ padding: '12px 24px', borderRadius: 10, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: C.white, fontWeight: 600, cursor: 'pointer' }}>
             Scarica PDF
          </button>
          <button 
            onClick={() => onNav('dashboard')}
            style={{ padding: '12px 24px', borderRadius: 10, background: C.orange, border: 'none', color: C.white, fontWeight: 700, cursor: 'pointer' }}
          >
            Vai alla dashboard →
          </button>
        </div>
      </div>
    </div>
  )
}
