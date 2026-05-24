import React from 'react'
import { useCampagne } from '../hooks/useCampagne'
import { useCliente } from '../hooks/useCliente'
import { SkeletonCard } from '../components/SkeletonCard'

const C = {
  orange: "#E8571A",
  green: "#2ECC8A",
  blue: "#60A5FA",
  purple: "#A78BFA",
  yellow: "#FBBF24",
  white: "#FFFFFF",
  navyDeep: "#0F1A30",
};

const F = { sans: "'DM Sans',sans-serif", serif: "'DM Serif Display',serif" };

export function DashboardPage({ onNav }) {
  const { cliente, loading: loadingCliente } = useCliente()
  const { campagne, loading: loadingCampagne, error } = useCampagne()

  const stats = {
    totali: campagne?.length || 0,
    inAttesa: campagne?.filter(c => c.stato_pagamento === 'in_attesa')?.length || 0,
    inDistribuzione: campagne?.filter(c => c.stato === 'in_distribuzione')?.length || 0,
    totaleSpeso: campagne?.reduce((acc, c) => acc + (c.totale_euro || 0), 0) || 0
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px', minHeight: '100vh', color: C.white, fontFamily: F.sans }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <div>
          <h1 style={{ fontFamily: F.serif, fontSize: 32, marginBottom: 4 }}>
            Ciao {loadingCliente ? '...' : cliente?.nome || 'Cliente'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.6 }}>Piano attivo:</span>
            <span style={{ 
              background: 'rgba(232,87,26,.15)', 
              color: C.orange, 
              padding: '2px 8px', 
              borderRadius: 6, 
              fontSize: 11, 
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>Premium</span>
          </div>
        </div>
        <button 
          onClick={() => onNav('step1')}
          className="vb"
          style={{ 
            background: C.orange, 
            color: C.white, 
            border: 'none', 
            padding: '12px 20px', 
            borderRadius: 10, 
            fontWeight: 700, 
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(232,87,26,.3)'
          }}
        >
          Nuova campagna +
        </button>
      </header>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 40 }}>
        {[
          { label: 'Campagne totali', value: stats.totali, color: C.white },
          { label: 'In attesa pagamento', value: stats.inAttesa, color: C.yellow, icon: '⏳' },
          { label: 'In distribuzione', value: stats.inDistribuzione, color: C.green, icon: '' },
          { label: 'Totale speso', value: `€${stats.totaleSpeso.toLocaleString('it-IT')}`, color: C.blue }
        ].map((kpi, i) => (
          <div key={i} style={{ 
            background: 'rgba(255,255,255,.03)', 
            border: '1px solid rgba(255,255,255,.08)', 
            padding: 20, 
            borderRadius: 16 
          }}>
            <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, display: 'flex', alignItems: 'center', gap: 10 }}>
              {kpi.value} {kpi.icon && <span style={{ fontSize: 20 }}>{kpi.icon}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Lista Campagne */}
      <section>
        <h2 style={{ fontFamily: F.serif, fontSize: 24, marginBottom: 20 }}>Le tue campagne</h2>
        
        {loadingCampagne ? (
          <div>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', background: 'rgba(255,255,255,.02)', borderRadius: 16 }}>
            <p style={{ opacity: 0.5 }}>Errore nel caricamento delle campagne: {error}</p>
          </div>
        ) : campagne.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', background: 'rgba(255,255,255,.02)', borderRadius: 20, border: '1px dashed rgba(255,255,255,.1)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}></div>
            <h3 style={{ marginBottom: 10 }}>Nessuna campagna ancora</h3>
            <p style={{ opacity: 0.5, marginBottom: 24 }}>Inizia ora a configurare la tua prima distribuzione professionale.</p>
            <button 
              onClick={() => onNav('step1')}
              style={{ background: 'transparent', color: C.orange, border: `1px solid ${C.orange}`, padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >
              Configura la tua prima campagna →
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 15 }}>
            {campagne.map(c => (
              <CampaignRow key={c.id} campagna={c} onVedi={() => onNav('campaign', { campaignId: c.id })} />
            ))}
          </div>
        )}
      </section>

      {/* CTA Bottom */}
      <div style={{ marginTop: 60, textAlign: 'center' }}>
        <button 
          onClick={() => onNav('step1')}
          style={{ opacity: 0.6, background: 'none', border: 'none', color: C.white, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
        >
          Torna al configuratore →
        </button>
      </div>
    </div>
  )
}

function CampaignRow({ campagna, onVedi }) {
  const serviceMeta = {
    d2d: { label: 'D2D', color: C.orange, bg: 'rgba(232,87,26,.1)' },
    h2h: { label: 'H2H', color: C.blue, bg: 'rgba(96,165,250,.1)' },
    b2b: { label: 'B2B', color: C.purple, bg: 'rgba(167,139,250,.1)' }
  }
  const meta = serviceMeta[campagna.servizio] || serviceMeta.d2d

  return (
    <div style={{ 
      background: 'rgba(255,255,255,.03)', 
      border: '1px solid rgba(255,255,255,.08)', 
      padding: '16px 20px', 
      borderRadius: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20,
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ 
          background: meta.bg, 
          color: meta.color, 
          width: 44, 
          height: 44, 
          borderRadius: 10, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 12
        }}>
          {meta.label}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>
            {campagna.comune_principale}
          </div>
          <div style={{ fontSize: 12, opacity: 0.4 }}>
            {campagna.quantita?.toLocaleString('it-IT')} volantini · {campagna.comuni_selezionati?.join(', ')}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, opacity: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>Pagamento</div>
          {campagna.stato_pagamento === 'pagato' ? (
            <span style={{ color: C.green, fontSize: 13, fontWeight: 600 }}> Pagato</span>
          ) : (
            <span style={{ color: C.yellow, fontSize: 13, fontWeight: 600 }}>⏳ In attesa bonifico</span>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, opacity: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>Periodo</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {campagna.data_inizio} → {campagna.data_fine}
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 80 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.white }}>
            €{campagna.totale_euro?.toFixed(2)}
          </div>
        </div>

        <button 
          onClick={onVedi}
          style={{ 
            background: 'rgba(255,255,255,.05)', 
            border: '1px solid rgba(255,255,255,.1)', 
            color: C.white, 
            padding: '8px 14px', 
            borderRadius: 8, 
            fontSize: 12, 
            fontWeight: 600, 
            cursor: 'pointer' 
          }}
        >
          Vedi dettaglio →
        </button>
      </div>
    </div>
  )
}
