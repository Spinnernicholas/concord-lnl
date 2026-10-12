"use strict";

const byId = (id) => document.getElementById(id);
const overview = { center: [37.978, -122.031], zoom: 12 };
const baseStyle = { color: "#5f7887", weight: 0.7, fillColor: "#8aa0ad", fillOpacity: 0.05 };
const selectedStyle = { color: "#111c24", weight: 3.5, fillColor: "#ffd34d", fillOpacity: 0.45 };
const PRIMARY_LAYERS = new Set(["pine-hollow", "district-3-kirkwood", "district-3-ygnacio-woods", "downtown"]);
const DOWNTOWN_ZONES = { T: "Todos Santos Plaza", C: "Collector Median", S: "Streetscape" };
const DOWNTOWN_CLASSES = {
  SFR: "Single-family home", CONDO: "Condominium", MFR: "Multifamily", COM: "Commercial",
  IND: "Industrial", INST: "Institutional", PUB: "Public", MISC: "Miscellaneous",
  VSFR: "Vacant single-family", VMFR: "Vacant multifamily", VCOM: "Vacant commercial", VIND: "Vacant industrial",
};
const D3_ZONES = { K: "Kirkwood", Y: "Ygnacio Woods Unit II" };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const tileCache = new Map();
const attributeCache = new Map();
const visibleLayers = new Map();
const outlineLayers = new Map();
const districtOn = new Set();
const layerOn = new Set(PRIMARY_LAYERS);
let manifest;
let districtData;
let districtById = new Map();
let rollIndex = {};
let searchRows;
let selectedLayer;
let selectedApn;
let selectedToken = 0;
let viewToken = 0;
let searchToken = 0;
let selectionDownload;
let lastClickLatLng = null;

let statusTimer;
function status(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
  if (element.id === "map-status") {
    clearTimeout(statusTimer);
    element.classList.remove("faded");
    if (!error) statusTimer = setTimeout(() => element.classList.add("faded"), 4000);
  }
}

// Mobile bottom sheet: the sidebar slides over a full-screen map.
const mobileQuery = window.matchMedia("(max-width: 700px)");
const isMobile = () => mobileQuery.matches;
let sheetState = "collapsed";
let sheetPx = 0;

function sheetHeights() {
  const vh = window.innerHeight;
  const collapsed = Math.min(byId("sheet-handle").nextElementSibling.offsetHeight + byId("search-form").offsetHeight + 4, vh * .45);
  return { collapsed, half: Math.max(vh * .5, collapsed), full: vh * .92 };
}

function setSheetHeight(px) {
  sheetPx = px;
  document.documentElement.style.setProperty("--sheet-h", `${Math.round(px)}px`);
}

function setSheet(state) {
  if (!isMobile()) return;
  sheetState = state;
  setSheetHeight(sheetHeights()[state]);
  if (state === "collapsed") document.querySelector(".sidebar").scrollTop = 0;
}

function fitOptions(pad, maxZoom) {
  if (!isMobile()) return { padding: [pad, pad], maxZoom };
  return { paddingTopLeft: [pad, pad + 50], paddingBottomRight: [pad, pad + sheetPx], maxZoom };
}

function setupSheet() {
  const handle = byId("sheet-handle");
  const header = handle.nextElementSibling;
  let drag = null;
  let suppressClick = false;
  const cycle = () => setSheet(sheetState === "collapsed" ? "half" : sheetState === "half" ? "full" : "collapsed");
  const start = (event) => {
    if (!isMobile() || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag = { y: event.clientY, h: sheetPx, moved: false, id: event.pointerId, target: event.currentTarget };
  };
  const move = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.classList.add("sheet-dragging");
    }
    event.preventDefault();
    const { collapsed, full } = sheetHeights();
    setSheetHeight(Math.min(full, Math.max(collapsed, drag.h - dy)));
  };
  const end = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const wasDrag = drag.moved;
    const fromHandle = drag.target === handle;
    drag = null;
    document.body.classList.remove("sheet-dragging");
    if (!wasDrag) {
      if (fromHandle && event.type === "pointerup") cycle();
      return;
    }
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const heights = sheetHeights();
    const nearest = Object.keys(heights).reduce((a, b) => Math.abs(heights[a] - sheetPx) <= Math.abs(heights[b] - sheetPx) ? a : b);
    setSheet(nearest);
  };
  handle.addEventListener("pointerdown", start);
  header.addEventListener("pointerdown", start);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("click", (event) => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  }, true);
  handle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cycle(); }
  });
  byId("search").addEventListener("focus", () => setSheet("full"));
  const sync = () => {
    byId("legend-box").open = !isMobile();
    if (isMobile()) setSheet(sheetState);
    else document.documentElement.style.removeProperty("--sheet-h");
  };
  mobileQuery.addEventListener("change", sync);
  window.addEventListener("resize", () => { if (isMobile()) setSheet(sheetState); });
  sync();
}

async function fetchJson(path, cache, key) {
  if (cache?.has(key)) {
    const cached = cache.get(key);
    return cached instanceof Promise ? await cached : cached;
  }
  const pending = fetch(path).then(async (response) => {
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const data = await response.json();
    if (cache) cache.set(key, data);
    return data;
  });
  if (cache) cache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    if (cache) cache.delete(key);
    throw error;
  }
}

function boundsToLeaflet(bounds) {
  return [[bounds[1], bounds[0]], [bounds[3], bounds[2]]];
}

function intersects(bounds, view) {
  return bounds[0] <= view.getEast() && bounds[2] >= view.getWest()
    && bounds[1] <= view.getNorth() && bounds[3] >= view.getSouth();
}

const cleanAddress = (value) => String(value ?? "").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
const apnDigits = (value) => String(value ?? "").replace(/\D/g, "");

function apnDisplay(value) {
  return /^\d{9}$/.test(value) ? value.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3") : value;
}

function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function swatch(color, dashed = false) {
  const span = el("span", null, dashed ? "swatch dashed" : "swatch");
  span.style.setProperty("--c", color);
  span.setAttribute("aria-hidden", "true");
  return span;
}

function numberField(value) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Geometry helpers for stacking and hit-testing parcels
function ringArea(ring) {
  if (!ring || ring.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return Math.abs(a) / 2;
}

function featureArea(feature) {
  const geom = feature?.geometry;
  if (!geom) return 0;
  if (geom.type === "Polygon") return ringArea(geom.coordinates[0]);
  if (geom.type === "MultiPolygon") {
    let sum = 0;
    for (const poly of geom.coordinates) sum += ringArea(poly[0]);
    return sum;
  }
  return 0;
}

function featureBBox(feature) {
  if (feature._bbox) return feature._bbox;
  const geom = feature?.geometry;
  if (!geom) return [0, 0, 0, 0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const update = (ring) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };
  if (geom.type === "Polygon") update(geom.coordinates[0]);
  else if (geom.type === "MultiPolygon") for (const poly of geom.coordinates) update(poly[0]);
  feature._bbox = [minX, minY, maxX, maxY];
  return feature._bbox;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt, geom) {
  if (!geom) return false;
  const [x, y] = pt;
  if (geom.type === "Polygon") {
    if (!pointInRing(x, y, geom.coordinates[0])) return false;
    for (let k = 1; k < geom.coordinates.length; k++) {
      if (pointInRing(x, y, geom.coordinates[k])) return false;
    }
    return true;
  }
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      if (pointInRing(x, y, poly[0])) {
        let inHole = false;
        for (let k = 1; k < poly.length; k++) {
          if (pointInRing(x, y, poly[k])) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

function representativePoint(geom) {
  if (!geom) return null;
  const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0]?.[0];
  if (!ring || ring.length < 3) return null;
  const n = ring.length - 1;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  const pt = [sx / n, sy / n];
  if (pointInGeometry(pt, geom)) return pt;
  for (let i = 0; i < n; i++) {
    const testPt = [ring[i][0] * 0.2 + pt[0] * 0.8, ring[i][1] * 0.2 + pt[1] * 0.8];
    if (pointInGeometry(testPt, geom)) return testPt;
  }
  return ring[0];
}

function prepareTileFeatures(data, tileId) {
  if (data._prepared) return;
  data._prepared = true;
  for (const feature of data.features) {
    feature._tileId = tileId;
    feature._area = featureArea(feature);
    feature._bbox = featureBBox(feature);
  }
  // Sort descending by area so largest (common areas) are drawn first,
  // and smallest (individual units) sit on top in SVG DOM order.
  data.features.sort((a, b) => b._area - a._area);
}

function findParcelsAtPoint(pt, tileHint) {
  const [x, y] = pt;
  const matches = [];
  const seenApns = new Set();
  const tileIds = tileHint && tileCache.has(tileHint)
    ? [tileHint, ...Array.from(tileCache.keys()).filter((id) => id !== tileHint)]
    : Array.from(tileCache.keys());

  for (const tileId of tileIds) {
    const data = tileCache.get(tileId);
    if (!data?.features) continue;
    if (!data._prepared) prepareTileFeatures(data, tileId);
    for (const feature of data.features) {
      const apn = apnDigits(feature.properties?.APN);
      if (seenApns.has(apn)) continue;
      const [minX, minY, maxX, maxY] = feature._bbox || featureBBox(feature);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (pointInGeometry(pt, feature.geometry)) {
        seenApns.add(apn);
        matches.push({ feature, tileId });
      }
    }
  }
  // Smallest area first so individual condo units come before common area
  matches.sort((a, b) => (a.feature._area || 0) - (b.feature._area || 0));
  return matches;
}

function onParcelClick(event, feature, tileId) {
  const pt = [event.latlng.lng, event.latlng.lat];
  const stacked = findParcelsAtPoint(pt, tileId);
  const list = stacked.length > 0 ? stacked : [{ feature, tileId }];

  const curIdx = list.findIndex((item) => apnDigits(item.feature.properties?.APN) === selectedApn);
  const isRepeatClick = list.length > 1 && curIdx >= 0 && lastClickLatLng && event.latlng.distanceTo(lastClickLatLng) < 15;

  let target;
  if (isRepeatClick) {
    target = list[(curIdx + 1) % list.length];
  } else {
    // If the clicked feature is the common area (large area) but smaller units exist here,
    // prefer the smallest unit rather than the common area.
    const clickedMatch = list.find((item) => item.feature.properties?.OBJECTID === feature.properties?.OBJECTID);
    target = (clickedMatch && clickedMatch === list[list.length - 1] && list.length > 1) ? list[0] : (clickedMatch || list[0]);
  }

  lastClickLatLng = event.latlng;
  selectParcel(target.feature, target.tileId, target.feature.properties?.OBJECTID, list);
}

// ---------- Map ----------

const map = L.map("map", { preferCanvas: true, zoomControl: true }).setView(overview.center, overview.zoom);
const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19, attribution: "Imagery &copy; Esri and contributors",
});
L.control.layers({ "Street map": streets, "Satellite": imagery }, null, { position: "topright" }).addTo(map);
L.control.scale({ imperial: true }).addTo(map);
// District outlines sit above the parcel canvas. They take clicks only when
// property lines are hidden (see .parcels-visible in style.css).
map.createPane("districts");
map.getPane("districts").style.zIndex = "420";
const districtRenderer = L.svg({ pane: "districts" });
map.createPane("selection");
map.getPane("selection").style.zIndex = "450";
const selectionRenderer = L.canvas({ pane: "selection" });
for (const basemap of [streets, imagery]) {
  basemap.on("tileerror", () => status(byId("map-status"), "Basemap tile unavailable. Check your internet connection; local parcel data still works.", true));
}

function rollEntries(apn) {
  return rollIndex[apnDigits(apn)] || [];
}

function parcelStyle(feature) {
  const entry = rollEntries(feature.properties.APN).find((e) => districtOn.has(e.d));
  if (!entry) return baseStyle;
  const color = districtById.get(entry.d).color;
  return { color, weight: 1, fillColor: color, fillOpacity: 0.32 };
}

function restyleParcels() {
  for (const layer of visibleLayers.values()) layer.setStyle(parcelStyle);
}

async function updateView() {
  if (!manifest) return;
  const token = ++viewToken;
  const showing = byId("show-parcels").checked && map.getZoom() >= manifest.minimum_zoom;
  map.getContainer().classList.toggle("parcels-visible", showing);
  if (!showing) {
    for (const layer of visibleLayers.values()) map.removeLayer(layer);
    visibleLayers.clear();
    status(byId("map-status"), byId("show-parcels").checked
      ? `Zoom in to see property lines, or click a district area to zoom to it.`
      : "Property lines hidden. The selected property stays visible.");
    return;
  }
  const tiles = manifest.tiles.filter((tile) => intersects(tile.bounds, map.getBounds()));
  const wanted = new Set(tiles.map((tile) => tile.id));
  for (const [id, layer] of visibleLayers) {
    if (!wanted.has(id)) {
      map.removeLayer(layer);
      visibleLayers.delete(id);
    }
  }
  status(byId("map-status"), `Loading ${tiles.length} nearby parcel chunks...`);
  try {
    // Bound concurrent file requests so even dense views remain responsive.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, tiles.length) }, async () => {
      while (next < tiles.length && token === viewToken) {
        const tile = tiles[next++];
        if (visibleLayers.has(tile.id)) continue;
        const data = await fetchJson(`data/tiles/${tile.id}.geojson`, tileCache, tile.id);
        if (token !== viewToken) return;
        prepareTileFeatures(data, tile.id);
        const layer = L.geoJSON(data, {
          style: parcelStyle,
          onEachFeature: (feature, polygon) => {
            polygon.on("click", (e) => onParcelClick(e, feature, tile.id));
            polygon.bindTooltip(() => parcelTooltip(feature), { sticky: true });
          },
        }).addTo(map);
        visibleLayers.set(tile.id, layer);
      }
    }));
    if (token !== viewToken) return;
    const count = tiles.reduce((total, tile) => total + tile.count, 0);
    status(byId("map-status"), `${count.toLocaleString()} properties loaded. Click one to see its assessments.`);
    // Geometry outside the current viewport can be discarded and refetched later.
    for (const id of tileCache.keys()) {
      if (!wanted.has(id)) tileCache.delete(id);
    }
  } catch (error) {
    if (token === viewToken) status(byId("map-status"), `Could not load parcels: ${error.message}. Pan or zoom to retry.`, true);
  }
}

function parcelTooltip(feature) {
  const p = feature.properties;
  const wrap = el("span");
  wrap.append(el("strong", apnDisplay(p.APN || "")), document.createTextNode(` | ${cleanAddress(p.full_address_display) || "No address"}`));
  for (const entry of rollEntries(p.APN)) {
    const line = el("span", null, "tip-line");
    line.append(swatch(districtById.get(entry.d).color), document.createTextNode(`${districtById.get(entry.d).short}: ${money.format(entry.a)}`));
    wrap.append(line);
  }
  if (feature._stackedCount === undefined && feature.geometry) {
    const rep = representativePoint(feature.geometry);
    if (rep) {
      const hits = findParcelsAtPoint(rep, feature._tileId);
      feature._stackedCount = hits.length;
    } else {
      feature._stackedCount = 1;
    }
  }
  if (feature._stackedCount > 1) {
    wrap.append(el("span", `Stacked property (${feature._stackedCount} units/areas · click to cycle)`, "tip-stacked"));
  }
  return wrap;
}

// ---------- Districts ----------

function buildOutlines() {
  for (const feature of districtData.outlines.features) {
    const { id, district_id: districtId, zone, color } = feature.properties;
    const primary = PRIMARY_LAYERS.has(id);
    const layer = L.geoJSON(feature, {
      pane: "districts",
      renderer: districtRenderer,
      style: {
        color, weight: primary ? 2.5 : 2, dashArray: primary ? null : "6 5",
        fillColor: color, fillOpacity: primary ? 0.12 : 0.06,
      },
    });
    const district = districtById.get(districtId);
    layer.bindTooltip(zone && district.layers.length > 1 ? `${district.short}: ${zone}` : district.short, { sticky: true });
    layer.on("click", () => { layer.closeTooltip(); zoomToDistrict(districtId, id); });
    outlineLayers.set(id, layer);
  }
}

function refreshOutlines() {
  for (const [id, layer] of outlineLayers) {
    const districtId = layer.getLayers()[0].feature.properties.district_id;
    const show = districtOn.has(districtId) && layerOn.has(id);
    if (show && !map.hasLayer(layer)) layer.addTo(map);
    if (!show && map.hasLayer(layer)) map.removeLayer(layer);
  }
  for (const input of document.querySelectorAll("[data-layer]")) {
    input.disabled = !districtOn.has(input.dataset.district);
  }
  renderLegend();
}

function zoomToDistrict(districtId, layerId) {
  if (!districtOn.has(districtId)) setDistrict(districtId, true);
  const ids = layerId ? [layerId] : districtById.get(districtId).layers.map((l) => l.id);
  const group = L.featureGroup(ids.map((id) => outlineLayers.get(id)).filter(Boolean));
  if (group.getLayers().length) map.fitBounds(group.getBounds(), fitOptions(30, 17));
}

function setDistrict(districtId, on) {
  if (on) districtOn.add(districtId); else districtOn.delete(districtId);
  const box = document.querySelector(`[data-district-toggle="${districtId}"]`);
  if (box) box.checked = on;
  refreshOutlines();
  restyleParcels();
}

function renderDistrictList() {
  const list = byId("district-list");
  list.replaceChildren();
  for (const d of districtData.districts) {
    const li = el("li", null, "district-item");
    li.style.setProperty("--c", d.color);
    const head = el("div", null, "district-row");
    if (d.layers.length) {
      const label = el("label", null, "toggle");
      const box = el("input");
      box.type = "checkbox";
      box.checked = districtOn.has(d.id);
      box.dataset.districtToggle = d.id;
      box.addEventListener("change", () => setDistrict(d.id, box.checked));
      label.append(box, swatch(d.color), el("span", d.short, "name"));
      head.append(label);
    } else {
      const label = el("span", null, "toggle");
      label.append(swatch(d.color, true), el("span", d.short, "name"));
      head.append(label);
    }
    const actions = el("span", null, "actions");
    if (d.layers.length) {
      const zoom = el("button", "Zoom", "small");
      zoom.type = "button";
      zoom.addEventListener("click", () => zoomToDistrict(d.id));
      actions.append(zoom);
    }
    const formula = el("a", "Formula", "small");
    formula.href = `assessments.html#${d.id}`;
    actions.append(formula);
    head.append(actions);
    li.append(head);

    li.append(el("div", d.parcels
      ? `${d.parcels.toLocaleString()} properties pay · ${money.format(d.total)} total`
      : `Every property in city limits, about $${CITYWIDE_RATE} per EDU. No parcel list is published, so there is no map area.`, "meta"));

    if (d.layers.length > 1) {
      const zones = el("ul", null, "zones");
      for (const layer of d.layers) {
        const zli = el("li");
        const label = el("label");
        const box = el("input");
        box.type = "checkbox";
        box.checked = layerOn.has(layer.id);
        box.disabled = !districtOn.has(d.id);
        box.dataset.layer = layer.id;
        box.dataset.district = d.id;
        box.addEventListener("change", () => {
          if (box.checked) layerOn.add(layer.id); else layerOn.delete(layer.id);
          refreshOutlines();
        });
        label.append(box, swatch(layer.color, !PRIMARY_LAYERS.has(layer.id)), document.createTextNode(` ${layer.zone} (${layer.parcels})`));
        zli.append(label);
        zones.append(zli);
      }
      li.append(zones);
    }
    list.append(li);
  }
}

function renderLegend() {
  const legend = byId("legend");
  legend.replaceChildren();
  const add = (color, text, cls) => {
    const item = el("span", null, `legend-item ${cls || ""}`);
    item.append(swatch(color), document.createTextNode(text));
    legend.append(item);
  };
  add("#ffd34d", "Selected", "selected");
  for (const d of districtData?.districts || []) {
    if (districtOn.has(d.id)) add(d.color, d.short);
  }
  add("#8aa0ad", "Other property", "other");
}

// ---------- Assessments for one parcel ----------

function citywideEstimate(attributes) {
  if (attributes.BOUNDARYID !== "Concord") return { status: "outside" };
  const cls = eduClassForCode(attributes.USE_CODE);
  if (!cls) return { status: "unknown" };
  return { status: "ok", cls, amount: Math.round(cls.edu * CITYWIDE_RATE * 100) / 100 };
}

function lotSize(attributes) {
  const total = numberField(attributes.TOT_AREA);
  if (total > 0) return { value: total, field: "TOT_AREA" };
  const area = numberField(attributes["Shape.STArea()"]);
  return area > 0 ? { value: area, field: "Shape.STArea()" } : null;
}

function calculatorUrl(attributes, entries, section) {
  const p = new URLSearchParams();
  const code = attributes.USE_CODE;
  p.set("apn", apnDigits(attributes.APN));
  if (attributes.full_address_display) p.set("addr", cleanAddress(attributes.full_address_display));
  const tla = numberField(attributes.TLA);
  if (tla > 0) p.set("ph-s", Math.round(tla));
  const d3 = entries.find((e) => e.d === "district-3");
  p.set("d3-zone", d3 ? d3.z : "");
  if (isSingleFamilyCode(code)) p.set("d3-edu", 1);
  const homes = homeCount(code, attributes.UNITS);
  if (homes !== null) p.set("d3-u", homes);
  const lot = lotSize(attributes);
  if (lot) p.set("dt-P", Math.round(lot.value));
  const dt = entries.find((e) => e.d === "downtown");
  p.set("dt-IT", dt ? 1 : 0);
  p.set("dt-IP", dt?.z.includes("T") ? 1 : 0);
  p.set("dt-IC", dt?.z.includes("C") ? 1 : 0);
  p.set("dt-IS", dt?.z.includes("S") ? 1 : 0);
  p.set("dt-R", isResidentialCode(code) ? 1 : 0);
  if (homes) p.set("dt-U", homes);
  // Street frontage is not in the parcel data.
  for (const key of ["dt-FS", "dt-FC", "dt-FT"]) p.set(key, 0);
  if (code !== null && code !== undefined && code !== "") p.set("cw-code", String(code).trim());
  return `assessments.html?${p}${section ? `#${section}` : ""}`;
}

function entryDetail(entry) {
  if (entry.d === "district-3") return `${D3_ZONES[entry.z]} zone`;
  if (entry.d === "downtown") {
    const zones = ["Thoroughfare Median", ...[...entry.z].map((z) => DOWNTOWN_ZONES[z])];
    return `${DOWNTOWN_CLASSES[entry.c] || entry.c} · zones: ${zones.join(", ")}`;
  }
  return "Single-family home share";
}

function assessmentRow(color, title, detail, amount, tag, href, dashed = false) {
  const row = el("li", null, "assess-row");
  row.append(swatch(color, dashed));
  const text = el("div", null, "assess-text");
  text.append(el("strong", title), el("small", detail));
  const link = el("a", "See formula →", "formula-link");
  link.href = href;
  text.append(link);
  const value = el("div", null, "assess-amount");
  value.append(el("span", amount), el("small", tag));
  row.append(text, value);
  return row;
}

function addProperty(list, label, value, format) {
  const row = el("div", null, "property");
  row.append(el("dt", label));
  let formatted = value === null || value === undefined || value === "" ? "Not recorded" : String(value);
  if (format === "money" && typeof value === "number") formatted = wholeMoney.format(value);
  if (format === "sqft" && typeof value === "number") formatted = `${Math.round(value).toLocaleString()} sq ft`;
  row.append(el("dd", formatted));
  list.append(row);
}

function renderEmptyDetails() {
  const box = el("div", null, "empty-state");
  box.append(el("h2", "Pick a property"));
  box.append(el("p", "Search above, or zoom in and click a property. You will see which districts it is in, what it pays this year, and a link that fills in the calculator for you."));
  byId("details").replaceChildren(box);
}

function renderDetails(attributes, feature, stackedList = null) {
  const details = byId("details");
  details.replaceChildren();
  const entries = rollEntries(attributes.APN);

  const top = el("div", null, "detail-head");
  top.append(el("h2", `APN ${apnDisplay(apnDigits(attributes.APN))}`));
  const clear = el("button", "Clear", "small");
  clear.type = "button";
  clear.addEventListener("click", clearSelection);
  top.append(clear);
  details.append(top);
  details.append(el("p", cleanAddress(attributes.full_address_display) || "No street address recorded", "detail-address"));
  details.append(el("span", attributes.USE_DESC?.trim() || `Use code ${attributes.USE_CODE ?? "not recorded"}`, "badge"));

  const card = el("section", null, "assess-card");
  card.append(el("h3", "FY 2026-27 special assessments"));
  const list = el("ul", null, "assess-list");
  let total = 0;
  for (const entry of entries) {
    const d = districtById.get(entry.d);
    total += entry.a;
    list.append(assessmentRow(d.color, d.short, entryDetail(entry), money.format(entry.a), "official roll", calculatorUrl(attributes, entries, entry.d)));
  }
  const cw = citywideEstimate(attributes);
  const citywide = districtById.get("citywide");
  const cwUrl = calculatorUrl(attributes, entries, "citywide");
  if (cw.status === "ok") {
    total += cw.amount;
    list.append(assessmentRow(citywide.color, citywide.short, `${cw.cls.name} · ${cw.cls.edu} EDU × $${CITYWIDE_RATE}`, money.format(cw.amount), "estimate", cwUrl, true));
  } else if (cw.status === "unknown") {
    list.append(assessmentRow(citywide.color, citywide.short, "The use code is missing or not on the schedule.", "—", "unknown", cwUrl, true));
  } else {
    list.append(assessmentRow(citywide.color, citywide.short, "Outside city limits, so not charged.", money.format(0), "estimate", cwUrl, true));
  }
  card.append(list);
  if (!entries.length) card.append(el("p", "Not on the Pine Hollow, District No. 3 or Downtown rolls.", "note"));
  const sum = el("div", null, "assess-total");
  sum.append(el("span", "Total"), el("strong", money.format(total)));
  card.append(sum);
  if (cw.status !== "outside") card.append(el("p", "The Citywide amount is estimated from the land use code. Some codes are charged only on part of the property.", "note"));
  const open = el("a", "Open in the calculators", "button primary");
  open.href = calculatorUrl(attributes, entries, entries[0]?.d || "citywide");
  card.append(open);
  const quick = el("div", null, "quick");
  const quickText = el("div");
  quickText.append(el("small", cw.status === "ok" ? "Total this year (Citywide estimated)" : "Total this year"), el("strong", money.format(total)));
  const quickOpen = el("a", "Calculator", "button primary");
  quickOpen.href = open.href;
  quick.append(quickText, quickOpen);
  details.querySelector(".badge").before(quick);
  details.append(card);

  if (stackedList && stackedList.length > 1) {
    const box = el("section", null, "stacked-box");
    box.append(el("h3", `${stackedList.length} properties at this location`));
    box.append(el("p", "Units on different floors or common areas share this footprint. Click one to switch:", "stacked-hint"));
    const list = el("div", null, "stacked-list");
    for (const item of stackedList) {
      const p = item.feature.properties;
      const apn = apnDigits(p.APN);
      const isCur = apn === selectedApn;
      const btn = el("button", null, `stacked-item${isCur ? " active" : ""}`);
      btn.type = "button";
      if (isCur) btn.setAttribute("aria-current", "true");

      const addr = cleanAddress(p.full_address_display) || "No street address recorded";
      const useDesc = p.USE_DESC?.trim() || "";
      const isCommon = useDesc.toLowerCase().includes("common") || !addr.match(/\d/);

      const titleRow = el("div", null, "stacked-main");
      titleRow.append(el("strong", addr));
      for (const entry of rollEntries(p.APN)) {
        titleRow.append(swatch(districtById.get(entry.d).color));
      }

      const subRow = el("div", null, "stacked-sub");
      subRow.append(el("span", `APN ${apnDisplay(apn)}`));
      subRow.append(el("span", isCommon ? "Common area" : "Unit", "stacked-tag"));
      if (isCur) subRow.append(el("span", "Viewing", "stacked-active-tag"));

      btn.append(titleRow, subRow);
      btn.addEventListener("click", () => {
        selectParcel(item.feature, item.tileId, item.feature.properties?.OBJECTID, stackedList);
      });
      list.append(btn);
    }
    box.append(list);
    details.append(box);
  }

  const inputs = el("dl", null, "inputs");
  const code = attributes.USE_CODE;
  const cls = eduClassForCode(code);
  const lot = lotSize(attributes);
  const homes = homeCount(code, attributes.UNITS);
  addProperty(inputs, "Land use code", code === null || code === undefined ? null : `${code}${cls ? ` (${cls.name}, ${cls.edu} EDU)` : ""}`);
  addProperty(inputs, "Living area (TLA)", numberField(attributes.TLA), "sqft");
  addProperty(inputs, `Lot size (${lot?.field || "TOT_AREA"})`, lot?.value ?? null, "sqft");
  addProperty(inputs, "Homes", homes === null ? "5 or more (exact count not recorded)" : homes);
  addProperty(inputs, "Has homes", isResidentialCode(code) ? "Yes" : "No");
  addProperty(inputs, "Inside city limits", attributes.BOUNDARYID === "Concord" ? "Yes" : attributes.BOUNDARYID ? "No" : null);
  addProperty(inputs, "Street frontage", "Not in the data. Measure it on the map.");
  const inputsBox = el("details", null, "inputs-box");
  inputsBox.open = true;
  inputsBox.append(el("summary", "Formula inputs from this record"), inputs);
  details.append(inputsBox);

  const summary = el("dl");
  for (const [field, label, format] of [
    ["P_OWNER_NM", "Owner"], ["LAND_VALUE", "Land value", "money"],
    ["IMP_VAL", "Improvement value", "money"], ["ACREAGE", "Acres"],
    ["BLDG_SQFT", "Building sq. ft."], ["YR_BUILT", "Year built"],
    ["s_city", "Situs city"],
  ]) addProperty(summary, label, attributes[field], format);
  const summaryBox = el("details");
  summaryBox.append(el("summary", "Property summary"), summary);
  details.append(summaryBox);

  const all = el("details");
  all.append(el("summary", `All ${Object.keys(attributes).length} attributes`));
  const allList = el("dl");
  const aliases = new Map(manifest.fields.map((field) => [field.name, field.alias]));
  for (const [key, value] of Object.entries(attributes)) {
    const alias = aliases.get(key);
    addProperty(allList, alias && alias !== key ? `${alias} (${key})` : key, value);
  }
  all.append(allList);
  details.append(all);

  if (selectionDownload) URL.revokeObjectURL(selectionDownload);
  selectionDownload = URL.createObjectURL(new Blob([
    JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: feature?.geometry || null, properties: attributes }] }),
  ], { type: "application/geo+json" }));
  const link = el("a", "Download this parcel as GeoJSON", "download-link");
  link.href = selectionDownload;
  link.download = `parcel-${attributes.APN || attributes.OBJECTID}.geojson`;
  details.append(link);
}

function setHash(value) {
  history.replaceState(null, "", value ? `#${value}` : `${location.pathname}${location.search}`);
}

function clearSelection() {
  ++selectedToken;
  if (selectedLayer) map.removeLayer(selectedLayer);
  selectedLayer = null;
  selectedApn = null;
  lastClickLatLng = null;
  setHash("");
  renderEmptyDetails();
}

function keepSelectionVisible() {
  if (!selectedLayer) return;
  const bounds = selectedLayer.getBounds();
  if (!bounds.isValid()) return;
  const point = map.latLngToContainerPoint(bounds.getCenter());
  const visibleBottom = map.getSize().y - sheetPx;
  if (point.y > visibleBottom - 30 || point.y < 60) map.panBy([0, point.y - (visibleBottom + 50) / 2]);
}

async function selectParcel(feature, tile, id = feature?.properties?.OBJECTID, stackedList = null) {
  const token = ++selectedToken;
  if (selectedLayer) map.removeLayer(selectedLayer);
  selectedLayer = null;
  if (feature?.geometry) {
    selectedLayer = L.geoJSON(feature, { style: selectedStyle, renderer: selectionRenderer }).addTo(map);
  }
  byId("details").replaceChildren(el("p", "Loading parcel attributes..."));
  try {
    const records = await fetchJson(`data/attributes/${tile}.json`, attributeCache, tile);
    if (token !== selectedToken) return;
    const attributes = records[String(id)];
    if (!attributes) throw new Error(`Object ID ${id} is missing from the attribute file`);
    selectedApn = apnDigits(attributes.APN);
    if (selectedApn) setHash(`apn=${selectedApn}`);

    if (!stackedList && feature?.geometry) {
      const rep = representativePoint(feature.geometry);
      if (rep) {
        const found = findParcelsAtPoint(rep, tile);
        if (found.length > 1) stackedList = found;
      }
    }

    renderDetails(attributes, feature, stackedList);
    if (isMobile()) {
      if (sheetState === "collapsed") setSheet("half");
      byId("details").scrollIntoView({ behavior: "smooth", block: "start" });
      keepSelectionVisible();
    }
    for (const key of attributeCache.keys()) {
      if (key !== tile) attributeCache.delete(key);
    }
  } catch (error) {
    if (token === selectedToken) byId("details").replaceChildren(el("p", `Could not load parcel details: ${error.message}. Select the parcel again to retry.`, "error"));
  }
}

async function chooseResult(row) {
  const token = ++searchToken;
  status(byId("search-status"), "Opening parcel...");
  try {
    if (!row.bounds) {
      await selectParcel(null, row.tile, row.id);
      if (token === searchToken) status(byId("search-status"), "This record has no geometry; attributes are available.");
      return;
    }
    const data = await fetchJson(`data/tiles/${row.tile}.geojson`, tileCache, row.tile);
    if (token !== searchToken) return;
    prepareTileFeatures(data, row.tile);
    const feature = data.features.find((item) => item.properties.OBJECTID === row.id);
    if (!feature) throw new Error(`Object ID ${row.id} is missing from the geometry file`);
    if (isMobile()) {
      byId("search").blur();
      setSheet("half");
    }
    map.fitBounds(boundsToLeaflet(row.bounds), fitOptions(40, 18));
    await selectParcel(feature, row.tile);
    if (token === searchToken) status(byId("search-status"), `Selected ${apnDisplay(apnDigits(row.apn))}.`);
  } catch (error) {
    if (token === searchToken) status(byId("search-status"), `Could not open parcel: ${error.message}`, true);
  }
}

async function loadSearchRows() {
  if (!searchRows) searchRows = await fetchJson("data/search.json");
  return searchRows;
}

async function search(event) {
  event.preventDefault();
  const token = ++searchToken;
  const term = byId("search").value.trim().toLowerCase();
  byId("results").replaceChildren();
  if (term.length < 3) {
    status(byId("search-status"), "Enter at least 3 characters.");
    return;
  }
  status(byId("search-status"), "Searching parcel index...");
  try {
    const rows = await loadSearchRows();
    if (token !== searchToken) return;
    const normalized = term.replace(/[\s-]/g, "");
    const matches = rows.filter((row) => apnDigits(row.apn).includes(normalized)
      || row.address.toLowerCase().includes(term));
    matches.sort((a, b) => Number(apnDigits(b.apn) === normalized) - Number(apnDigits(a.apn) === normalized));
    status(byId("search-status"), `${matches.length.toLocaleString()} matches${matches.length > 50 ? "; showing first 50. Refine your search." : "."}`);
    for (const row of matches.slice(0, 50)) {
      const li = el("li");
      const button = el("button");
      button.type = "button";
      const title = el("strong", apnDisplay(apnDigits(row.apn)));
      for (const entry of rollEntries(row.apn)) title.append(swatch(districtById.get(entry.d).color));
      button.append(title, el("small", cleanAddress(row.address) || "No address recorded"));
      button.addEventListener("click", () => chooseResult(row));
      li.append(button);
      byId("results").append(li);
    }
  } catch (error) {
    if (token === searchToken) status(byId("search-status"), `Search unavailable: ${error.message}. Submit again to retry.`, true);
  }
}

async function applyHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const districtId = params.get("district");
  if (districtId && districtById.has(districtId) && districtById.get(districtId).layers.length) {
    zoomToDistrict(districtId);
  }
  const apn = apnDigits(params.get("apn"));
  if (apn && apn !== selectedApn) {
    status(byId("search-status"), `Finding APN ${apnDisplay(apn)}...`);
    try {
      const row = (await loadSearchRows()).find((r) => apnDigits(r.apn) === apn);
      if (row) await chooseResult(row);
      else status(byId("search-status"), `APN ${apnDisplay(apn)} is not in the parcel data.`, true);
    } catch (error) {
      status(byId("search-status"), `Could not look up APN: ${error.message}`, true);
    }
  }
}

map.on("moveend", updateView);
byId("search-form").addEventListener("submit", search);
byId("show-parcels").addEventListener("change", updateView);
byId("reset-view").addEventListener("click", () => map.setView(overview.center, overview.zoom));
window.addEventListener("hashchange", applyHash);

async function initialize() {
  setupSheet();
  renderEmptyDetails();
  try {
    [manifest, districtData] = await Promise.all([fetchJson("data/manifest.json"), fetchJson("data/districts.json")]);
    if (!Array.isArray(manifest.tiles) || !manifest.feature_count) throw new Error("Invalid dataset manifest");
    districtById = new Map(districtData.districts.map((d) => [d.id, d]));
    rollIndex = districtData.parcels;
    for (const d of districtData.districts) if (d.layers.length) districtOn.add(d.id);
    buildOutlines();
    renderDistrictList();
    refreshOutlines();
    status(byId("dataset-status"), `${manifest.feature_count.toLocaleString()} parcels / ${manifest.geometry_count.toLocaleString()} geometries`);
    byId("search").disabled = false;
    byId("search-button").disabled = false;
    await updateView();
    await applyHash();
  } catch (error) {
    status(byId("map-status"), `Dataset unavailable: ${error.message}. Build the site data and reload.`, true);
    status(byId("dataset-status"), "Dataset failed to load", true);
  }
}

initialize();
