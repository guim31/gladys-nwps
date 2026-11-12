// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `gauges`.
//
// Without a gauge chosen: one status line per created gauge (10 at most), its
// level and category, coloured by the category (closed palette of the
// widgets: green no flooding, yellow action or minor, red moderate or major,
// neutral without a recent reading). A heading appears when a gauge is in
// flood or forecast in flood.
//
// With a gauge chosen in the settings: its live level and flow tiles (bound to
// the device features), then its category, the forecast crest with its time
// and category, the flood stage and the last reading.
//
// Both end with the source and the time of the last read, and a button to the
// page of the gauge (or of the NWPS) that a setting hides. Levels in the
// status lines follow the unit preference of the user (`units` of the
// request); the tiles show the unit of the features. Budget: 2 texts, 2
// tiles, 1 status, 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { gaugeCodeOfId, gaugeIds, hasFlow, hasStage } from './devices.js';
import { categoryColor, categoryName, formatDate } from './messages.js';
import { WIDGET_KEY, forecastIsCurrent, formatValue } from './monitor.js';
import { GAUGE_PAGE, NWPS_SITE, categoryRank } from './nwps.js';

export const MAX_STATUS_ITEMS = 10;
export const TTL_SECONDS = 300;
const MAX_STATUS_TEXT = 40;

export const TEXT = {
  empty: {
    en: 'No gauge yet: fill in the configuration of the NWPS integration, then create the devices in the Discover tab.',
    fr: "Aucune station pour l'instant : remplissez la configuration de l'intégration NWPS, puis créez les appareils dans l'onglet Découverte.",
    de: 'Noch kein Pegel: Fülle die Konfiguration der Integration NWPS aus und lege dann die Geräte im Tab „Entdecken“ an.',
    es: 'Aún no hay estaciones: rellene la configuración de la integración NWPS y, después, cree los dispositivos en la pestaña Descubrir.',
  },
  gone: {
    en: 'This gauge is no longer followed.',
    fr: "Cette station n'est plus suivie.",
    de: 'Dieser Pegel wird nicht mehr verfolgt.',
    es: 'Esta estación ya no se sigue.',
  },
  alert: {
    en: 'Flooding: ',
    fr: 'Crue : ',
    de: 'Hochwasser: ',
    es: 'Inundación: ',
  },
  forecastAlert: {
    en: 'Forecast: ',
    fr: 'Prévision : ',
    de: 'Prognose: ',
    es: 'Previsión: ',
  },
  stage: { en: 'Water level', fr: 'Hauteur', de: 'Wasserstand', es: 'Nivel' },
  flow: { en: 'Flow', fr: 'Débit', de: 'Abfluss', es: 'Caudal' },
  category: { en: 'Category', fr: 'Catégorie', de: 'Kategorie', es: 'Categoría' },
  crest: { en: 'Forecast crest', fr: 'Pic prévu', de: 'Scheitelprognose', es: 'Cresta prevista' },
  forecastCategory: {
    en: 'Forecast category',
    fr: 'Catégorie prévue',
    de: 'Prognosekategorie',
    es: 'Categoría prevista',
  },
  floodStage: {
    en: 'Flood stage',
    fr: 'Seuil de crue',
    de: 'Hochwassermarke',
    es: 'Umbral de inundación',
  },
  lastReading: {
    en: 'Last reading',
    fr: 'Dernière mesure',
    de: 'Letzte Messung',
    es: 'Última medición',
  },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  source: {
    en: 'Source: NOAA NWS, NWPS',
    fr: 'Source : NOAA NWS, NWPS',
    de: 'Quelle: NOAA NWS, NWPS',
    es: 'Fuente: NOAA NWS, NWPS',
  },
  site: { en: 'water.noaa.gov', fr: 'water.noaa.gov', de: 'water.noaa.gov', es: 'water.noaa.gov' },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max = MAX_STATUS_TEXT) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;
const systemOf = (units) => (units === 'metric' ? 'metric' : 'us');

/** The value of a gauge line: "2.78 ft · No flooding" (40 characters at most). */
export function gaugeValue(gauge, system, language) {
  if (!gauge) {
    return t(TEXT.waiting, language);
  }
  const value = gauge.observed[gauge.kind];
  const category = categoryName(gauge.observed.category, language);
  return clip(
    value === null ? category : `${formatValue(value, gauge.kind, system, language)} · ${category}`,
  );
}

/** The forecast crest: "3.1 ft · 13/11 18:00". */
export function crestValue(gauge, system, language) {
  return clip(
    `${formatValue(gauge.forecast[gauge.kind], gauge.kind, system, language)} · ${formatDate(
      gauge.forecast.time,
      language,
    )}`,
  );
}

function footer(monitor, codes, language, link, showLink) {
  const updated = monitor.updatedAt(codes);
  const source = t(TEXT.source, language);
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: updated === null ? source : `${source} · ${formatDate(updated, language)}`,
    },
  ];
  if (showLink) {
    components.push({
      type: 'button',
      label: t(TEXT.site, language),
      icon: 'external-link',
      link: { url: link },
    });
  }
  return components;
}

/** Name of a gauge in Gladys (the user may have renamed it), else the NWS name. */
function nameOf(monitor, code) {
  const id = gaugeIds(monitor.gladys, code).device;
  const device = (monitor.gladys.devices ?? []).find((d) => d.external_id === id);
  return device?.name || monitor.gauges.get(code)?.name || code;
}

function overview(monitor, codes, system, language, showLink) {
  const shown = codes.slice(0, MAX_STATUS_ITEMS);
  const components = [];
  const worst = (source) =>
    shown
      .map((code) => monitor.gauges.get(code))
      .filter((gauge) => gauge && (source === 'observed' || forecastIsCurrent(gauge)))
      .map((gauge) => gauge[source].category)
      .sort((a, b) => (categoryRank(b) ?? -1) - (categoryRank(a) ?? -1))[0];
  const observed = worst('observed');
  const forecast = worst('forecast');
  if ((categoryRank(observed) ?? 0) >= 2) {
    components.push({
      type: 'text',
      variant: 'heading',
      text: clip(`${t(TEXT.alert, language)}${categoryName(observed, language)}`),
    });
  } else if ((categoryRank(forecast) ?? 0) >= 2) {
    components.push({
      type: 'text',
      variant: 'heading',
      text: clip(`${t(TEXT.forecastAlert, language)}${categoryName(forecast, language)}`),
    });
  }
  components.push({
    type: 'status',
    items: shown.map((code) => {
      const gauge = monitor.gauges.get(code);
      return {
        label: clip(nameOf(monitor, code)),
        value: gaugeValue(gauge, system, language),
        color: gauge ? categoryColor(gauge.observed.category) : WIDGET_COLORS.NEUTRAL,
        icon: gauge ? 'droplet' : 'clock',
      };
    }),
  });
  return [...components, ...footer(monitor, shown, language, NWPS_SITE, showLink)];
}

function detail(monitor, code, system, language, showLink) {
  const gauge = monitor.gauges.get(code);
  const ids = gaugeIds(monitor.gladys, code);
  const components = [];
  if (!gauge || hasStage(gauge)) {
    components.push({ type: 'value', label: t(TEXT.stage, language), device_feature: ids.stage });
  }
  if (gauge && hasFlow(gauge)) {
    components.push({ type: 'value', label: t(TEXT.flow, language), device_feature: ids.flow });
  }
  const items = [];
  if (!gauge) {
    items.push({
      label: t(TEXT.category, language),
      value: t(TEXT.waiting, language),
      color: WIDGET_COLORS.NEUTRAL,
      icon: 'clock',
    });
  } else {
    items.push({
      label: t(TEXT.category, language),
      value: categoryName(gauge.observed.category, language),
      color: categoryColor(gauge.observed.category),
      icon: 'droplet',
    });
    if (gauge.hasForecast) {
      const current = forecastIsCurrent(gauge);
      if (current) {
        items.push({
          label: t(TEXT.crest, language),
          value: crestValue(gauge, system, language),
          color: WIDGET_COLORS.NEUTRAL,
          icon: 'trending-up',
        });
      }
      const category = current ? gauge.forecast.category : 'fcst_not_current';
      items.push({
        label: t(TEXT.forecastCategory, language),
        value: categoryName(category, language),
        color: current ? categoryColor(category) : WIDGET_COLORS.NEUTRAL,
        icon: 'activity',
      });
    }
    const minor = gauge.thresholds?.minor ?? null;
    if (minor !== null) {
      items.push({
        label: t(TEXT.floodStage, language),
        value: formatValue(minor, gauge.kind, system, language),
        color: WIDGET_COLORS.NEUTRAL,
        icon: 'alert-triangle',
      });
    }
    items.push({
      label: t(TEXT.lastReading, language),
      value:
        gauge.observed.time === null
          ? categoryName('obs_not_current', language)
          : formatDate(gauge.observed.time, language),
      color: WIDGET_COLORS.NEUTRAL,
      icon: 'clock',
    });
  }
  components.push({ type: 'status', items });
  return [...components, ...footer(monitor, [code], language, GAUGE_PAGE(code), showLink)];
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings, language = 'en', units }) {
      const lang = TEXT.empty[language] ? language : 'en';
      const system = systemOf(units);
      const showLink = settings?.show_link !== false;
      const created = monitor.created();
      const chosen = typeof settings?.gauge === 'string' ? settings.gauge : null;
      if (chosen) {
        const code = gaugeCodeOfId(monitor.gladys, chosen);
        const components =
          code && created.includes(code)
            ? detail(monitor, code, system, lang, showLink)
            : [{ type: 'text', variant: 'body', text: t(TEXT.gone, lang) }];
        return { ttl_seconds: TTL_SECONDS, components };
      }
      if (created.length === 0) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: [{ type: 'text', variant: 'body', text: t(TEXT.empty, lang) }],
        };
      }
      return {
        ttl_seconds: TTL_SECONDS,
        components: overview(monitor, created, system, lang, showLink),
      };
    },
  },
};
