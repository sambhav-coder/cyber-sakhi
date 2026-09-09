/* ------------------------------------------------------------------ *
 * Global threat landscape — data layer
 *
 * READ THIS BEFORE PRESENTING THE MAP.
 *
 * There is no free public API that publishes live online-harassment or
 * cyber-extortion counts per country, so this module does NOT claim to
 * serve measured field data. It ships a transparent MODEL:
 *
 *   inputs   real, approximate population and internet-penetration
 *            figures per country (the COUNTRY_INPUTS table below)
 *   model    reports = online users x a documented regional base rate,
 *            modulated by a deterministic per-country seed
 *   output   a country-level snapshot with the same shape a real
 *            backend would return
 *
 * The seed is derived from the ISO code, so the numbers are STABLE:
 * they do not re-randomise on refresh, and two people looking at the
 * same country see the same figure.
 *
 * To go live, replace buildSnapshot() in app/api/global-threats/route.ts
 * with a real query. Nothing in the UI changes.
 * ------------------------------------------------------------------ */

export type Region =
  | "South Asia"
  | "Asia-Pacific"
  | "Europe"
  | "North America"
  | "Latin America"
  | "Africa"
  | "Middle East";

export type ThreatCategoryKey =
  | "blackmail"
  | "stalking"
  | "financialScam"
  | "sexualHarassment"
  | "intimidation"
  | "hateSpeech";

export const ALL_CATEGORIES: ThreatCategoryKey[] = [
  "blackmail",
  "stalking",
  "financialScam",
  "sexualHarassment",
  "intimidation",
  "hateSpeech",
];

export const CATEGORY_LABELS: Record<ThreatCategoryKey, string> = {
  blackmail: "Blackmail & extortion",
  stalking: "Cyberstalking",
  financialScam: "Financial / OTP fraud",
  sexualHarassment: "Sexual harassment",
  intimidation: "Intimidation & threats",
  hateSpeech: "Doxxing & hate speech",
};

export interface CountryThreatRecord {
  /** ISO 3166-1 numeric, matching the ids in world-atlas countries-110m. */
  iso: string;
  name: string;
  region: Region;
  /** Modelled anonymised reports in the reporting window. */
  reports: number;
  /** Reports per million online users — the choropleth measure. */
  perMillionOnline: number;
  onlineUsersMillions: number;
  /** Percentage split across all six categories, summing to 100. */
  categoryShares: Record<ThreatCategoryKey, number>;
  /** The largest entry in categoryShares. */
  topCategory: ThreatCategoryKey;
  /** Share of reports rated HIGH or CRITICAL, 0-100. */
  criticalShare: number;
}

export interface RegionRollup {
  region: Region;
  reports: number;
  countries: number;
  avgPerMillion: number;
}

export interface GlobalSnapshot {
  generatedAt: string;
  windowDays: number;
  provenance: {
    mode: "MODELLED" | "LIVE";
    headline: string;
    detail: string;
  };
  totals: {
    reports: number;
    countries: number;
    onlineUsersMillions: number;
    criticalShare: number;
  };
  countries: CountryThreatRecord[];
  regions: RegionRollup[];
  categoryMix: { key: ThreatCategoryKey; label: string; reports: number; pct: number }[];
}

/* ----------------------------- inputs -------------------------------- */

/**
 * [ISO numeric, name, region, population (millions), internet penetration %]
 *
 * Population and penetration are real-world approximations used as model
 * inputs. Countries absent from this table render as "no data" on the map
 * rather than being filled with a guess.
 */
type CountryInput = [string, string, Region, number, number];

const COUNTRY_INPUTS: CountryInput[] = [
  // South Asia
  ["356", "India", "South Asia", 1430, 52],
  ["586", "Pakistan", "South Asia", 240, 37],
  ["050", "Bangladesh", "South Asia", 173, 39],
  ["144", "Sri Lanka", "South Asia", 22, 57],
  ["524", "Nepal", "South Asia", 31, 52],
  ["004", "Afghanistan", "South Asia", 42, 18],

  // Asia-Pacific
  ["156", "China", "Asia-Pacific", 1420, 77],
  ["360", "Indonesia", "Asia-Pacific", 278, 69],
  ["608", "Philippines", "Asia-Pacific", 117, 73],
  ["704", "Vietnam", "Asia-Pacific", 99, 79],
  ["764", "Thailand", "Asia-Pacific", 72, 88],
  ["458", "Malaysia", "Asia-Pacific", 34, 97],
  ["392", "Japan", "Asia-Pacific", 124, 83],
  ["410", "South Korea", "Asia-Pacific", 52, 97],
  ["036", "Australia", "Asia-Pacific", 27, 96],
  ["554", "New Zealand", "Asia-Pacific", 5, 95],
  ["104", "Myanmar", "Asia-Pacific", 54, 44],
  ["116", "Cambodia", "Asia-Pacific", 17, 60],
  ["398", "Kazakhstan", "Asia-Pacific", 20, 91],
  ["158", "Taiwan", "Asia-Pacific", 23, 92],

  // Europe
  ["826", "United Kingdom", "Europe", 68, 97],
  ["276", "Germany", "Europe", 84, 93],
  ["250", "France", "Europe", 68, 93],
  ["380", "Italy", "Europe", 59, 87],
  ["724", "Spain", "Europe", 48, 95],
  ["616", "Poland", "Europe", 37, 88],
  ["528", "Netherlands", "Europe", 18, 97],
  ["752", "Sweden", "Europe", 11, 96],
  ["578", "Norway", "Europe", 6, 99],
  ["246", "Finland", "Europe", 6, 94],
  ["208", "Denmark", "Europe", 6, 99],
  ["372", "Ireland", "Europe", 5, 95],
  ["620", "Portugal", "Europe", 10, 85],
  ["300", "Greece", "Europe", 10, 84],
  ["203", "Czechia", "Europe", 11, 92],
  ["642", "Romania", "Europe", 19, 89],
  ["348", "Hungary", "Europe", 10, 91],
  ["040", "Austria", "Europe", 9, 94],
  ["056", "Belgium", "Europe", 12, 94],
  ["756", "Switzerland", "Europe", 9, 96],
  ["804", "Ukraine", "Europe", 38, 79],
  ["643", "Russia", "Europe", 144, 90],
  ["792", "Turkey", "Europe", 85, 86],

  // North America
  ["840", "United States of America", "North America", 335, 92],
  ["124", "Canada", "North America", 40, 94],
  ["484", "Mexico", "North America", 129, 78],

  // Latin America
  ["076", "Brazil", "Latin America", 216, 84],
  ["032", "Argentina", "Latin America", 46, 88],
  ["170", "Colombia", "Latin America", 52, 73],
  ["604", "Peru", "Latin America", 34, 74],
  ["152", "Chile", "Latin America", 20, 91],
  ["862", "Venezuela", "Latin America", 28, 62],
  ["218", "Ecuador", "Latin America", 18, 76],
  ["320", "Guatemala", "Latin America", 18, 51],
  ["192", "Cuba", "Latin America", 11, 71],
  ["600", "Paraguay", "Latin America", 7, 79],
  ["858", "Uruguay", "Latin America", 3, 91],
  ["068", "Bolivia", "Latin America", 12, 66],

  // Africa
  ["566", "Nigeria", "Africa", 224, 55],
  ["818", "Egypt", "Africa", 113, 72],
  ["710", "South Africa", "Africa", 60, 72],
  ["404", "Kenya", "Africa", 55, 40],
  ["231", "Ethiopia", "Africa", 126, 25],
  ["288", "Ghana", "Africa", 34, 68],
  ["834", "Tanzania", "Africa", 67, 32],
  ["800", "Uganda", "Africa", 48, 27],
  ["504", "Morocco", "Africa", 38, 88],
  ["012", "Algeria", "Africa", 46, 71],
  ["788", "Tunisia", "Africa", 12, 79],
  ["894", "Zambia", "Africa", 20, 31],
  ["716", "Zimbabwe", "Africa", 16, 35],
  ["686", "Senegal", "Africa", 18, 58],

  // Middle East
  ["682", "Saudi Arabia", "Middle East", 37, 99],
  ["784", "United Arab Emirates", "Middle East", 10, 99],
  ["364", "Iran", "Middle East", 89, 79],
  ["368", "Iraq", "Middle East", 45, 79],
  ["376", "Israel", "Middle East", 10, 90],
  ["400", "Jordan", "Middle East", 11, 89],
  ["422", "Lebanon", "Middle East", 5, 88],
  ["512", "Oman", "Middle East", 5, 96],
  ["634", "Qatar", "Middle East", 3, 99],
  ["414", "Kuwait", "Middle East", 4, 99],
  ["887", "Yemen", "Middle East", 34, 27],
];

/* ------------------------------ model -------------------------------- */

/**
 * Reports per million online users, before the per-country seed. These are
 * model constants chosen to reflect published differences in reporting
 * culture and helpline maturity — they are assumptions, not measurements.
 */
const REGION_BASE_RATE: Record<Region, number> = {
  "South Asia": 41,
  "Asia-Pacific": 28,
  Europe: 22,
  "North America": 26,
  "Latin America": 34,
  Africa: 30,
  "Middle East": 24,
};

/** Category weighting per region, used to pick the dominant category. */
const REGION_CATEGORY_WEIGHTS: Record<Region, ThreatCategoryKey[]> = {
  "South Asia": ["blackmail", "financialScam", "stalking", "sexualHarassment"],
  "Asia-Pacific": ["financialScam", "blackmail", "stalking", "hateSpeech"],
  Europe: ["stalking", "hateSpeech", "intimidation", "sexualHarassment"],
  "North America": ["stalking", "hateSpeech", "blackmail", "intimidation"],
  "Latin America": ["blackmail", "intimidation", "sexualHarassment", "financialScam"],
  Africa: ["financialScam", "blackmail", "sexualHarassment", "intimidation"],
  "Middle East": ["blackmail", "sexualHarassment", "stalking", "hateSpeech"],
};

/** Deterministic 0-1 value from a string. Same input, same output, always. */
function seededUnit(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // mulberry32 step
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function buildCountry(input: CountryInput): CountryThreatRecord {
  const [iso, name, region, populationM, penetration] = input;

  const onlineUsersMillions = Number(((populationM * penetration) / 100).toFixed(1));

  // +/-35% deterministic spread around the regional base rate.
  const spread = 0.65 + seededUnit(iso, 1) * 0.7;
  const perMillionOnline = Number((REGION_BASE_RATE[region] * spread).toFixed(1));
  const reports = Math.round(onlineUsersMillions * perMillionOnline);

  // Every country gets a full six-category split, not a single winner. The
  // regional pool boosts its members; a seeded jitter keeps countries
  // distinct without letting any category fall to zero.
  const pool = REGION_CATEGORY_WEIGHTS[region];
  const POOL_BOOST = [4, 3, 2.2, 1.6];
  const rawWeights = ALL_CATEGORIES.map((key, i) => {
    const poolIndex = pool.indexOf(key);
    const boost = poolIndex === -1 ? 1 : POOL_BOOST[poolIndex] ?? 1;
    return boost * (0.7 + seededUnit(iso, 10 + i) * 0.6);
  });
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);

  const categoryShares = {} as Record<ThreatCategoryKey, number>;
  let allocated = 0;
  ALL_CATEGORIES.forEach((key, i) => {
    // Largest-remainder style: last category absorbs the rounding drift so
    // the six shares always total exactly 100.
    if (i === ALL_CATEGORIES.length - 1) {
      categoryShares[key] = 100 - allocated;
    } else {
      const pct = Math.round((rawWeights[i] / weightSum) * 100);
      categoryShares[key] = pct;
      allocated += pct;
    }
  });

  const topCategory = ALL_CATEGORIES.reduce((best, key) =>
    categoryShares[key] > categoryShares[best] ? key : best
  );

  // 18-46% of reports land in the two severe bands.
  const criticalShare = Math.round(18 + seededUnit(iso, 3) * 28);

  return {
    iso,
    name,
    region,
    reports,
    perMillionOnline,
    onlineUsersMillions,
    categoryShares,
    topCategory,
    criticalShare,
  };
}

/* --------------------------- the snapshot ---------------------------- */

const WINDOW_DAYS = 30;

export function buildSnapshot(): GlobalSnapshot {
  const countries = COUNTRY_INPUTS.map(buildCountry).sort(
    (a, b) => b.reports - a.reports
  );

  const totalReports = countries.reduce((sum, c) => sum + c.reports, 0);
  const totalOnline = countries.reduce((sum, c) => sum + c.onlineUsersMillions, 0);
  const weightedCritical = countries.reduce(
    (sum, c) => sum + c.criticalShare * c.reports,
    0
  );

  const regionMap = new Map<Region, RegionRollup>();
  for (const c of countries) {
    const existing = regionMap.get(c.region) ?? {
      region: c.region,
      reports: 0,
      countries: 0,
      avgPerMillion: 0,
    };
    existing.reports += c.reports;
    existing.countries += 1;
    regionMap.set(c.region, existing);
  }
  const regions = Array.from(regionMap.values())
    .map((r) => {
      const members = countries.filter((c) => c.region === r.region);
      const online = members.reduce((s, c) => s + c.onlineUsersMillions, 0);
      return {
        ...r,
        avgPerMillion: online === 0 ? 0 : Number((r.reports / online).toFixed(1)),
      };
    })
    .sort((a, b) => b.reports - a.reports);

  // Sum each country's full category split, weighted by its volume, so the
  // global mix is not decided by whichever category a large country topped.
  const catTotals = new Map<ThreatCategoryKey, number>();
  for (const c of countries) {
    for (const key of ALL_CATEGORIES) {
      const share = (c.categoryShares[key] / 100) * c.reports;
      catTotals.set(key, (catTotals.get(key) ?? 0) + share);
    }
  }
  const categoryMix = Array.from(catTotals.entries())
    .map(([key, reports]) => ({
      key,
      label: CATEGORY_LABELS[key],
      reports: Math.round(reports),
      pct: Math.round((reports / totalReports) * 100),
    }))
    .sort((a, b) => b.reports - a.reports);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    provenance: {
      mode: "MODELLED",
      headline: "Modelled dataset",
      detail:
        "Volumes are derived from real population and internet-penetration figures using a documented regional rate model. They are not measured incident counts, and no live per-country feed exists for this domain.",
    },
    totals: {
      reports: totalReports,
      countries: countries.length,
      onlineUsersMillions: Math.round(totalOnline),
      criticalShare:
        totalReports === 0 ? 0 : Math.round(weightedCritical / totalReports),
    },
    countries,
    regions,
    categoryMix,
  };
}

/* --------------------------- choropleth scale ------------------------ */

/**
 * Sequential single-hue ramp, low -> high. Purple 950 -> 400, so lightness
 * increases monotonically against the dark chart surface. Never a rainbow.
 */
export const CHOROPLETH_STEPS = [
  "#7f1d1d",
  "#b91c1c",
  "#ef4444",
  "#f87171",
  "#fecaca",
];

export const NO_DATA_FILL = "#141420";

/** Quintile-ish thresholds on reports per million online users. */
export function choroplethBins(countries: CountryThreatRecord[]): number[] {
  const values = countries.map((c) => c.perMillionOnline).sort((a, b) => a - b);
  if (values.length === 0) return [0, 0, 0, 0];
  const at = (q: number) => values[Math.floor((values.length - 1) * q)];
  return [at(0.2), at(0.4), at(0.6), at(0.8)];
}

export function fillForValue(value: number, bins: number[]): string {
  for (let i = 0; i < bins.length; i++) {
    if (value <= bins[i]) return CHOROPLETH_STEPS[i];
  }
  return CHOROPLETH_STEPS[CHOROPLETH_STEPS.length - 1];
}
