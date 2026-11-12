// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action
// messages, scene variables), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted".
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';

// Names of the flood categories of the NWPS (see src/nwps.js).
export const CATEGORY_NAMES = {
  en: {
    no_flooding: 'No flooding',
    action: 'Action stage',
    minor: 'Minor flooding',
    moderate: 'Moderate flooding',
    major: 'Major flooding',
    low_threshold: 'Low water',
    not_defined: 'No flood stages',
    obs_not_current: 'No recent reading',
    fcst_not_current: 'No current forecast',
    out_of_service: 'Out of service',
    unknown: 'Unknown',
  },
  fr: {
    no_flooding: 'Pas de crue',
    action: "Seuil d'action",
    minor: 'Crue mineure',
    moderate: 'Crue modérée',
    major: 'Crue majeure',
    low_threshold: 'Basses eaux',
    not_defined: 'Pas de seuils de crue',
    obs_not_current: 'Pas de mesure récente',
    fcst_not_current: 'Aucune prévision en cours',
    out_of_service: 'Hors service',
    unknown: 'Inconnue',
  },
  de: {
    no_flooding: 'Kein Hochwasser',
    action: 'Aktionspegel',
    minor: 'Leichtes Hochwasser',
    moderate: 'Mittleres Hochwasser',
    major: 'Großes Hochwasser',
    low_threshold: 'Niedrigwasser',
    not_defined: 'Keine Hochwasserstufen',
    obs_not_current: 'Keine aktuelle Messung',
    fcst_not_current: 'Keine aktuelle Prognose',
    out_of_service: 'Außer Betrieb',
    unknown: 'Unbekannt',
  },
  es: {
    no_flooding: 'Sin inundación',
    action: 'Nivel de acción',
    minor: 'Inundación menor',
    moderate: 'Inundación moderada',
    major: 'Inundación mayor',
    low_threshold: 'Aguas bajas',
    not_defined: 'Sin umbrales de inundación',
    obs_not_current: 'Sin medición reciente',
    fcst_not_current: 'Sin previsión vigente',
    out_of_service: 'Fuera de servicio',
    unknown: 'Desconocida',
  },
};

/** The name of a category in a language, "Unknown" for a value the NWPS added since. */
export const categoryName = (category, language) => {
  const names = CATEGORY_NAMES[language] ?? CATEGORY_NAMES.en;
  return names[category] ?? names.unknown;
};

/** Widget colour of a category (closed palette: no orange, the text tells them apart). */
export function categoryColor(category) {
  switch (category) {
    case 'no_flooding':
    case 'low_threshold':
      return WIDGET_COLORS.SUCCESS;
    case 'action':
    case 'minor':
      return WIDGET_COLORS.WARNING;
    case 'moderate':
    case 'major':
      return WIDGET_COLORS.DANGER;
    default:
      return WIDGET_COLORS.NEUTRAL;
  }
}

// Connection status of the integration (Integrations → NWPS).
export const STATUS = {
  en: {
    initFailed: 'Initialization failed, check the integration logs.',
    unavailable: 'The NWPS API does not answer, retrying at the next refresh.',
    unknownCodes: ({ codes }) => `Unknown gauge codes, check the configuration: ${codes}`,
    noHouse: 'No house of Gladys has a location: "Around my house" is off.',
  },
  fr: {
    initFailed: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    unavailable: "L'API NWPS ne répond pas, nouvel essai à la prochaine mise à jour.",
    unknownCodes: ({ codes }) => `Codes de station inconnus, vérifiez la configuration : ${codes}`,
    noHouse: "Aucune maison de Gladys n'a de position : « Autour de ma maison » est inactif.",
  },
  de: {
    initFailed: 'Die Initialisierung ist fehlgeschlagen, prüfe die Protokolle der Integration.',
    unavailable: 'Die NWPS-API antwortet nicht, neuer Versuch bei der nächsten Aktualisierung.',
    unknownCodes: ({ codes }) => `Unbekannte Pegelcodes, prüfe die Konfiguration: ${codes}`,
    noHouse: 'Kein Haus in Gladys hat einen Standort: „Rund um mein Haus“ ist aus.',
  },
  es: {
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    unavailable: 'La API del NWPS no responde, nuevo intento en la próxima actualización.',
    unknownCodes: ({ codes }) =>
      `Códigos de estación desconocidos, revise la configuración: ${codes}`,
    noHouse: 'Ninguna casa de Gladys tiene ubicación: «Alrededor de mi casa» está desactivado.',
  },
};

// Messages of the "Find gauges" action.
export const SEARCH = {
  en: {
    found: ({ count }) => `${count} gauge(s), nearest first:`,
    none: 'No gauge found within this distance.',
    noHouse: 'No house of Gladys has a location: set it in Settings → Houses.',
    unavailable: 'The NWPS API does not answer, try again in a few minutes.',
    forecast: 'forecast',
    noStages: 'no flood stages',
  },
  fr: {
    found: ({ count }) => `${count} station(s), la plus proche en premier :`,
    none: 'Aucune station à cette distance.',
    noHouse: "Aucune maison de Gladys n'a de position : réglez-la dans Paramètres → Maisons.",
    unavailable: "L'API NWPS ne répond pas, réessayez dans quelques minutes.",
    forecast: 'prévision',
    noStages: 'sans seuils de crue',
  },
  de: {
    found: ({ count }) => `${count} Pegel, der nächste zuerst:`,
    none: 'Kein Pegel in dieser Entfernung gefunden.',
    noHouse: 'Kein Haus in Gladys hat einen Standort: Lege ihn unter Einstellungen → Häuser fest.',
    unavailable: 'Die NWPS-API antwortet nicht, versuche es in ein paar Minuten erneut.',
    forecast: 'Prognose',
    noStages: 'keine Hochwasserstufen',
  },
  es: {
    found: ({ count }) => `${count} estación(es), la más cercana primero:`,
    none: 'Ninguna estación a esta distancia.',
    noHouse: 'Ninguna casa de Gladys tiene ubicación: configúrela en Ajustes → Casas.',
    unavailable: 'La API del NWPS no responde, inténtelo de nuevo en unos minutos.',
    forecast: 'previsión',
    noStages: 'sin umbrales de inundación',
  },
};

// Sources of the scene trigger variable `source`.
export const SOURCE_NAMES = {
  en: { observed: 'observed', forecast: 'forecast' },
  fr: { observed: 'observée', forecast: 'prévue' },
  de: { observed: 'gemessen', forecast: 'vorhergesagt' },
  es: { observed: 'observada', forecast: 'prevista' },
};

/** A message table entry rendered in the four languages: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

const locale = (language) => (language === 'en' ? 'en-US' : language);

/** A date in the user's language and the time zone of Gladys, e.g. "12/11 13:45". */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A number in the user's language, e.g. "2,78" in French. */
export function formatNumber(value, language, digits = 2) {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(value);
}
