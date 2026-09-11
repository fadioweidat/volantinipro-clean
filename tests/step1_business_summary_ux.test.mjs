import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BUSINESS_TARGET_OPTIONS,
  BUSINESS_OBJECTIVES,
  BUSINESS_DELIVERY_METHODS,
  BUSINESS_MATERIAL_LOCATIONS,
  BUSINESS_COPY_MODES,
  businessOptionLabel,
} from '../src/lib/business/business-config.js';
import { activityButtons } from '../src/lib/activityButtons.js';

const step1Code = readFileSync(resolve('src/pages/public/configurator/Step1.jsx'), 'utf8');
const businessConfigCode = readFileSync(resolve('src/components/business/BusinessStep1Config.jsx'), 'utf8');

test('Step 1 Section 2: Heading and supporting copy differentiate B2B from non-B2B', () => {
  assert.ok(
    step1Code.includes('isB2B ? "Qual \u00e8 il tuo settore?" : "Che tipo di attivit\u00e0 devi pubblicizzare?"'),
    'Step1 Section 2 heading must dynamically switch to "Qual el tuo settore?" for B2B'
  );

  assert.ok(
    step1Code.includes(
      'isB2B ? "Indica il settore della tua attivit\u00e0. Nel passaggio successivo scegli quali aziende o attivit\u00e0 vuoi raggiungere." : '
    ),
    'Step1 Section 2 supporting copy must guide user about selecting their own sector vs target businesses in Step 2'
  );
});

test('BusinessStep1Config: Target section heading and description are crystal clear', () => {
  assert.ok(
    businessConfigCode.includes('title="Quali attivit\u00e0 vuoi raggiungere?"'),
    'Business config must have title "Quali attivita vuoi raggiungere?"'
  );
  assert.ok(
    businessConfigCode.includes('description="Seleziona le categorie di attivit\u00e0 che vuoi raggiungere con la distribuzione."'),
    'Business config must have supporting copy "Seleziona le categorie di attivita che vuoi raggiungere con la distribuzione."'
  );
});

test('Step 1 Right-side summary: Service name is "Distribuzione Business" in B2B mode', () => {
  assert.ok(
    step1Code.includes('b2b: "Distribuzione Business"'),
    'Service label for b2b must be "Distribuzione Business"'
  );
  assert.ok(
    step1Code.includes('"business-distribution": "Distribuzione Business"'),
    'Service label for business-distribution must be "Distribuzione Business"'
  );
});

test('Step 1 Right-side summary: B2B summary fields formatting logic', () => {
  const formatTargets = (b2bTargets, businessOtherTarget = '') => {
    if (!b2bTargets.length) return "Da selezionare";
    if (b2bTargets.includes("all")) return "Selezione generale";
    if (b2bTargets.length <= 2) {
      return b2bTargets
        .map(t => (t === "altro" && businessOtherTarget ? `Altro (${businessOtherTarget})` : BUSINESS_TARGET_OPTIONS.find(o => o.value === t)?.label || t))
        .join(", ");
    }
    return `${b2bTargets.length} categorie selezionate`;
  };

  assert.equal(formatTargets([]), "Da selezionare");
  assert.equal(formatTargets(['all']), "Selezione generale");
  assert.equal(formatTargets(['business']), "Uffici e aziende");
  assert.equal(formatTargets(['business', 'professional_services']), "Uffici e aziende, Studi professionali");
  assert.equal(formatTargets(['business', 'professional_services', 'retail']), "3 categorie selezionate");

  const BUSINESS_OBJECTIVE_MACROS = [
    ["information", "Informare"],
    ["coupons", "Promuovere"],
    ["service_presentation", "Vendere"],
    ["b2b_partnership", "Partnership"],
    ["professional_event", "Evento"],
    ["catalogues", "Cataloghi / campioni"],
  ];

  const formatObjective = (objective) => {
    const macroObj = { display_material: "coupons", other: "information" }[objective] || objective;
    return objective
      ? (BUSINESS_OBJECTIVE_MACROS.find(o => o[0] === macroObj)?.[1] ||
         BUSINESS_OBJECTIVES.find(o => (Array.isArray(o) ? o[0] : o.value) === objective)?.[1] ||
         objective)
      : "Da selezionare";
  };

  assert.equal(formatObjective('coupons'), 'Promuovere');
  assert.equal(formatObjective('information'), 'Informare');
  assert.equal(formatObjective('service_presentation'), 'Vendere');
  assert.equal(formatObjective(undefined), 'Da selezionare');

  const formatDelivery = (method, other = '') => {
    return method
      ? (method === 'other' ? (other || 'Altro') : (BUSINESS_DELIVERY_METHODS.find(m => m.value === method)?.label || method))
      : "Da selezionare";
  };

  assert.equal(formatDelivery('manager'), 'Consegna al responsabile');
  assert.equal(formatDelivery('reception'), 'Consegna alla reception');
  assert.equal(formatDelivery(undefined), 'Da selezionare');

  const formatCopies = (mode, customCopies = 0) => {
    if (mode === "fixed_1") return "1 copia";
    if (mode === "fixed_2") return "2 copie";
    if (mode === "range_3_5") return "3–5 copie";
    if (mode === "custom") return customCopies ? `${customCopies} copie` : "Quantit\u00e0 personalizzata";
    if (mode === "by_category") return "Per categoria";
    if (mode === "to_define") return "Da definire con VolantiniPro";
    return businessOptionLabel(BUSINESS_COPY_MODES, mode) || "1 copia";
  };

  assert.equal(formatCopies('fixed_1'), '1 copia');
  assert.equal(formatCopies('range_3_5'), '3–5 copie');
  assert.equal(formatCopies('custom', 10), '10 copie');

  const formatMaterialLocation = (location) => {
    return location
      ? (BUSINESS_MATERIAL_LOCATIONS.find(loc => loc[0] === location)?.[1] || location)
      : "Da selezionare";
  };

  assert.equal(formatMaterialLocation('at_volantinipro'), 'Materiale gi\u00e0 presso VolantiniPro');
  assert.equal(formatMaterialLocation('pickup_client'), 'Ritiro presso il cliente');
  assert.equal(formatMaterialLocation(undefined), 'Da selezionare');
});
