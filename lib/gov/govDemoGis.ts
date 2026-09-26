/**
 * Deterministic, local-only SIH GIS demonstration data.
 *
 * It is intentionally not stored in `cases`, never mixed with production
 * aggregates, and is served only to the DEMO government jurisdiction. City
 * coordinates are fixed capital/major-city coordinates from GeoNames city
 * records (retrieved 2026-09-27), retained locally so the demo never relies
 * on a geolocation service or a runtime download.
 */

export type DemoMetric = { cases: number; new7d: number; highRisk: number; open: number };
export type DemoBreakdown = Array<{ label: string; count: number }>;
export type DemoCity = { code: string; label: string; latitude: number; longitude: number; cases: number };
export type DemoDistrict = { code: string; label: string; cities: DemoCity[] };
export type DemoState = { code: string; geoName: string; label: string; districts: DemoDistrict[] };

/** Census-2011 boundary name → stable demo district code. This is the one
 * explicit adapter between the pinned boundary asset and the GIS seed; UI
 * code joins only by the stable code, never by city/display-name equality. */
export const DEMO_BOUNDARY_DISTRICTS: Readonly<Record<string, readonly [string, string?]>> = Object.freeze({
  AP: ["Adilabad", "Anantapur"], AR: ["Anjaw", "Changlang"], AS: ["Baksa", "Barpeta"], BR: ["Araria", "Aurangabad"],
  CG: ["Bastar", "Bijapur"], GA: ["North Goa", "South Goa"], GJ: ["Ahmadabad", "Amreli"], HR: ["Ambala", "Bhiwani"],
  HP: ["Bilaspur", "Chamba"], JH: ["Bokaro", "Chatra"], KA: ["Bagalkot", "Bangalore Rural"], KL: ["Alappuzha", "Ernakulam"],
  MP: ["Alirajpur", "Anuppur"], MH: ["Ahmadnagar", "Akola"], MN: ["Bishnupur", "Chandel"], ML: ["East Garo Hills", "East Khasi Hills"],
  MZ: ["Aizawl", "Champhai"], NL: ["Dimapur", "Kiphire"], OD: ["Anugul", "Balangir"], PB: ["Amritsar", "Barnala"],
  RJ: ["Ajmer", "Alwar"], SK: ["East", "North"], TN: ["Ariyalur", "Chennai"], TG: ["Adilabad", "Anantapur"], TR: ["Dhalai", "North Tripura"],
  UP: ["Agra", "Aligarh"], UT: ["Almora", "Bageshwar"], WB: ["Bankura", "Barddhaman"], AN: ["Nicobar", "South Andaman"],
  CH: ["Chandigarh"], DN: ["Dadra & Nagar Haveli", "Daman"], DL: ["Central", "East"], JK: ["Anantnag", "Badgam"],
  LA: ["Anantnag", "Badgam"], LD: ["Lakshadweep"], PY: ["Mahe", "Karaikal"],
});

export function demoDistrictCodeForBoundary(stateCode: string | null, boundaryDistrictName: string): string | null {
  if (!stateCode) return null;
  const position = DEMO_BOUNDARY_DISTRICTS[stateCode]?.indexOf(boundaryDistrictName) ?? -1;
  return position >= 0 ? `${stateCode}-${String(position + 1).padStart(2, "0")}` : null;
}

const raw: Array<[string, string, string, string, number, number, string, number, number]> = [
  ["AP","Andhra Pradesh","Andhra Pradesh","Visakhapatnam",17.6868,83.2185,"Vijayawada",16.5062,80.6480],
  ["AR","Arunanchal Pradesh","Arunachal Pradesh","Itanagar",27.0844,93.6053,"Pasighat",28.0661,95.3268],
  ["AS","Assam","Assam","Guwahati",26.1445,91.7362,"Silchar",24.8333,92.7789],
  ["BR","Bihar","Bihar","Patna",25.5941,85.1376,"Gaya",24.7914,85.0002],
  ["CG","Chhattisgarh","Chhattisgarh","Raipur",21.2514,81.6296,"Bilaspur",22.0797,82.1391],
  ["GA","Goa","Goa","Panaji",15.4909,73.8278,"Margao",15.2832,73.9862],
  ["GJ","Gujarat","Gujarat","Ahmedabad",23.0225,72.5714,"Surat",21.1702,72.8311],
  ["HR","Haryana","Haryana","Gurugram",28.4595,77.0266,"Faridabad",28.4089,77.3178],
  ["HP","Himachal Pradesh","Himachal Pradesh","Shimla",31.1048,77.1734,"Dharamshala",32.2190,76.3234],
  ["JH","Jharkhand","Jharkhand","Ranchi",23.3441,85.3096,"Jamshedpur",22.8046,86.2029],
  ["KA","Karnataka","Karnataka","Bengaluru",12.9716,77.5946,"Mysuru",12.2958,76.6394],
  ["KL","Kerala","Kerala","Thiruvananthapuram",8.5241,76.9366,"Kochi",9.9312,76.2673],
  ["MP","Madhya Pradesh","Madhya Pradesh","Bhopal",23.2599,77.4126,"Indore",22.7196,75.8577],
  ["MH","Maharashtra","Maharashtra","Mumbai",19.0760,72.8777,"Pune",18.5204,73.8567],
  ["MN","Manipur","Manipur","Imphal",24.8170,93.9368,"Thoubal",24.6380,93.9950],
  ["ML","Meghalaya","Meghalaya","Shillong",25.5788,91.8933,"Tura",25.5142,90.2024],
  ["MZ","Mizoram","Mizoram","Aizawl",23.7271,92.7176,"Lunglei",22.8671,92.7654],
  ["NL","Nagaland","Nagaland","Kohima",25.6751,94.1086,"Dimapur",25.9091,93.7276],
  ["OD","Odisha","Odisha","Bhubaneswar",20.2961,85.8245,"Cuttack",20.4625,85.8830],
  ["PB","Punjab","Punjab","Ludhiana",30.9010,75.8573,"Amritsar",31.6340,74.8723],
  ["RJ","Rajasthan","Rajasthan","Jaipur",26.9124,75.7873,"Jodhpur",26.2389,73.0243],
  ["SK","Sikkim","Sikkim","Gangtok",27.3389,88.6065,"Namchi",27.1667,88.3639],
  ["TN","Tamil Nadu","Tamil Nadu","Chennai",13.0827,80.2707,"Coimbatore",11.0168,76.9558],
  ["TG","Telangana","Telangana","Hyderabad",17.3850,78.4867,"Warangal",17.9689,79.5941],
  ["TR","Tripura","Tripura","Agartala",23.8315,91.2868,"Udaipur",23.5333,91.4833],
  ["UP","Uttar Pradesh","Uttar Pradesh","Lucknow",26.8467,80.9462,"Noida",28.5355,77.3910],
  ["UT","Uttarakhand","Uttarakhand","Dehradun",30.3165,78.0322,"Haridwar",29.9457,78.1642],
  ["WB","West Bengal","West Bengal","Kolkata",22.5726,88.3639,"Siliguri",26.7271,88.3953],
  ["AN","Andaman & Nicobar Island","Andaman and Nicobar Islands","Port Blair",11.6234,92.7265,"Diglipur",13.2649,93.0096],
  ["CH","Chandigarh","Chandigarh","Chandigarh",30.7333,76.7794,"Manimajra",30.7310,76.8420],
  ["DN","Dadara & Nagar Havelli","Dadra and Nagar Haveli and Daman and Diu","Silvassa",20.2763,73.0083,"Daman",20.3974,72.8328],
  ["DL","NCT of Delhi","Delhi","New Delhi",28.6139,77.2090,"South Delhi",28.4817,77.1870],
  ["JK","Jammu & Kashmir","Jammu and Kashmir","Srinagar",34.0837,74.7973,"Jammu",32.7266,74.8570],
  ["LA","Jammu & Kashmir","Ladakh","Leh",34.1526,77.5771,"Kargil",34.5539,76.1349],
  ["LD","Lakshadweep","Lakshadweep","Kavaratti",10.5669,72.6420,"Agatti",10.8490,72.1880],
  ["PY","Puducherry","Puducherry","Puducherry",11.9416,79.8083,"Karaikal",10.9254,79.8380],
];

function totalFor(index: number) { return 18 + ((index * 17 + 11) % 73); }
function split(total: number, index: number) {
  const critical = Math.max(1, Math.floor(total * (0.05 + (index % 3) * 0.01)));
  const high = Math.max(1, Math.floor(total * (0.17 + (index % 4) * 0.015)));
  const medium = Math.max(1, Math.floor(total * 0.34));
  const low = Math.max(1, Math.floor(total * 0.28));
  return { critical, high, medium, low, unknown: total - critical - high - medium - low };
}

export const SIH_DEMO_GIS_STATES: DemoState[] = raw.map(([code, geoName, label, cityA, latA, lonA, cityB, latB, lonB], index) => {
  const total = totalFor(index);
  const boundary = DEMO_BOUNDARY_DISTRICTS[code];
  const first = boundary[1] ? Math.ceil(total * (0.56 + (index % 4) * 0.04)) : total;
  return { code, geoName, label, districts: [
    { code: `${code}-01`, label: boundary[0], cities: [{ code: `${code}-01-A`, label: cityA, latitude: latA, longitude: lonA, cases: first }] },
    ...(boundary[1] ? [{ code: `${code}-02`, label: boundary[1], cities: [{ code: `${code}-02-A`, label: cityB, latitude: latB, longitude: lonB, cases: total - first }] }] : []),
  ] };
});

export function demoRow(code: string, cases: number, index: number) {
  const risk = split(cases, index);
  return {
    code,
    label: code,
    metric: { cases, new7d: Math.max(1, Math.floor(cases / 7)), highRisk: risk.critical + risk.high, open: Math.max(1, cases - Math.floor(cases / 4)) },
    categories: [{ label: "PHISHING", count: Math.floor(cases * .32) }, { label: "FINANCIAL_FRAUD", count: Math.floor(cases * .29) }, { label: "MALWARE", count: Math.floor(cases * .17) }, { label: "OTHER", count: cases - Math.floor(cases * .32) - Math.floor(cases * .29) - Math.floor(cases * .17) }],
    risks: [{ label: "CRITICAL", count: risk.critical }, { label: "HIGH", count: risk.high }, { label: "MEDIUM", count: risk.medium }, { label: "LOW", count: risk.low }, { label: "UNKNOWN", count: risk.unknown }],
    statuses: [{ label: "NEW", count: Math.ceil(cases * .2) }, { label: "UNDER_INVESTIGATION", count: Math.floor(cases * .35) }, { label: "RESOLVED", count: cases - Math.ceil(cases * .2) - Math.floor(cases * .35) }],
    sources: [{ label: "SIH_DEMO_GIS", count: cases }],
  };
}

export function buildSihDemoGeoSummary(state: string | null, district: string | null, locality: string | null) {
  const selected = state ? SIH_DEMO_GIS_STATES.find((entry) => entry.code === state) : null;
  const stateIndex = selected ? SIH_DEMO_GIS_STATES.indexOf(selected) : 0;
  const selectedDistrict = selected && district ? selected.districts.find((entry) => entry.code === district) : null;
  const selectedCity = selectedDistrict && locality ? selectedDistrict.cities.find((entry) => entry.label === locality) : null;
  const children = !state ? SIH_DEMO_GIS_STATES.map((entry, index) => demoRow(entry.code, entry.districts.reduce((n, d) => n + d.cities.reduce((m, c) => m + c.cases, 0), 0), index))
    : !district ? selected!.districts.map((entry, index) => demoRow(entry.code, entry.cities.reduce((n, city) => n + city.cases, 0), stateIndex * 2 + index))
    : selectedDistrict!.cities.filter((city) => !locality || city.label === locality).map((city, index) => demoRow(city.label, city.cases, stateIndex * 2 + index));
  const cases = children.reduce((n, row) => n + row.metric.cases, 0);
  const risks = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"].map((label) => ({ label, count: children.reduce((n, row) => n + (row.risks.find((x) => x.label === label)?.count ?? 0), 0) }));
  const threats = ["PHISHING", "FINANCIAL_FRAUD", "MALWARE", "OTHER"].map((label) => ({ label, count: children.reduce((n, row) => n + (row.categories.find((x) => x.label === label)?.count ?? 0), 0) }));
  return {
    state, district, level: state === null ? "india" : district === null ? "state" : "district",
    from: null, to: null, rows: children,
    total: { cases, new7d: children.reduce((n, row) => n + row.metric.new7d, 0), highRisk: risks[0].count + risks[1].count, open: children.reduce((n, row) => n + row.metric.open, 0) },
    threatBreakdown: threats, riskBreakdown: risks,
    cases: selectedCity ? Array.from({ length: selectedCity.cases }, (_, index) => ({ id: `SIH-GIS-${state}-${district}-${index + 1}`, caseNumber: `SIH-GIS-${state}-${district}-${String(index + 1).padStart(3, "0")}`, stateCode: state, districtCode: district, locality: selectedCity.label, threatCategory: threats[index % threats.length].label, riskLevel: risks[index % risks.length].label, govStatus: index % 3 === 0 ? "NEW" : "UNDER_INVESTIGATION", caseSource: "SIH_DEMO_GIS", createdAt: `2026-09-${String((index % 27) + 1).padStart(2, "0")}T09:00:00.000Z` })) : undefined,
    cityMarkers: selected ? selected.districts.flatMap((entry) => entry.cities.map((city) => ({ ...city, districtCode: entry.code }))) : [],
    generatedAt: "2026-09-27T00:00:00.000Z", source: "SIH Demo GIS data", verification: "Deterministic local demonstration data", excludedCounts: { unlocated: 0, invalidOrIncomplete: 0 }, isDemo: true,
  };
}
