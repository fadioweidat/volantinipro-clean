import { createClient } from '@supabase/supabase-js';

// Simuliamo l'esecuzione lato server (Fadi One o Edge Function)
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mqkelrsvksrzrpmbstvd.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Chiave temporanea simulata o letta dall'env
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAcceptanceTest() {
  console.log("=== AVVIO SIMULAZIONE FADI ONE (READ ONLY) ===\n");

  try {
    // 1. Fetch Campagne Attive
    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("id, status, quantity, service_type, created_at, start_date, end_date, distribution_mode")
      .in("status", ["pending", "active", "in_progress", "completed"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (campErr) throw campErr;

    // 2. Fetch Driver Assignments (Anomalies)
    const { data: assignments, error: assErr } = await supabase
      .from("operator_assignments")
      .select("id, status, created_at, starts_at, ends_at, campaign_id")
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false });

    if (assErr) throw assErr;

    const activeAssignedCampaigns = new Set(assignments.map((a) => a.campaign_id));
    const unassignedActiveCampaigns = campaigns.filter((c) => c.status === "active" && !activeAssignedCampaigns.has(c.id));

    // GENERAZIONE REPORT
    let report = `# REPORT OPERATIVO (Generato da VP-1 Fadi Gateway Simulator)\n\n`;
    report += `**Data di generazione:** ${new Date().toISOString()}\n`;
    report += `**Campagne Totali Rilevate:** ${campaigns.length}\n`;

    report += `\n## 📊 Stato Campagne\n`;
    const statusCount = {};
    campaigns.forEach(c => {
      statusCount[c.status] = (statusCount[c.status] || 0) + 1;
    });
    for (const [status, count] of Object.entries(statusCount)) {
      report += `- **${status.toUpperCase()}**: ${count}\n`;
    }

    report += `\n## 🚨 Anomalie Rilevate\n`;
    if (unassignedActiveCampaigns.length > 0) {
      report += `⚠️ Trovate ${unassignedActiveCampaigns.length} campagne ATTIVE ma senza driver assegnati:\n`;
      unassignedActiveCampaigns.forEach(c => {
        report += `   - ID: ${c.id.substring(0,8)}... | Qty: ${c.quantity} | Modalità: ${c.distribution_mode}\n`;
      });
    } else {
      report += `✅ Nessuna anomalia operativa rilevata. Tutti i driver sono correttamente assegnati alle campagne attive.\n`;
    }

    report += `\n## 📋 Ultime Campagne (Campione)\n`;
    campaigns.slice(0, 3).forEach(c => {
      report += `- [${c.status.toUpperCase()}] ID: ${c.id.substring(0,8)} | Servizio: ${c.service_type} | Qty: ${c.quantity}\n`;
    });

    console.log(report);
    console.log("\n=== TEST ACCEPTANCE COMPLETATO CON SUCCESSO. MUTAZIONI EFFETTUATE = 0 ===");

  } catch (error) {
    console.error("Errore durante il test:", error.message);
    process.exit(1);
  }
}

runAcceptanceTest();
