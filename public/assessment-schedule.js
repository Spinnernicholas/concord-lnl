'use strict';

// Shared by the parcel map (app.js) and the calculators (assessments.js).
// Citywide Street Lighting EDU schedule, FY 2026-27 Engineer's Report, Appendix A.
// [land use type, county codes, lighting, foot traffic, safety]
const EDU_SCHEDULE = [
  ['Single-family home', '11, 12, 13, 14, 19, 61', 0.25, 0.5, 0.25],
  ['Single-family home on private street', 'N/A', 0.25, 0.5, 0],
  ['Condominium', '16, 29', 0.25, 0.125, 0.125],
  ['Multiple family: 2 units', '21', 0.25, 1, 0.5],
  ['Multiple family: 3 units', '22, 24', 0.25, 2.25, 0.5],
  ['Multiple family: 4 units', '23', 0.5, 2.25, 0.5],
  ['Multiple family: 5-12 units', '25', 0.5, 3.5, 1],
  ['Multiple family: 13-24 units', '26', 0.75, 4, 1.25],
  ['Multiple family: 25-59 units', '27', 0.75, 4.5, 1.75],
  ['Multiple family: 60+ units', '28', 1, 5, 2],
  ['Commercial stores', '31', 1, 2, 1],
  ['Small grocery stores', '32', 1, 2, 1],
  ['Office buildings', '33', 1, 1, 1],
  ['Medical-dental offices', '34', 1, 1, 1],
  ['Service stations', '35', 1, 2, 1],
  ['Garages', '36', 1, 0.5, 1],
  ['Recreational clubs', '37', 1, 4, 1],
  ['Golf courses', '38', 1, 1, 1],
  ['Bowling alleys', '39', 1, 4, 1],
  ['Boat harbors', '40', 1, 3, 1],
  ['Supermarkets', '41', 1, 6, 1],
  ['Shopping centers', '42', 5, 10, 5],
  ['Financial office buildings', '43', 1, 1, 1],
  ['Hotels, motels, mobile homes', '44', 2, 5, 2],
  ['Theaters', '45', 2, 2, 2],
  ['Drive-in restaurants', '46', 1, 3, 1],
  ['Restaurants', '47', 1, 3, 1],
  ['Mixed multiple/commercial', '48', 1, 3, 1],
  ['Auto agency', '49', 1, 3, 1],
  ['Industrial parks', '51, 52', 1, 3, 1],
  ['Industrial', '53, 54, 56', 5, 10, 5],
  ['Warehouses', '55', 1, 3, 1],
  ['Unassigned (pipeline right-of-way)', '59', 0, 0, 0],
  ['Convalescent hospitals', '70', 1, 1, 1],
  ['Churches', '71', 0.5, 1, 0.5],
  ['Schools', '72', 0.5, 1, 0.5],
  ['Hospitals', '73', 1, 1, 1],
  ['Cemeteries, mortuaries', '74', 0.25, 0.5, 0.25],
  ['Fraternal and service organizations', '75', 1, 2, 1],
  ['Retirement housing complex', '76', 1, 1, 1],
  ['Cultural uses', '77', 1, 1, 1],
  ['Parks and playgrounds', '78', 0, 0, 0],
  ['Government-owned buildings (business-use part)', '79', 1, 1, 1],
  ['Vacant land', '10, 15, 17, 18, 20, 30, 50, 60, 62-69', 0.25, 0, 0.25],
  ['Mineral rights', '80', 0, 0, 0],
  ['Private roads', '81', 0.125, 0.25, 0.125],
  ['Pipelines and canals', '82', 0, 0, 0],
  ['State Board assessed parcels (business-use part)', '83', 1, 1, 1],
  ['Utilities', '84', 0, 0, 0],
  ['Parking facilities', '85', 0.5, 1, 1],
  ['Municipal properties (business-use part)', '86', 1, 1, 1],
  ['Common areas', '87', 0, 0, 0],
  ['Mobile homes (land underneath only)', '88', 0, 0, 0],
  ['Split parcels in different tax-code areas', '89', 0.25, 0.5, 0.25],
  ['Exempt', '99', 0, 0, 0],
];

const EDU_CODE_INDEX = new Map();
EDU_SCHEDULE.forEach(([, codes], idx) => {
  for (const part of codes.split(',').map((s) => s.trim())) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const end = m[2] ? Number(m[2]) : Number(m[1]);
    for (let c = Number(m[1]); c <= end; c++) EDU_CODE_INDEX.set(c, idx);
  }
});

const CITYWIDE_RATE = 25;
const SINGLE_FAMILY_CODES = new Set([11, 12, 13, 14, 19, 61]);
// Codes whose schedule class is a home: single-family, condominium, multiple family.
const RESIDENTIAL_CODES = new Set([...SINGLE_FAMILY_CODES, 16, 29, 21, 22, 23, 24, 25, 26, 27, 28]);

function eduClassForCode(code) {
  const text = String(code ?? '').trim();
  const n = Number(text);
  if (!text || !Number.isInteger(n) || !EDU_CODE_INDEX.has(n)) return null;
  const idx = EDU_CODE_INDEX.get(n);
  const [name, codes, fi, fp, fs] = EDU_SCHEDULE[idx];
  return { idx, name, codes, edu: fi + fp + fs };
}

const isSingleFamilyCode = (code) => SINGLE_FAMILY_CODES.has(Number(code));
const isResidentialCode = (code) => RESIDENTIAL_CODES.has(Number(code));

// Home count for a parcel: the UNITS field, else what the use code implies.
// Returns null when the code gives only a range (5+ unit buildings).
function homeCount(code, units) {
  if (Number(units) > 0) return Number(units);
  const n = Number(code);
  if (SINGLE_FAMILY_CODES.has(n) || n === 16 || n === 29) return 1;
  return { 21: 2, 22: 3, 24: 3, 23: 4 }[n] ?? (RESIDENTIAL_CODES.has(n) ? null : 0);
}
