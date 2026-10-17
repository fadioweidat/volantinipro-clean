// Homepage price figures, derived ONLY from the live pricing engine
// (distributionPricing.js + quotePricing.js + QUOTE_PRICES): no number is
// written here, so the homepage can never drift from what the configurator
// actually charges. All amounts are distribution only, IVA esclusa, print
// excluded (print is a separate extra in the configurator).
import { QUOTE_PRICES } from '../appConstants.js';
import { calculateQuotePricing } from '../quotePricing.js';
import { GRID_QUANTITIES, TERRITORY_MINIMUMS, TERRITORY_TIERS, calculateDistributionZonePrice, roundMoney } from './distributionPricing.js';
import { resolveConfiguratorDistributionZones } from './resolveConfiguratorDistributionZones.js';

const REFERENCE_QUANTITY = 1000;

/**
 * Lowest real price per 1.000 flyers for a service.
 * D2D: lowest per-1.000 rate reached on the territorial grid (high volumes;
 * grid quantities only, never the extrapolation beyond the last tier).
 * H2H: flat configurator rate for 1.000 pz. Business: null — "su progetto".
 * @returns {number|null}
 */
export function getStartingPricePerThousand(service) {
  if (service === 'd2d') {
    const rates = Object.values(TERRITORY_TIERS).flatMap((tier) =>
      GRID_QUANTITIES.map((qty) => {
        const price = calculateDistributionZonePrice(tier, qty);
        return Number.isFinite(price) ? (price / qty) * REFERENCE_QUANTITY : null;
      })
    ).filter((rate) => rate !== null);
    return rates.length ? roundMoney(Math.min(...rates)) : null;
  }
  if (service === 'h2h') {
    return calculateQuotePricing({ quantity: REFERENCE_QUANTITY, pricePerThousand: QUOTE_PRICES.h2h }).baseCost;
  }
  return null;
}

/**
 * Lowest D2D campaign minimum across territories (the engine applies
 * max(price, minimum) per zone).
 * @returns {number|null}
 */
export function getDoorToDoorCampaignMinimum() {
  const minimums = Object.values(TERRITORY_MINIMUMS).filter((value) => Number.isFinite(value));
  return minimums.length ? Math.min(...minimums) : null;
}

/**
 * Same path QuickQuotePage uses for a single real comune (D2D, standard
 * urgency, no extras, no Smart Pairing): resolveConfiguratorDistributionZones
 * -> calculateQuotePricing.
 * @returns {{service:string, comune:string, provincia:string, quantity:number, total:number|null}}
 */
export function calculateHomepagePriceExample({ comune = 'Cormano', provincia = 'MI', quantity = 5000 } = {}) {
  const zones = resolveConfiguratorDistributionZones({ selectedComuni: [{ name: comune }] }, quantity).zones;
  const pricing = calculateQuotePricing({ quantity, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: zones });
  return { service: 'd2d', comune, provincia, quantity, total: pricing.total };
}
