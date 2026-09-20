# Step 1 reference redesign — baseline and existing contracts

Base HEAD: a92aa35242945f458d3cd7b23f56ad06933cb4eb
Branch: integration/rc2-full-site. origin fetched successfully; remote 2a9db746c24c39b07964f44650066cf8efc3412b is an ancestor. Five existing local commits and unrelated working changes are preserved.
Baseline: npm run build PASS; targeted tests 104/104 PASS (logs in qa-step1-redesign).

## Existing state and handlers (recorded before UI changes)
- AppRouter.jsx owns data/setData; PublicRoutes.jsx passes them into Step1 and Step2. No new canonical state is required.
- Step1.jsx updateData merges the existing state, applies applyConfiguratorServiceChange and synchronizes aliases: selectedService/type, businessSector/activityType, flyerQuantity/qty, campaignPeriodStart/startDate, campaignPeriodEnd/endDate, campaignPlan/subscription, printing and extraServices.
- Service IDs d2d/h2h/b2b come from distributionTypes. All 13 activityButtons backend values remain unchanged.
- Quantity presets update qty; slider min 1000/max 100000/step 1000; manual input normalizes on blur. Business retains its distinct material quantity and validations.
- Period IDs asap/within7/within15/custom; startDate/endDate and draft fields keep existing parsing, validation and calendar controls.
- Material hasFlyers yes/no; flyerFormat from FLYER_FORMAT_OPTIONS. updatePrinting, setPrintFormat, setArtwork and setArtworkSelected maintain printing.enabled/selected, format, paper, grammage, sides and graphic options.
- Pricing remains calculatePrintPrice, distribution estimate and existing real plan discounts 3/5/8. No engine or commercial percentage changes.
- urgency options and subscription single/monthly3/monthly6/monthly12 keep existing handlers. campaignsPerMonth stays supported.
- handleContinue performs existing validation, H2H/B2B geocoding and payload normalization, then onNext. canContinueStep1 and disabled conditions remain unchanged.
- Existing subcomponents: Step1Summary, Step1Icon, Step1Help, NavButton, BusinessStep1Config; H2H operational controls live inside Step1.
- summaryRows derive from data; add only presentation of existing period values. Final choices likewise derive from canonical values.

## Verification scope
Anonymous /configuratore, desktop 1440x900, Samsung-like 412x915 and iPhone-like 390x844. Open configurator, select service/sector/quantity/period/material/urgency/plan, inspect summary and continue using the existing CTA. Capture baseline and final browser images, check overflow and retain conditional operational forms.
Targeted contracts: configurator_step1_4, step1_print_material_format, step1_business_summary_ux, pricing_distribution_engine, pricing_live_wiring. Build, npm test and test:all are run separately.
Reference differences retained deliberately: original logo/assets, real 5% six-month discount, conditional dates, existing mandatory choices and B2B/H2H operational fields. No fabricated default selections.

Baseline screenshot note: the initial capture attempted /preventivo (service center), not Step 1. The original Step1 module was subsequently reconstructed from BASE HEAD and rendered through Vite request interception for baseline-reconstructed-desktop.png. This is reconstructed baseline evidence, not a screenshot captured before editing.
