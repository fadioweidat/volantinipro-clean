export function AdminDashboardModulesPanel({ clientsQuotesCount, clientsStats, groupsCount, groupsOnline, programsStats, liveCount, smartPairingAvailable, smartPairingStats, commercial, onNav, ModuleCard }) {
  return (
    <>
      {/* Moduli principali (ticket: griglia compatta 2x2, Registro Ordini
          come modulo principale — non piu' nascosto in Strumenti avanzati).
          Stessa route esistente /admin/orders, nessuna nuova query: i dati
          vengono dallo stesso clientsQuotes gia' caricato da loadAdminHomeData. */}
      <section className="admin-home__module-grid" aria-label="Moduli principali">
        <ModuleCard
          title="Registro Ordini"
          stats={[
            { label: 'Totali', value: clientsQuotesCount },
            { label: 'Pagati', value: clientsStats.pagati },
            { label: 'Da pagare', value: clientsStats.daPagare },
            { label: 'Da assegnare', value: clientsStats.daAssegnare },
          ]}
          cta="Apri registro"
          onOpen={() => onNav('admin-orders')}
        />
        <ModuleCard
          title="Gruppi"
          stats={[
            { label: 'Gruppi', value: groupsCount },
            { label: 'Online', value: groupsOnline },
          ]}
          cta="Apri gruppi"
          onOpen={() => onNav('admin-groups-manager')}
        />
        <ModuleCard
          title="GPS & Programmi"
          stats={[
            { label: 'Programmi pronti', value: programsStats.pronti },
            { label: 'Live', value: liveCount },
            { label: 'Da confermare', value: programsStats.daConfermare },
          ]}
          cta="Apri GPS & Programmi"
          onOpen={() => onNav('admin-live')}
        />
        <ModuleCard
          title="Clienti & Preventivi"
          stats={[
            { label: 'Pagati', value: clientsStats.pagati },
            { label: 'Da pagare', value: clientsStats.daPagare },
            { label: 'Da assegnare', value: clientsStats.daAssegnare },
          ]}
          cta="Apri Clienti & Preventivi"
          onOpen={() => onNav('admin-clients-quotes')}
        />
      </section>

      {/* Secondari: due card compatte affiancate, non piu' un modulo a
          larghezza piena da solo. */}
      <section className="admin-home__module-grid admin-home__module-grid--secondary" aria-label="Moduli secondari">
        <ModuleCard
          title="Smart Pairing"
          stats={[
            { label: 'Richieste', value: smartPairingAvailable ? smartPairingStats.richieste : 'Non disponibile' },
            { label: 'Match disponibili', value: smartPairingAvailable ? smartPairingStats.match : 'Non disponibile' },
          ]}
          cta="Apri Smart Pairing"
          onOpen={() => onNav('admin-smart-pairing')}
        />
        <ModuleCard
          title="Commerciale"
          stats={[
            { label: 'Preventivi rapidi nuovi', value: commercial.metrics.newToday },
            { label: 'Da contattare', value: commercial.metrics.toContact },
            { label: 'Consulenze', value: 'Non configurato' },
            { label: 'Traffico', value: 'Non configurato' },
          ]}
          cta="Apri Commerciale"
          onOpen={() => onNav('admin-commercial')}
        />
        {/* Fornitori Marketplace: verifica / sospensione / rifiuto degli
            account Supplier. Nessuno stat qui: la lista reale e i contatori
            per stato vivono nella pagina dedicata (RPC/RLS Marketplace). */}
        <ModuleCard
          title="Fornitori"
          stats={[]}
          cta="Apri Fornitori"
          onOpen={() => onNav('admin-suppliers')}
        />
        {/* Centro Controllo Sito: stato piattaforma, errori reali, health
            dei flussi critici, provider esterni. Nessuno stat qui: i numeri
            vivono nella pagina dedicata, dove vengono calcolati dal vivo. */}
        <ModuleCard
          title="Centro Controllo Sito"
          stats={[]}
          cta="Apri Centro Controllo"
          onOpen={() => onNav('admin-status')}
        />
        {/* Studio Mappa: strumento autonomo di progettazione copertura su
            mappa — indipendente da campagne/Monitor/Driver, storage locale.
            Nessuno stat: apre la pagina dedicata /admin/map-studio. */}
        <ModuleCard
          title="Studio Mappa"
          stats={[]}
          cta="Apri Studio Mappa"
          onOpen={() => onNav('admin-map-studio')}
        />
        {/* Analytics Visitatori: traffico sito first-party privacy-safe
            (site_events) — panoramica, geografia, sorgenti, pagine, funnel,
            domanda commerciale. Nessuno stat qui: pagina dedicata. */}
        <ModuleCard
          title="Analytics Visitatori"
          stats={[]}
          cta="Apri Analytics"
          onOpen={() => onNav('admin-analytics')}
        />
        {/* Comunicazioni: hub centrale messaggi Cliente<->Admin e
            Driver<->Admin, segnalazioni, richieste di modifica campagna.
            Nessuno stat qui: contatori reali (non letti/per categoria)
            vivono nella pagina dedicata. */}
        <ModuleCard
          title="Comunicazioni"
          stats={[]}
          cta="Apri Comunicazioni"
          onOpen={() => onNav('admin-communications')}
        />
      </section>
    </>
  );
}
