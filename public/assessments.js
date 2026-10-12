'use strict';

// ---------- formatting ----------
const $ = (id) => document.getElementById(id);
const num = (id) => {
  const v = parseFloat($(id)?.value);
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const fmt = (n, min = 0, max = 6) =>
  n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const money = (n) => '$' + fmt(n, 2, 2);
const rate = (n) => fmt(n, 2, 6);
const per = (unit, max = 6) => (v) => `$${fmt(v, 2, max)} ${unit}`;
const FMT = {
  money,
  sqft: (v) => `${fmt(v)} sq ft`,
  ft: (v) => `${fmt(v, 0, 2)} ft`,
  homes: (v) => `${fmt(v)} ${v === 1 ? 'home' : 'homes'}`,
  edu: (v) => `${fmt(v, 2, 3)} EDU`,
  flag: (v) => (v ? '1 (yes)' : '0 (no)'),
  index: (v) => fmt(v, 0, 3),
  pct: (v) => `${fmt(v * 100, 0, 2)}%`,
};

// ---------- MathML builders ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mi = (s) => `<mi>${esc(s)}</mi>`;
const mup = (s) => `<mi mathvariant="normal">${esc(s)}</mi>`;
const mn = (s) => `<mn>${esc(s)}</mn>`;
const mo = (s) => `<mo>${esc(s)}</mo>`;
const mtext = (s) => `<mtext>${esc(s)}</mtext>`;
const row = (...xs) => `<mrow>${xs.join('')}</mrow>`;
const frac = (a, b) => `<mfrac>${a}${b}</mfrac>`;
const sub = (a, b) => `<msub>${a}${b}</msub>`;
const subsup = (a, b, c) => `<msubsup>${a}${b}${c}</msubsup>`;
const paren = (x) => row(mo('('), x, mo(')'));
const brack = (x) => row(mo('['), x, mo(']'));
const math = (x) => `<math display="block">${x}</math>`;
const unitText = (s) => `<mspace width="0.35em"/>${mtext(s)}`;
const label = (s, cls = 'label') => `<span class="${cls}">${esc(s)}</span>`;
const dot = mo('·');
const times = mo('×');
const eq = mo('=');
const plus = mo('+');
const minus = mo('−');
const approx = mo('≈');

// ---------- glossary ----------
// Every symbol that appears in a formula is defined once here. Each entry
// drives its tooltip, its color (kind), and, for constants, the editable
// constants table. kind: 'input' (entered by user), 'const' (set by the city),
// 'calc' (worked out by the calculator).
const G = {};
const live = {}; // latest calculated values, shown in tooltips

function define(prefix, entries) {
  for (const [k, e] of Object.entries(entries)) {
    G[`${prefix}.${k}`] = { id: e.kind === 'calc' ? undefined : `${prefix}-${k}`, ...e };
  }
}

const A_SYM = sub(mi('A'), mi('i'));
const assessment = (district) => ({
  kind: 'calc', sym: A_SYM, fmt: money, name: 'Yearly assessment',
  tip: `The amount this property pays each year for the ${district}, in dollars. The small i means "this property."`,
});
const zoneCheck = (letter, zone) => ({
  kind: 'calc', sym: sub(mi('I'), mi(letter)), fmt: FMT.flag, name: `${zone} zone check`,
  tip: `Equals 1 if the property is in the ${zone} zone, or 0 if it is not. Multiplying by 0 removes that zone's charge.`,
});

define('ph', {
  A: assessment('Pine Hollow district'),
  s: {
    kind: 'input', sym: sub(mi('s'), mi('i')), fmt: FMT.sqft, name: "Home's original size",
    tip: 'The floor area of the home when it was first built, in square feet. Rooms added later do not count.',
  },
  S: {
    kind: 'const', sym: mi('S'), fmt: FMT.sqft, name: 'Total size of all paying homes',
    tip: 'The original floor areas of all 401 homes that pay, added together.',
    value: 731026, step: 1, unit: 'sq ft',
  },
  T: {
    kind: 'const', sym: mi('T'), fmt: money, name: "District's yearly total",
    tip: 'The total amount the whole district must collect this year to pay for landscaping and lighting.',
    value: 61755.46, step: 0.01, prefix: '$',
  },
  r: {
    kind: 'calc', sym: mi('r'), fmt: per('per sq ft', 7), name: 'Cost per square foot',
    tip: 'The yearly total T divided by the total size S. Every square foot of home pays this same amount.',
  },
  rd: {
    kind: 'const', sym: sub(mi('r'), mtext('pub')), fmt: per('per sq ft'), name: 'Published rate',
    tip: "The cost per square foot printed in the city's report. It is rounded, so using it can be off by a few cents.",
    value: 0.08448, step: 0.00001, prefix: '$', unit: 'per sq ft',
  },
});

define('d3', {
  A: assessment('District No. 3'),
  IK: zoneCheck('K', 'Kirkwood'),
  IY: zoneCheck('Y', 'Ygnacio Woods Unit II'),
  IV: zoneCheck('V', 'Valley Terrace'),
  IB: zoneCheck('B', 'Balhan Terrace'),
  rK: {
    kind: 'const', sym: sub(mi('r'), mi('K')), fmt: per('per property'), name: 'Kirkwood rate',
    tip: 'The flat charge for each property in the Kirkwood zone.',
    value: 40.64, step: 0.01, prefix: '$', unit: 'per property',
  },
  rY: {
    kind: 'const', sym: sub(mi('r'), mi('Y')), fmt: per('per EDU'), name: 'Ygnacio Woods rate',
    tip: 'The charge per EDU in Ygnacio Woods Unit II. It can rise with prices (CPI) by up to 3% a year. This year it went up 1.75%.',
    value: 355, step: 0.01, prefix: '$', unit: 'per EDU',
  },
  rV: {
    kind: 'const', sym: sub(mi('r'), mi('V')), fmt: per('per property'), name: 'Valley Terrace rate',
    tip: 'The charge for each property in Valley Terrace. It is $0 this year because state tax money pays for the street lights.',
    value: 0, step: 0.01, prefix: '$', unit: 'per property',
  },
  rB: {
    kind: 'const', sym: sub(mi('r'), mi('B')), fmt: per('per home'), name: 'Balhan Terrace rate',
    tip: 'The charge for each home in Balhan Terrace. It is $0 this year because state tax money pays for the street lights.',
    value: 0, step: 0.01, prefix: '$', unit: 'per home',
  },
  edu: {
    kind: 'input', sym: sub(mi('EDU'), mi('i')), fmt: FMT.edu, name: 'Equivalent dwelling units (EDU)',
    tip: 'A way to compare properties to a regular home. In Ygnacio Woods, each single-family home counts as 1 EDU.',
  },
  u: {
    kind: 'input', sym: sub(mi('u'), mi('i')), fmt: FMT.homes, name: 'Homes on the property',
    tip: 'The number of homes (residential units) on the property. Only used in Balhan Terrace.',
  },
  TB: {
    kind: 'calc', sym: sub(mi('T'), mi('B')), fmt: money, name: 'Balhan Terrace zone total',
    tip: 'The total the Balhan Terrace zone would need to collect if it charged a fee again. There is no charge this year.',
  },
  UB: {
    kind: 'const', sym: sub(mi('U'), mi('B')), fmt: FMT.homes, name: 'All homes in Balhan Terrace',
    tip: 'The number of homes in the whole Balhan Terrace zone, spread across 6 properties.',
    value: 13, step: 1, unit: 'homes',
  },
});

const dtRate = (sym, unit, name, tip, value) => ({
  kind: 'const', sym, fmt: per(unit), name, tip, value, step: 0.000001, prefix: '$', unit,
});
const zoneCharge = (z, zone) => ({
  kind: 'calc', sym: subsup(mi('A'), mi('i'), mi(z)), fmt: money, name: `${zone} charge`,
  tip: `This property's charge for the ${zone} zone. It is $0 if the property is not in that zone.`,
});
const r2 = (a, b) => sub(mi('r'), mtext(a + b));

define('dt', {
  A: assessment('Downtown district'),
  P: {
    kind: 'input', sym: sub(mi('P'), mi('i')), fmt: FMT.sqft, name: 'Lot size',
    tip: 'The size of the property\'s lot, in square feet. The city calls this "parcel area."',
  },
  U: {
    kind: 'input', sym: sub(mi('U'), mi('i')), fmt: FMT.homes, name: 'Homes on the property',
    tip: 'The number of homes (residential units) on the property. Only used for properties with homes in the Plaza zone.',
  },
  R: {
    kind: 'calc', sym: sub(mi('R'), mi('i')), fmt: FMT.flag, name: 'Home check',
    tip: 'Equals 1 if the property has homes on it, or 0 if it is a business or other use. It picks which Plaza rate applies.',
  },
  FS: {
    kind: 'input', sym: subsup(mi('F'), mi('i'), mi('S')), fmt: FMT.ft, name: 'Street frontage',
    tip: "The length of the property's edge along the street, in feet, in the Streetscape zone.",
  },
  FC: {
    kind: 'input', sym: subsup(mi('F'), mi('i'), mi('C')), fmt: FMT.ft, name: 'Frontage facing a collector median',
    tip: "The length of the property's edge that faces a landscaped median on a collector street, in feet. A collector street links neighborhoods to major roads. It is 0 if the property doesn't face one.",
  },
  FT: {
    kind: 'input', sym: subsup(mi('F'), mi('i'), mi('T')), fmt: FMT.ft, name: 'Frontage facing a thoroughfare median',
    tip: "The length of the property's edge that faces a landscaped median on a thoroughfare (a major road), in feet. It is 0 if the property doesn't face one.",
  },
  IP: zoneCheck('P', 'Todos Santos Plaza'),
  IS: zoneCheck('S', 'Streetscape'),
  IC: zoneCheck('C', 'Collector Street Median'),
  IT: zoneCheck('T', 'Thoroughfare Median'),
  rPA: dtRate(r2('P', 'A'), 'per sq ft', 'Plaza rate for businesses',
    'The charge per square foot of lot for properties without homes in the Todos Santos Plaza zone.', 0.066582),
  rPU: dtRate(r2('P', 'U'), 'per home', 'Plaza rate for homes',
    'The charge for each home on a property in the Todos Santos Plaza zone.', 20.227564),
  rS: dtRate(sub(mi('r'), mtext('S')), 'per ft', 'Streetscape rate',
    'The charge for each foot of street frontage in the Streetscape zone.', 2.019385),
  rCF: dtRate(r2('C', 'F'), 'per ft', 'Collector median frontage rate',
    'The charge for each foot of frontage facing a collector street median. One-third of the median cost is shared this way.', 0.57362),
  rCA: dtRate(r2('C', 'A'), 'per sq ft', 'Collector median lot rate',
    'The charge per square foot of lot for every property in the Collector Street Median zone. Two-thirds of the median cost is shared this way.', 0.003344),
  rTF: dtRate(r2('T', 'F'), 'per ft', 'Thoroughfare median frontage rate',
    'The charge for each foot of frontage facing a thoroughfare median. One-third of the median cost is shared this way.', 1.418458),
  rTA: dtRate(r2('T', 'A'), 'per sq ft', 'Thoroughfare median lot rate',
    'The charge per square foot of lot for every property in the Thoroughfare Median zone. Two-thirds of the median cost is shared this way.', 0.003371),
  AP: zoneCharge('P', 'Todos Santos Plaza'),
  AS: zoneCharge('S', 'Streetscape'),
  AC: zoneCharge('C', 'Collector Street Median'),
  AT: zoneCharge('T', 'Thoroughfare Median'),
  cpiP: {
    kind: 'const', sym: sub(mi('CPI'), mtext('prior')), fmt: FMT.index, name: "Last year's price index",
    tip: 'The Consumer Price Index (CPI) from February of last year. The CPI tracks how much everyday prices go up.',
    value: 350.836, step: 0.001,
  },
  cpiC: {
    kind: 'const', sym: sub(mi('CPI'), mtext('now')), fmt: FMT.index, name: "This year's price index",
    tip: 'The Consumer Price Index (CPI) from February of this year.',
    value: 356.964, step: 0.001,
  },
  cap: {
    kind: 'const', sym: mi('c'), fmt: FMT.pct, name: 'Yearly cap',
    tip: 'The most the rates can go up in one year, as a decimal. 0.05 means 5%.',
    value: 0.05, step: 0.01,
  },
  delta: {
    kind: 'calc', sym: mi('Δ'), fmt: FMT.pct, name: 'Price change',
    tip: 'How much prices rose from last year to this year, as a decimal. For example, 0.0175 means 1.75%.',
  },
  rPrior: {
    kind: 'calc', sym: sub(mi('r'), mtext('prior')), name: "Last year's rate",
    tip: 'Any one of the rates above, as it was last year.',
  },
  rNow: {
    kind: 'calc', sym: sub(mi('r'), mtext('now')), name: "This year's rate",
    tip: 'The same rate after this year\'s increase.',
  },
  inc: {
    kind: 'calc', sym: mtext('increase'), fmt: FMT.pct, name: 'Increase used',
    tip: 'The smaller of the price change and the cap. This is how much the rates actually go up.',
  },
});

define('cw', {
  A: assessment('Citywide Street Lighting district'),
  L: {
    kind: 'input', id: 'cw-class', sym: sub(mi('L'), mi('i')), name: 'Land use type',
    tip: 'How the county classifies the use of the property, such as single-family home, store, or school.',
  },
  e: {
    kind: 'calc', sym: row(mi('e'), paren(sub(mi('L'), mi('i')))), fmt: FMT.edu, name: 'EDU value for this land use',
    tip: 'Equivalent dwelling units. This compares how much a property gains from street lights to a regular single-family home, which counts as 1.',
  },
  fi: {
    kind: 'calc', sym: sub(mi('f'), mtext('light')), fmt: (v) => fmt(v, 2, 3), name: 'Lighting need',
    tip: 'How much light this kind of property needs (the report calls this "illumination intensity").',
  },
  fp: {
    kind: 'calc', sym: sub(mi('f'), mtext('walk')), fmt: (v) => fmt(v, 2, 3), name: 'Foot traffic',
    tip: 'How many people walk to and from this kind of property (the report calls this "pedestrian activity").',
  },
  fs: {
    kind: 'calc', sym: sub(mi('f'), mtext('safe')), fmt: (v) => fmt(v, 2, 3), name: 'Safety need',
    tip: 'How much this kind of property benefits from lights for safety and security.',
  },
  r: {
    kind: 'const', sym: sub(mi('r'), mtext('EDU')), fmt: per('per EDU'), name: 'Rate per EDU',
    tip: 'The charge for each equivalent dwelling unit. The same rate applies across the city.',
    value: CITYWIDE_RATE, step: 0.01, prefix: '$', unit: 'per EDU',
  },
});

// A focusable, hoverable formula term. `inner` overrides the symbol, e.g. to
// show a substituted number with the same tooltip.
const term = (key, inner) =>
  `<mrow class="term k-${G[key].kind}" data-term="${key}" tabindex="0">${inner ?? G[key].sym}</mrow>`;
const val = (key, text) => term(key, mn(text));

function currentValue(key) {
  const g = G[key];
  if (key in live) return g.fmt ? g.fmt(live[key]) : String(live[key]);
  const el = g.id && $(g.id);
  if (!el) return undefined;
  if (el.tagName === 'SELECT') return el.selectedOptions[0]?.dataset.name ?? el.selectedOptions[0]?.text;
  if (el.type === 'checkbox') return FMT.flag(el.checked);
  return g.fmt ? g.fmt(num(g.id)) : el.value;
}

// ---------- tooltip ----------
const tip = $('tooltip');
let tipFor = null;

function showTip(el) {
  const g = G[el.dataset.term];
  if (!g) return;
  const value = currentValue(el.dataset.term);
  const kindText = { input: 'You enter this', const: 'Set by the city', calc: 'Worked out by the calculator' }[g.kind];
  tip.innerHTML =
    `<strong>${esc(g.name)}</strong><span>${esc(g.tip)}</span>` +
    (value !== undefined ? `<em>Current value: ${esc(value)}</em>` : '') +
    `<small class="k-${g.kind}">${kindText}</small>`;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 8));
  let top = r.top - th - 10;
  if (top < 8) top = r.bottom + 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  if (tipFor && tipFor !== el) tipFor.removeAttribute('aria-describedby');
  el.setAttribute('aria-describedby', 'tooltip');
  tipFor = el;
}

function hideTip() {
  tip.hidden = true;
  tipFor?.removeAttribute('aria-describedby');
  tipFor = null;
}

document.addEventListener('pointerover', (e) => {
  const el = e.target.closest?.('[data-term]');
  if (el) showTip(el);
  else if (tipFor && document.activeElement !== tipFor) hideTip();
});
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) hideTip(); });
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('[data-term]');
  if (el) showTip(el);
});
document.addEventListener('focusout', (e) => { if (e.target === tipFor) hideTip(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
addEventListener('scroll', hideTip, { passive: true });

// ---------- shared UI ----------
document.querySelectorAll('[data-sym]').forEach((el) => {
  el.innerHTML = `<math>${term(el.dataset.sym)}</math>`;
});

function constantsTable(containerId, keys) {
  const box = $(containerId);
  const rows = keys.map((key) => {
    const g = G[key];
    const pre = g.prefix ? `<span class="unit pre">${esc(g.prefix)}</span>` : '';
    const unit = g.unit ? `<span class="unit">${esc(g.unit)}</span>` : '';
    return `<tr><th scope="row"><math>${term(key)}</math></th><td>${esc(g.name)}</td>` +
      `<td><span class="field">${pre}<input id="${g.id}" type="number" min="0" step="${g.step}" value="${g.value}" aria-label="${esc(g.name)}">${unit}</span></td></tr>`;
  }).join('');
  box.innerHTML = `<table class="const-table"><tbody>${rows}</tbody></table>` +
    '<button type="button" class="reset">Reset to FY 2026-27 values</button>';
  box.querySelector('.reset').addEventListener('click', () => {
    keys.forEach((key) => { $(G[key].id).value = G[key].value; });
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function renderResult(id, value) {
  $(id).innerHTML =
    `<span>Yearly assessment</span><strong>${money(value)}</strong>` +
    `<small>before rounding: ${fmt(value, 2, 6)}</small>` +
    rollNote(id, value);
}

// Official roll amounts for a property opened from the map, keyed by result id.
const rollNotes = {};
function rollNote(id, value) {
  const note = rollNotes[id];
  if (!note) return '';
  if (note.amount === undefined) return `<p class="roll-note">${esc(note.text)}</p>`;
  const diff = Math.round((value - note.amount) * 100) / 100;
  const match = Math.abs(diff) < 0.01 ? 'Matches' : `Differs by ${money(Math.abs(diff))}`;
  return `<p class="roll-note"><span>${esc(note.text)}: <strong>${money(note.amount)}</strong></span>` +
    `<span class="${Math.abs(diff) < 0.01 ? 'ok' : 'off'}">${match}</span></p>`;
}

function bind(sectionId, fn) {
  const section = $(sectionId);
  section.addEventListener('input', fn);
  section.addEventListener('change', fn);
  fn();
}

// ---------- 1. Pine Hollow ----------
constantsTable('ph-constants', ['ph.T', 'ph.S', 'ph.rd']);
$('ph-general').innerHTML =
  math(row(term('ph.A'), eq, frac(row(term('ph.T'), dot, term('ph.s')), term('ph.S')), eq, term('ph.r'), dot, term('ph.s'))) +
  math(row(mtext('where'), '<mspace width="0.5em"/>', term('ph.r'), eq, frac(term('ph.T'), term('ph.S'))));

function pine() {
  const s = num('ph-s');
  const S = num('ph-S');
  const T = num('ph-T');
  const rd = num('ph-rd');
  const r = S > 0 ? T / S : 0;
  const A = r * s;
  Object.assign(live, { 'ph.r': r, 'ph.A': A });
  $('ph-sub').innerHTML =
    math(row(term('ph.r'), eq, frac(val('ph.T', fmt(T, 2)), val('ph.S', fmt(S))), approx, val('ph.r', fmt(r, 0, 7)))) +
    math(row(term('ph.A'), eq, val('ph.r', fmt(r, 0, 7)), times, val('ph.s', fmt(s)), eq, val('ph.A', money(A))));
  $('ph-check').innerHTML =
    math(row(term('ph.A'), approx, term('ph.rd'), dot, term('ph.s'), eq, val('ph.rd', fmt(rd, 0, 6)), times, val('ph.s', fmt(s)), eq, mn(money(rd * s))));
  renderResult('ph-result', A);
}
bind('pine-hollow', pine);

// ---------- 2. District No. 3 ----------
constantsTable('d3-constants', ['d3.rK', 'd3.rY', 'd3.rV', 'd3.rB', 'd3.UB']);
$('d3-general').innerHTML = math(
  row(
    term('d3.A'), eq,
    term('d3.IK'), dot, term('d3.rK'), plus,
    term('d3.IY'), dot, term('d3.rY'), dot, term('d3.edu'), plus,
    term('d3.IV'), dot, term('d3.rV'), plus,
    term('d3.IB'), dot, term('d3.rB'), dot, term('d3.u')
  )
);

function district3() {
  const zone = $('d3-zone').value;
  const edu = num('d3-edu');
  const u = num('d3-u');
  const rK = num('d3-rK'), rY = num('d3-rY'), rV = num('d3-rV'), rB = num('d3-rB');
  const UB = num('d3-UB');
  const ind = { K: +(zone === 'K'), Y: +(zone === 'Y'), V: +(zone === 'V'), B: +(zone === 'B') };
  const A = ind.K * rK + ind.Y * rY * edu + ind.V * rV + ind.B * rB * u;
  Object.assign(live, { 'd3.IK': ind.K, 'd3.IY': ind.Y, 'd3.IV': ind.V, 'd3.IB': ind.B, 'd3.A': A });

  $('d3-edu').closest('label').classList.toggle('dim', zone !== 'Y');
  $('d3-u').closest('label').classList.toggle('dim', zone !== 'B');

  $('d3-sub').innerHTML = math(
    row(
      term('d3.A'), eq,
      val('d3.IK', ind.K), times, val('d3.rK', rate(rK)), plus,
      val('d3.IY', ind.Y), times, val('d3.rY', rate(rY)), times, val('d3.edu', fmt(edu)), plus,
      val('d3.IV', ind.V), times, val('d3.rV', rate(rV)), plus,
      val('d3.IB', ind.B), times, val('d3.rB', rate(rB)), times, val('d3.u', fmt(u)),
      eq, val('d3.A', money(A))
    )
  );
  $('d3-balhan').innerHTML = math(
    row(term('d3.A'), eq, frac(row(term('d3.TB'), dot, term('d3.u')), term('d3.UB')), eq,
      frac(row(term('d3.TB'), times, val('d3.u', fmt(u))), val('d3.UB', fmt(UB))))
  );
  renderResult('d3-result', A);
}
bind('district-3', district3);

// ---------- 3. Downtown ----------
constantsTable('dt-constants', ['dt.rPA', 'dt.rPU', 'dt.rS', 'dt.rCF', 'dt.rCA', 'dt.rTF', 'dt.rTA']);
constantsTable('dt-cpi-constants', ['dt.cpiP', 'dt.cpiC', 'dt.cap']);

$('dt-general').innerHTML =
  label('Todos Santos Plaza') +
  math(row(term('dt.AP'), eq, term('dt.IP'), dot,
    brack(row(paren(row(mn('1'), minus, term('dt.R'))), dot, term('dt.rPA'), dot, term('dt.P'), plus, term('dt.R'), dot, term('dt.rPU'), dot, term('dt.U'))))) +
  label('Streetscape') +
  math(row(term('dt.AS'), eq, term('dt.IS'), dot, term('dt.rS'), dot, term('dt.FS'))) +
  label('Collector Street Median') +
  math(row(term('dt.AC'), eq, term('dt.IC'), dot, paren(row(term('dt.rCF'), dot, term('dt.FC'), plus, term('dt.rCA'), dot, term('dt.P'))))) +
  label('Thoroughfare Median') +
  math(row(term('dt.AT'), eq, term('dt.IT'), dot, paren(row(term('dt.rTF'), dot, term('dt.FT'), plus, term('dt.rTA'), dot, term('dt.P'))))) +
  label('Total for the property') +
  math(row(term('dt.A'), eq, term('dt.AP'), plus, term('dt.AS'), plus, term('dt.AC'), plus, term('dt.AT')));

$('dt-cpi-general').innerHTML =
  math(row(term('dt.delta'), eq, frac(term('dt.cpiC'), term('dt.cpiP')), minus, mn('1'))) +
  math(row(term('dt.rNow'), eq, term('dt.rPrior'), dot, paren(row(mn('1'), plus, mup('min'), paren(row(term('dt.delta'), mo(','), term('dt.cap')))))));

function downtown() {
  const v = {
    P: num('dt-P'), U: num('dt-U'), FS: num('dt-FS'), FC: num('dt-FC'), FT: num('dt-FT'),
    rPA: num('dt-rPA'), rPU: num('dt-rPU'), rS: num('dt-rS'),
    rCF: num('dt-rCF'), rCA: num('dt-rCA'), rTF: num('dt-rTF'), rTA: num('dt-rTA'),
  };
  const on = { P: $('dt-IP').checked, S: $('dt-IS').checked, C: $('dt-IC').checked, T: $('dt-IT').checked };
  const R = +$('dt-R').checked;

  for (const z of ['P', 'S', 'C', 'T']) {
    const fs = $('dt-I' + z).closest('fieldset');
    fs.classList.toggle('off', !on[z]);
    fs.querySelectorAll('input:not([id^="dt-I"])').forEach((el) => { el.disabled = !on[z]; });
  }
  $('dt-U').closest('label').classList.toggle('dim', !R);

  const parts = {
    P: on.P ? (R ? v.rPU * v.U : v.rPA * v.P) : 0,
    S: on.S ? v.rS * v.FS : 0,
    C: on.C ? v.rCF * v.FC + v.rCA * v.P : 0,
    T: on.T ? v.rTF * v.FT + v.rTA * v.P : 0,
  };
  const A = parts.P + parts.S + parts.C + parts.T;
  Object.assign(live, {
    'dt.R': R, 'dt.IP': +on.P, 'dt.IS': +on.S, 'dt.IC': +on.C, 'dt.IT': +on.T,
    'dt.AP': parts.P, 'dt.AS': parts.S, 'dt.AC': parts.C, 'dt.AT': parts.T, 'dt.A': A,
  });

  const notIn = (z, name) =>
    label(`${name}: not in this zone`, 'label off') +
    math(row(term(`dt.A${z}`), eq, val(`dt.I${z}`, '0'), times, mtext('(anything)'), eq, val(`dt.A${z}`, money(0))));

  const lines = [];
  if (!on.P) lines.push(notIn('P', 'Todos Santos Plaza'));
  else if (R) {
    lines.push(label('Todos Santos Plaza (has homes, so the home rate applies)') +
      math(row(term('dt.AP'), eq, val('dt.rPU', rate(v.rPU)), times, val('dt.U', fmt(v.U)), eq, val('dt.AP', money(parts.P)))));
  } else {
    lines.push(label('Todos Santos Plaza (no homes, so the lot size rate applies)') +
      math(row(term('dt.AP'), eq, val('dt.rPA', rate(v.rPA)), times, val('dt.P', fmt(v.P)), eq, val('dt.AP', money(parts.P)))));
  }

  lines.push(on.S
    ? label('Streetscape') +
      math(row(term('dt.AS'), eq, val('dt.rS', rate(v.rS)), times, val('dt.FS', fmt(v.FS)), eq, val('dt.AS', money(parts.S))))
    : notIn('S', 'Streetscape'));

  lines.push(on.C
    ? label('Collector Street Median') +
      math(row(term('dt.AC'), eq, val('dt.rCF', rate(v.rCF)), times, val('dt.FC', fmt(v.FC)), plus,
        val('dt.rCA', rate(v.rCA)), times, val('dt.P', fmt(v.P)), eq, val('dt.AC', money(parts.C))))
    : notIn('C', 'Collector Street Median'));

  lines.push(on.T
    ? label('Thoroughfare Median') +
      math(row(term('dt.AT'), eq, val('dt.rTF', rate(v.rTF)), times, val('dt.FT', fmt(v.FT)), plus,
        val('dt.rTA', rate(v.rTA)), times, val('dt.P', fmt(v.P)), eq, val('dt.AT', money(parts.T))))
    : notIn('T', 'Thoroughfare Median'));

  lines.push(label('Total for the property') +
    math(row(term('dt.A'), eq, val('dt.AP', fmt(parts.P, 2, 2)), plus, val('dt.AS', fmt(parts.S, 2, 2)), plus,
      val('dt.AC', fmt(parts.C, 2, 2)), plus, val('dt.AT', fmt(parts.T, 2, 2)), eq, val('dt.A', money(A)))));

  $('dt-sub').innerHTML = lines.join('');
  renderResult('dt-result', A);

  const cpiP = num('dt-cpiP');
  const cpiC = num('dt-cpiC');
  const cap = num('dt-cap');
  const delta = cpiP > 0 ? cpiC / cpiP - 1 : 0;
  const inc = Math.min(delta, cap);
  Object.assign(live, { 'dt.delta': delta, 'dt.inc': inc });
  $('dt-cpi-sub').innerHTML =
    math(row(term('dt.delta'), eq, frac(val('dt.cpiC', fmt(cpiC, 0, 3)), val('dt.cpiP', fmt(cpiP, 0, 3))), minus, mn('1'),
      approx, val('dt.delta', fmt(delta, 0, 4)))) +
    math(row(term('dt.inc'), eq, mup('min'), paren(row(val('dt.delta', fmt(delta, 0, 4)), mo(','), val('dt.cap', fmt(cap, 0, 4)))),
      eq, val('dt.inc', FMT.pct(inc))));
}
bind('downtown', downtown);

// ---------- 4. Citywide Street Lighting ----------
const classSelect = $('cw-class');
const tbody = document.querySelector('#cw-table tbody');
EDU_SCHEDULE.forEach(([name, codes, fi, fp, fs], idx) => {
  const edu = fi + fp + fs;
  const opt = new Option(`${name} (${codes}) - ${fmt(edu, 2, 3)} EDU`, idx);
  opt.dataset.name = name;
  classSelect.add(opt);
  const tr = document.createElement('tr');
  tr.dataset.idx = idx;
  [name, codes, fmt(fi, 3, 3), fmt(fp, 3, 3), fmt(fs, 3, 3), fmt(edu, 3, 3)].forEach((t) => {
    const td = document.createElement('td');
    td.textContent = t;
    tr.append(td);
  });
  tbody.append(tr);
});
tbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  classSelect.value = tr.dataset.idx;
  $('cw-code').value = '';
  $('cw-code-status').textContent = '';
  citywide();
  classSelect.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

constantsTable('cw-constants', ['cw.r']);
$('cw-general').innerHTML =
  math(row(term('cw.e'), eq, term('cw.fi'), plus, term('cw.fp'), plus, term('cw.fs'))) +
  math(row(term('cw.A'), eq, term('cw.r'), dot, term('cw.e')));

$('cw-code').addEventListener('input', () => {
  const raw = $('cw-code').value.trim();
  const status = $('cw-code-status');
  if (!raw) { status.textContent = ''; return; }
  const idx = /^\d+$/.test(raw) ? EDU_CODE_INDEX.get(Number(raw)) : undefined;
  if (idx === undefined) {
    status.textContent = `No land use type found for code "${raw}".`;
    status.classList.add('error');
  } else {
    classSelect.value = idx;
    status.textContent = `Code ${Number(raw)}: ${EDU_SCHEDULE[idx][0]}`;
    status.classList.remove('error');
  }
});

function citywide() {
  const idx = Number(classSelect.value) || 0;
  const [name, , fi, fp, fs] = EDU_SCHEDULE[idx];
  const edu = fi + fp + fs;
  const r = num('cw-r');
  const A = r * edu;
  Object.assign(live, { 'cw.fi': fi, 'cw.fp': fp, 'cw.fs': fs, 'cw.e': edu, 'cw.A': A });
  $('cw-sub').innerHTML =
    label(name) +
    math(row(term('cw.e'), eq, val('cw.fi', fmt(fi, 2, 3)), plus, val('cw.fp', fmt(fp, 2, 3)), plus, val('cw.fs', fmt(fs, 2, 3)),
      eq, val('cw.e', fmt(edu, 2, 3)), unitText('EDU'))) +
    math(row(term('cw.A'), eq, val('cw.r', rate(r)), times, val('cw.e', fmt(edu, 2, 3)), eq, val('cw.A', money(A))));
  renderResult('cw-result', A);
  tbody.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('selected', Number(tr.dataset.idx) === idx));
}
bind('citywide', citywide);

// ---------- Links with the district map ----------
const PARAM_INPUTS = ['ph-s', 'd3-zone', 'd3-edu', 'd3-u', 'dt-P', 'dt-IP', 'dt-IS', 'dt-IC', 'dt-IT',
  'dt-R', 'dt-U', 'dt-FS', 'dt-FC', 'dt-FT', 'cw-code'];
const ROLL_SECTIONS = { 'pine-hollow': 'ph-result', 'district-3': 'd3-result', downtown: 'dt-result' };
const params = new URLSearchParams(location.search);
const parcelApn = (params.get('apn') || '').replace(/\D/g, '');
const apnText = parcelApn.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1-$2-$3');

for (const [sectionId] of [...Object.entries(ROLL_SECTIONS), ['citywide']]) {
  const head = document.querySelector(`#${sectionId} .district-head`);
  const link = document.createElement('a');
  link.className = 'map-link';
  if (parcelApn) {
    link.href = `index.html#apn=${parcelApn}`;
    link.textContent = 'This property on the map';
  } else if (sectionId === 'citywide') {
    continue;
  } else {
    link.href = `index.html#district=${sectionId}`;
    link.textContent = 'View on map';
  }
  head.append(link);
}

function applyParams() {
  for (const id of PARAM_INPUTS) {
    if (!params.has(id)) continue;
    const input = $(id);
    const value = params.get(id);
    if (input.type === 'checkbox') input.checked = value === '1';
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  for (const id of ['dt-FS', 'dt-FC', 'dt-FT']) {
    if (params.get(id) === '0') $(id).closest('.field').classList.add('unknown');
  }
}

function renderBanner() {
  const banner = $('parcel-banner');
  const addr = params.get('addr');
  banner.innerHTML =
    `<div><span class="eyebrow">Property from the map</span>` +
    `<strong>APN ${esc(apnText)}</strong>${addr ? ` <span class="addr">${esc(addr)}</span>` : ''}</div>` +
    `<p>The inputs below were filled in from the county parcel record. Check them before you trust a result. ` +
    `Street frontage is not in the record, so the Downtown frontage boxes start at 0 and are marked in orange. ` +
    `Home size uses today's living area, which can include rooms added later.</p>` +
    `<div class="banner-actions"><a href="index.html#apn=${esc(parcelApn)}">&larr; Back to this property on the map</a>` +
    `<a href="assessments.html">Clear property</a></div>`;
  banner.hidden = false;
}

async function loadRoll() {
  try {
    const response = await fetch('data/districts.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const entries = data.parcels[parcelApn] || [];
    for (const [sectionId, resultId] of Object.entries(ROLL_SECTIONS)) {
      const entry = entries.find((e) => e.d === sectionId);
      rollNotes[resultId] = entry
        ? { text: `Official FY ${data.fiscal_year} roll`, amount: entry.a }
        : { text: `This property is not on the FY ${data.fiscal_year} roll for this district, so it pays $0.00.` };
    }
    rollNotes['cw-result'] = { text: 'The city does not publish a Citywide roll by property, so this result cannot be checked.' };
    for (const sectionId of [...Object.keys(ROLL_SECTIONS), 'citywide']) {
      $(sectionId).dispatchEvent(new Event('change'));
    }
  } catch (error) {
    console.warn('Could not load the assessment rolls:', error);
  }
}

if (parcelApn) {
  applyParams();
  renderBanner();
  loadRoll();
  if (location.hash) $(location.hash.slice(1))?.scrollIntoView();
}
