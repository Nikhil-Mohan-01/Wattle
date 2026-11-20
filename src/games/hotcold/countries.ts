// Public country list for Hot & Cold: ids, display names and aliases.
// Shared by the server (to resolve guesses) and the browser (autocomplete).
// Nothing here reveals the day's answer.

import isoCountries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

isoCountries.registerLocale(en);

export type Country = {
  /** ISO 3166-1 numeric code, zero-padded ("036"), as used by world-atlas. */
  id: string;
  name: string;
};

/**
 * Every guessable country/territory with an ISO code in world-atlas 50m.
 * Antarctica (010) and features without an ISO code (Kosovo, Somaliland, …)
 * are left out. test/hotcold.test.ts checks this list against the map.
 */
const GUESSABLE_IDS = [
  "004", "008", "012", "016", "020", "024", "028", "031", "032", "036", "040", "044", "048",
  "050", "051", "052", "056", "060", "064", "068", "070", "072", "076", "084", "086", "090",
  "092", "096", "100", "104", "108", "112", "116", "120", "124", "132", "136", "140", "144",
  "148", "152", "156", "158", "170", "174", "178", "180", "184", "188", "191", "192", "196",
  "203", "204", "208", "212", "214", "218", "222", "226", "231", "232", "233", "234", "238",
  "239", "242", "246", "248", "250", "258", "260", "262", "266", "268", "270", "275", "276",
  "288", "296", "300", "304", "308", "316", "320", "324", "328", "332", "334", "336", "340", "344",
  "348", "352", "356", "360", "364", "368", "372", "376", "380", "384", "388", "392", "398",
  "400", "404", "408", "410", "414", "417", "418", "422", "426", "428", "430", "434", "438",
  "440", "442", "446", "450", "454", "458", "462", "466", "470", "478", "480", "484", "492",
  "496", "498", "499", "500", "504", "508", "512", "516", "520", "524", "528", "531", "533",
  "534", "540", "548", "554", "558", "562", "566", "570", "574", "578", "580", "583", "584",
  "585", "586", "591", "598", "600", "604", "608", "612", "616", "620", "624", "626", "630",
  "634", "642", "643", "646", "652", "654", "659", "660", "662", "663", "666", "670", "674",
  "678", "682", "686", "688", "690", "694", "702", "703", "704", "705", "706", "710", "716",
  "724", "728", "729", "732", "740", "748", "752", "756", "760", "762", "764", "768", "776",
  "780", "784", "788", "792", "795", "796", "800", "804", "807", "818", "826", "831", "832",
  "833", "834", "840", "850", "854", "858", "860", "862", "876", "882", "887", "894",
] as const;

/**
 * Can be guessed but never chosen as the answer: territories, disputed areas,
 * and states too small to find on a globe. Everything else in the list above
 * is in the answer pool.
 */
const NOT_ANSWERS = new Set([
  // Territories and dependencies.
  "016", "060", "086", "092", "136", "184", "234", "238", "239", "248", "258", "260", "304",
  "316", "334", "344", "446", "500", "531", "533", "534", "540", "570", "574", "580", "612",
  "630", "652", "654", "660", "663", "666", "732", "796", "831", "832", "833", "850", "876",
  // Disputed.
  "275",
  // Microstates and small island states.
  "020", "028", "048", "052", "132", "174", "212", "296", "308", "336", "438", "462", "470",
  "480", "492", "520", "583", "584", "585", "659", "662", "670", "674", "678", "690", "702",
  "776", "882",
]);

/** Friendlier display names where the ISO name is formal or awkward. */
const DISPLAY: Record<string, string> = {
  "086": "British Indian Ocean Territory",
  "096": "Brunei",
  "158": "Taiwan",
  "178": "Republic of the Congo",
  "180": "DR Congo",
  "238": "Falkland Islands",
  "239": "South Georgia and the South Sandwich Islands",
  "260": "French Southern Lands",
  "270": "The Gambia",
  "275": "Palestine",
  "334": "Heard Island and McDonald Islands",
  "336": "Vatican City",
  "364": "Iran",
  "384": "Côte d'Ivoire",
  "408": "North Korea",
  "410": "South Korea",
  "418": "Laos",
  "446": "Macau",
  "498": "Moldova",
  "583": "Micronesia",
  "612": "Pitcairn Islands",
  "643": "Russia",
  "663": "Saint Martin",
  "678": "São Tomé and Príncipe",
  "760": "Syria",
  "792": "Turkey",
  "807": "North Macedonia",
  "834": "Tanzania",
  "840": "United States",
  "826": "United Kingdom",
  "850": "U.S. Virgin Islands",
  "092": "British Virgin Islands",
  "203": "Czechia",
  "534": "Sint Maarten",
};

/** Extra names people type. These win over ISO names if both claim a spelling. */
const EXTRA_ALIASES: Record<string, string[]> = {
  "036": ["Oz"],
  "070": ["Bosnia", "Herzegovina"],
  "104": ["Burma"],
  "132": ["Cabo Verde"],
  "140": ["CAR"],
  "158": ["Republic of China", "ROC"],
  "156": ["PRC", "Mainland China"],
  "178": ["Congo", "Congo-Brazzaville", "Congo Republic"],
  "180": ["DRC", "DR Congo", "Congo-Kinshasa", "Zaire"],
  "203": ["Czech Republic", "Czech"],
  "214": ["Dominican Rep"],
  "226": ["Eq Guinea"],
  "234": ["Faeroe Islands", "Faroes"],
  "275": ["Palestinian Territories", "West Bank", "Gaza"],
  "336": ["Vatican", "Holy See"],
  "384": ["Ivory Coast"],
  "408": ["DPRK"],
  "410": ["Korea", "ROK"],
  "446": ["Macao"],
  "528": ["Holland", "The Netherlands"],
  "626": ["East Timor"],
  "643": ["Russian Federation"],
  "659": ["Saint Kitts", "St Kitts", "Saint Kitts and Nevis"],
  "670": ["Saint Vincent", "St Vincent"],
  "728": ["S Sudan"],
  "748": ["Swaziland"],
  "784": ["UAE", "Emirates"],
  "792": ["Turkiye"],
  "807": ["Macedonia", "FYROM"],
  "826": ["UK", "Britain", "Great Britain", "England", "Scotland", "Wales", "Northern Ireland"],
  "840": ["USA", "US", "America", "United States of America"],
};

/** Lowercase, strip accents and punctuation, "St" → "saint", drop a leading "the". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bst\b/g, "saint")
    .replace(/^the /, "");
}

function isoNames(id: string): string[] {
  const alpha2 = isoCountries.numericToAlpha2(id);
  if (!alpha2) return [];
  const names = isoCountries.getName(alpha2, "en", { select: "all" });
  return Array.isArray(names) ? names : names ? [names] : [];
}

function displayName(id: string): string {
  if (DISPLAY[id]) return DISPLAY[id];
  const alpha2 = isoCountries.numericToAlpha2(id);
  const alias = alpha2 ? isoCountries.getName(alpha2, "en", { select: "alias" }) : undefined;
  return (typeof alias === "string" && alias) || isoNames(id)[0] || id;
}

export const COUNTRIES: readonly Country[] = GUESSABLE_IDS.map((id) => ({ id, name: displayName(id) })).sort(
  (a, b) => a.name.localeCompare(b.name),
);

export const COUNTRY_BY_ID: ReadonlyMap<string, Country> = new Map(COUNTRIES.map((c) => [c.id, c]));

/** Ids that can be the day's answer (recognisable sovereign states). */
export const ANSWER_IDS: readonly string[] = GUESSABLE_IDS.filter((id) => !NOT_ANSWERS.has(id));

/** Every accepted spelling → id. Display names and extra aliases claim first. */
const LOOKUP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  const claim = (name: string, id: string) => {
    const key = normalizeName(name);
    if (key && !map.has(key)) map.set(key, id);
  };
  for (const c of COUNTRIES) claim(c.name, c.id);
  for (const [id, names] of Object.entries(EXTRA_ALIASES)) for (const n of names) claim(n, id);
  for (const c of COUNTRIES) for (const n of isoNames(c.id)) claim(n, c.id);
  return map;
})();

/** Resolves a typed name or alias to a country id, or null if unknown. */
export function resolveCountry(input: string): string | null {
  return LOOKUP.get(normalizeName(input)) ?? null;
}
