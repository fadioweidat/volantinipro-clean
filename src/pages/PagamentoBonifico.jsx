import './customer/feasibility/feasibility.css';
import CampaignSettlementSummary from '../components/customer/CampaignSettlementSummary.jsx';
import { isCreditSettled } from '../lib/campaignSettlement.js';
import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useCampagnaDetail } from '../hooks/useCampagnaDetail'
import { customerValue } from '../lib/customerCampaigns.js'
import { getBankTransferDetails, BANK_TRANSFER_UNAVAILABLE_MESSAGE } from '../lib/bankTransfer.js'
import {
  IS_MANUAL_CONTACT,
  buildCampaignContactWhatsAppUrl,
  buildCampaignContactMailtoUrl,
} from '../lib/paymentMode.js'

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
    if (!supabase || !campaignId || !campagna || campagna.settlement?.settlement_status !== 'not_applicable') return
    const interval = setInterval(async () => {
      const { data } = await supabase.from('campaigns').select('metadata').eq('id', campaignId).single()
      if (data?.metadata?.payment_status === 'pagato') {
        setStatoPagamento('pagato')
        clearInterval(interval)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [campaignId, campagna])

  if (loading) return <div style={{ color: C.white, padding: 40 }}>Caricamento istruzioni...</div>

  if (!campagna) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 20px', color: C.white, fontFamily: F.sans }}>
        <h1 style={{ fontFamily: F.serif, fontSize: 32, marginBottom: 10 }}>Pagamento non disponibile</h1>
        <p style={{ opacity: 0.6, lineHeight: 1.6 }}>Le istruzioni di bonifico richiedono una campagna reale salvata nel database.</p>
      </div>
    )
  }

  if (campagna.settlement && campagna.settlement.settlement_status !== 'not_applicable') {
    const s=campagna.settlement;
    return <main className="vf-page"><div className="vf-shell"><section className="vf-panel">
      <CampaignSettlementSummary settlement={s}/>
      {s.amount_due_cents>0&&!isCreditSettled(s)&&<>
        <p>Richiedi le istruzioni per il solo residuo indicato. L’incasso sarà verificato da Admin.</p>
        <div className="vf-actions"><a href={buildCampaignContactMailtoUrl(campagna)}>Richiedi istruzioni email</a>
          {buildCampaignContactWhatsAppUrl(campagna)&&<a target="_blank" rel="noreferrer" href={buildCampaignContactWhatsAppUrl(campagna)}>Richiedi istruzioni WhatsApp</a>}
        </div>
      </>}
      <div className="vf-actions"><button className="vf-primary" onClick={()=>window.location.reload()}>Aggiorna saldo</button><button onClick={()=>onNav('dashboard')}>Dashboard</button></div>
    </section></div></main>;
  }
  if (IS_MANUAL_CONTACT) {
    const contactPayload = campagna || campaignId || null
    const waUrl = buildCampaignContactWhatsAppUrl(contactPayload)
    const mailUrl = buildCampaignContactMailtoUrl(contactPayload)
    const primaryBtn = {
      minHeight: 48,
      padding: "0 20px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      border: "none",
      background: "#25D366",
      color: "#0B1020",
      fontFamily: F.sans,
      fontSize: 15,
      fontWeight: 900,
      textDecoration: "none",
      cursor: "pointer",
      boxShadow: "0 8px 22px rgba(37,211,102,.28)",
      width: "100%",
      boxSizing: "border-box",
      textAlign: "center",
    }
    const secondaryBtn = {
      minHeight: 44,
      padding: "0 16px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      border: `1px solid ${C.orange}55`,
      background: `${C.orange}12`,
      color: C.orange,
      fontFamily: F.sans,
      fontSize: 14,
      fontWeight: 800,
      textDecoration: "none",
      cursor: "pointer",
      width: "100%",
      boxSizing: "border-box",
      textAlign: "center",
    }
    const tertiaryBtn = {
      minHeight: 44,
      padding: "0 16px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      border: "1px solid rgba(255,255,255,.14)",
      background: "transparent",
      color: "rgba(255,255,255,.72)",
      fontFamily: F.sans,
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      width: "100%",
      boxSizing: "border-box",
      textAlign: "center",
    }
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', color: C.white, fontFamily: F.sans }}>
        <div style={{
          background: 'rgba(255,255,255,.045)',
          border: '1px solid rgba(255,255,255,.09)',
          borderRadius: 16,
          padding: 28,
        }}>
          <div style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: 'rgba(46,204,138,.14)',
            border: '1px solid rgba(46,204,138,.34)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.green,
            fontSize: 24,
            fontWeight: 900,
            marginBottom: 16,
          }}>✓</div>
          <h1 style={{ fontFamily: F.serif, fontSize: 34, color: C.white, margin: '0 0 10px' }}>Campagna confermata</h1>
          <div style={{ fontFamily: F.sans, fontSize: 16, color: C.white, fontWeight: 700, lineHeight: 1.6, marginBottom: 6 }}>
            Abbiamo ricevuto correttamente la tua richiesta.
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 14, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, marginBottom: 14 }}>
            Per completare l'ordine, richiedi le istruzioni di pagamento tramite WhatsApp o Email.
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(251,191,36,.08)',
            border: '1px solid rgba(251,191,36,.22)',
            color: C.yellow,
            fontFamily: F.sans,
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 18,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.yellow }}></span>
            Pagamento non ancora completato
          </div>
          <br />
          {contactId && (
            <div style={{
              display: 'inline-block',
              padding: '7px 12px',
              borderRadius: 9,
              background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.1)',
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 800,
              color: 'rgba(255,255,255,.75)',
              marginBottom: 22,
              wordBreak: 'break-word',
              maxWidth: '100%',
            }}>
              ID campagna: {contactId}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
            {waUrl && <a href={waUrl} target="_blank" rel="noreferrer" style={primaryBtn}>Richiedi pagamento su WhatsApp</a>}
            <a href={mailUrl} style={secondaryBtn}>Richiedi pagamento via Email</a>
            <button onClick={() => onNav('dashboard')} style={tertiaryBtn}>Vai alla Dashboard</button>
          </div>
          {!waUrl && (
            <p style={{ fontFamily: F.sans, fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5, marginTop: 14, marginBottom: 0 }}>
              Scrivici via email per richiedere le istruzioni di pagamento.
            </p>
          )}
        </div>
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
