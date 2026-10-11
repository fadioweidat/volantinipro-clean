import React, { useCallback, useMemo, useState } from "react";
import VolantiniProAssistantDrawer from "../global/VolantiniProAssistantDrawer.jsx";
import VolantiniProAssistantTrigger from "../global/VolantiniProAssistantTrigger.jsx";
import { getAssistantRouteConfig, ASSISTANT_ROLES } from "../global/assistantRouteRegistry.js";
import { runCustomerDashboardAi } from "../../../ai/adapters/customerAssistantAdapter.js";
import { useCampagne } from "../../../hooks/useCampagne.js";
import { useCampagnaDetail } from "../../../hooks/useCampagnaDetail.js";
import { buildCustomerDashboardMetrics, buildCustomerDashboardNotes } from "../../../lib/customerDashboardMetrics.js";
import { CUSTOMER_DATA_UNAVAILABLE, CUSTOMER_PAYMENT_STATE, getCustomerPaymentState } from "../../../lib/customerCampaigns.js";
import "../quote/quote-assistant.css";

const HUMAN_REQUEST_PATTERN = /(?:parlare|sentire|contattare|scrivere).*(?:persona|operatore|consulente|umano|assistenza|admin)|(?:persona|operatore|consulente|umano|assistenza|admin).*(?:parlare|sentire|contattare|scrivere)/i;

export function CustomerContextCard({ campaign, stats }) {
  if (campaign) {
    return (
      <div className="quote-ai__context-card" aria-label="Dati campagna corrente">
        <div className="quote-ai__context-header">
          <span className="quote-ai__context-dot" />
          <strong>Dati campagna selezionata</strong>
        </div>
        <div className="quote-ai__context-grid">
          <div>
            <span className="quote-ai__context-label">Territorio</span>
            <span className="quote-ai__context-value">{campaign.comune_principale || campaign.citta || "Non specificato"}</span>
          </div>
          <div>
            <span className="quote-ai__context-label">Stato</span>
            <span className="quote-ai__context-value">{campaign.stato || "in attesa"}</span>
          </div>
          <div>
            <span className="quote-ai__context-label">Quantità</span>
            <span className="quote-ai__context-value">
              {campaign.quantita ? `${Number(campaign.quantita).toLocaleString("it-IT")} volantini` : "Non disponibile"}
            </span>
          </div>
          <div>
            <span className="quote-ai__context-label">Pagamento</span>
            <span className="quote-ai__context-value">{getCustomerPaymentState(campaign.stato_pagamento) === CUSTOMER_PAYMENT_STATE.PAID ? "Saldato" : getCustomerPaymentState(campaign.stato_pagamento) === CUSTOMER_PAYMENT_STATE.PENDING ? "In attesa" : CUSTOMER_DATA_UNAVAILABLE}</span>
          </div>
        </div>
      </div>
    );
  }

  if (stats) {
    return (
      <div className="quote-ai__context-card" aria-label="Riepilogo dashboard cliente">
        <div className="quote-ai__context-header">
          <span className="quote-ai__context-dot" />
          <strong>Riepilogo Area Cliente</strong>
        </div>
        <div className="quote-ai__context-grid">
          <div>
            <span className="quote-ai__context-label">Campagne totali</span>
            <span className="quote-ai__context-value">{stats.totali ?? CUSTOMER_DATA_UNAVAILABLE}</span>
          </div>
          <div>
            <span className="quote-ai__context-label">In distribuzione</span>
            <span className="quote-ai__context-value">{stats.inDistribuzione ?? CUSTOMER_DATA_UNAVAILABLE}</span>
          </div>
          <div>
            <span className="quote-ai__context-label">Da saldare</span>
            <span className="quote-ai__context-value">{stats.inAttesa ?? CUSTOMER_DATA_UNAVAILABLE}</span>
            {stats.paymentNote && <span className="quote-ai__context-label">{stats.paymentNote}</span>}
          </div>
          <div>
            <span className="quote-ai__context-label">Copertura dati</span>
            <span className="quote-ai__context-value">{stats.dataStatus}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function CustomerAssistantHost({ page }) {
  const [open, setOpen] = useState(false);
  const routeConfig = useMemo(() => getAssistantRouteConfig(page), [page]);

  const campaignId = routeConfig.campaignId || null;
  const isDetailPage = Boolean(campaignId);

  const { campagna: detailCampaign } = useCampagnaDetail(isDetailPage ? campaignId : null);
  const { campagne: dashboardCampaigns, loading, error } = useCampagne({ enabled: !isDetailPage });

  const stats = useMemo(() => {
    if (isDetailPage) return null;
    const list = dashboardCampaigns || [];
    const metrics = buildCustomerDashboardMetrics(dashboardCampaigns, { loading, error });
    const notes = buildCustomerDashboardNotes(dashboardCampaigns, { loading, error });
    const unavailable = loading || error || !Array.isArray(dashboardCampaigns);
    return {
      totali: unavailable ? null : list.length,
      inDistribuzione: unavailable || list.some(c => !c.stato) ? null : list.filter((c) => c.stato === "in_distribuzione").length,
      inAttesa: metrics.waitingPaymentCount,
      paymentNote: notes.payment,
      dataStatus: loading ? "Caricamento" : error ? "Errore di caricamento" : unavailable ? CUSTOMER_DATA_UNAVAILABLE : Object.values(metrics).some(value => value == null) ? "Dati incompleti" : "Indicatori disponibili",
    };
  }, [isDetailPage, dashboardCampaigns, loading, error]);

  const handleAsk = useCallback(
    async (question) => {
      if (HUMAN_REQUEST_PATTERN.test(question)) {
        return {
          text: "Puoi parlare direttamente con l'assistenza VolantiniPro: WhatsApp +39 351 767 3737 oppure Email info@volantinipro.it.",
          contacts: true,
        };
      }

      const res = await runCustomerDashboardAi({
        campaignId,
        snapshot: {
          view: page,
          campaignId,
        },
        question,
      });

      return {
        text: res.answer,
        contacts: false,
        action: res.action || null,
      };
    },
    [campaignId, page]
  );

  const handleNavigate = useCallback((route, action) => {
    const targetId = action?.campaignId || campaignId;
    if (route.startsWith("campaign")) {
      window.location.href = targetId ? `/campagna/${targetId}` : "/dashboard";
    } else if (route.startsWith("customer-tracking")) {
      window.location.href = targetId ? `/customer/campaigns/${targetId}/tracking` : "/dashboard";
    } else if (route.startsWith("customer-report")) {
      window.location.href = targetId ? `/customer/campaigns/${targetId}/report` : "/dashboard";
    } else if (route.startsWith("customer-payment")) {
      window.location.href = targetId ? `/customer/campaigns/${targetId}/payment` : "/dashboard";
    } else if (route.startsWith("messages")) {
      window.location.href = "/customer/messages";
    } else {
      window.location.href = "/dashboard";
    }
  }, [campaignId]);

  const handleConfirmAction = useCallback(async (action) => {
    return { allowed: true, message: `Azione "${action.summary || action.action}" verificata.` };
  }, []);

  if (!routeConfig.enabled || routeConfig.role !== ASSISTANT_ROLES.CUSTOMER) {
    return null;
  }

  const contextCard = (
    <CustomerContextCard
      campaign={isDetailPage ? detailCampaign : null}
      stats={!isDetailPage ? stats : null}
    />
  );

  return (
    <>
      <VolantiniProAssistantTrigger
        expanded={open}
        compactMobile
        onClick={() => setOpen((prev) => !prev)}
        label="Assistente VolantiniPro"
        badge="?"
        ariaControls="customer-assistant-drawer"
      />
      <VolantiniProAssistantDrawer
        key={page}
        open={open}
        onClose={() => setOpen(false)}
        role="customer"
        eyebrow={routeConfig.eyebrow}
        title={routeConfig.title}
        subtitle={routeConfig.subtitle}
        contextCard={contextCard}
        quickQuestions={routeConfig.quickQuestions || []}
        onAsk={handleAsk}
        onNavigate={handleNavigate}
        onConfirmAction={handleConfirmAction}
        disclaimer={routeConfig.disclaimer}
        inputPlaceholder={routeConfig.inputPlaceholder}
        welcomeTitle="Ciao! Come posso aiutarti?"
        welcomeText="Posso spiegare lo stato delle tue campagne, i dettagli di pianificazione e i dati di avanzamento in tempo reale."
        thinkingText="Consultazione dati autorizzati in corso…"
        fallbackTitle="Assistente momentaneamente non disponibile."
        fallbackText="I dati della tua area cliente continuano a essere consultabili a schermo."
        showHumanContacts={true}
      />
    </>
  );
}
