// -----------------------------------------------------------------------------
// The "Find gauges" configuration action: lists the gauges in service around
// the house (its location in Gladys), nearest first, with their distance,
// whether the NWS forecasts them and their current category, so the user can
// copy the codes into the configuration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { KM_PER_MILE, boxAround, distanceKm } from './geo.js';
import { SEARCH, categoryName, formatNumber, render } from './messages.js';

const logger = createLogger({ name: 'nwps-search' });

export const SEARCH_RADII = ['10', '25', '50', '100'];
const DEFAULT_RADIUS_MILES = 25;
const MAX_RESULTS = 12;

/**
 * Handler of the `search_gauges` action.
 * @param {import('./monitor.js').Monitor} monitor
 * @param {{ radius?: string }} fields
 */
export async function searchGauges(monitor, fields = {}) {
  const miles = SEARCH_RADII.includes(String(fields.radius))
    ? Number(fields.radius)
    : DEFAULT_RADIUS_MILES;
  try {
    const house = await monitor.findHouse();
    if (!house) {
      return render(SEARCH, 'noHouse');
    }
    const km = miles * KM_PER_MILE;
    const gauges = await monitor.nwps.gaugesInBox(boxAround(house.latitude, house.longitude, km));
    const listed = gauges
      .filter(
        (gauge) =>
          gauge.inService &&
          gauge.observed.category !== 'out_of_service' &&
          gauge.latitude !== null &&
          gauge.longitude !== null,
      )
      .map((gauge) => ({
        gauge,
        km: distanceKm(house.latitude, house.longitude, gauge.latitude, gauge.longitude),
      }))
      .filter((entry) => entry.km <= km)
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_RESULTS);
    logger.info(`Gauge search: ${listed.length} gauge(s) found`);
    if (listed.length === 0) {
      return render(SEARCH, 'none');
    }
    return Object.fromEntries(
      Object.keys(SEARCH).map((language) => {
        const texts = SEARCH[language];
        const lines = listed.map(({ gauge, km: distance }) => {
          const parts = [
            `${gauge.code} — ${gauge.name}`,
            `${formatNumber(distance / KM_PER_MILE, language, 1)} mi`,
            categoryName(gauge.observed.category ?? 'unknown', language),
          ];
          if (gauge.hasForecast) {
            parts.push(texts.forecast);
          }
          return parts.join(', ');
        });
        return [language, `${texts.found({ count: listed.length })}\n${lines.join('\n')}`];
      }),
    );
  } catch (err) {
    logger.warn(`Gauge search failed: ${err.message}`);
    return render(SEARCH, 'unavailable');
  }
}
