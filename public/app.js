"use strict";

const byId = (id) => document.getElementById(id);
const overview = { center: [37.978, -122.031], zoom: 12 };
const baseStyle = { color: "#087f79", weight: 1, fillColor: "#42a697", fillOpacity: 0.09 };
const selectedStyle = { color: "#df8116", weight: 3, fillColor: "#f6b44e", fillOpacity: 0.28 };
const tileCache = new Map();
const attributeCache = new Map();
const visibleLayers = new Map();
let manifest;
let searchRows;
let selectedLayer;
let selectedToken = 0;
let viewToken = 0;
let searchToken = 0;
let selectionDownload;

function status(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}

async function fetchJson(path, cache, key) {
  if (cache?.has(key)) return cache.get(key);
  const pending = fetch(path).then(async (response) => {
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
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

function apnDisplay(value) {
  return /^\d{9}$/.test(value) ? value.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3") : value;
}

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

const map = L.map("map", { preferCanvas: true, zoomControl: true }).setView(overview.center, overview.zoom);
const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19, attribution: "Imagery &copy; Esri and contributors",
});
L.control.layers({ "Street map": streets, "Satellite": imagery }, null, { position: "topright" }).addTo(map);
L.control.scale({ imperial: true }).addTo(map);
map.createPane("selection");
map.getPane("selection").style.zIndex = "450";
const selectionRenderer = L.canvas({ pane: "selection" });
for (const basemap of [streets, imagery]) {
  basemap.on("tileerror", () => status(byId("map-status"), "Basemap tile unavailable. Check your internet connection; local parcel data still works.", true));
}

async function updateView() {
  if (!manifest) return;
  const token = ++viewToken;
  if (!byId("show-parcels").checked || map.getZoom() < manifest.minimum_zoom) {
    for (const layer of visibleLayers.values()) map.removeLayer(layer);
    visibleLayers.clear();
    status(byId("map-status"), byId("show-parcels").checked
      ? `Zoom to level ${manifest.minimum_zoom}+ to see parcels, or search an APN/address.`
      : "Parcel boundaries hidden. Selected parcel remains visible.");
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
        const layer = L.geoJSON(data, {
          style: baseStyle,
          onEachFeature: (feature, polygon) => {
            polygon.on("click", () => selectParcel(feature, tile.id));
            const tooltip = textElement("span", `${apnDisplay(feature.properties.APN || "")} | ${feature.properties.full_address_display || "No address"}`);
            polygon.bindTooltip(tooltip, { sticky: true });
          },
        }).addTo(map);
        visibleLayers.set(tile.id, layer);
      }
    }));
    if (token !== viewToken) return;
    const count = tiles.reduce((total, tile) => total + tile.count, 0);
    status(byId("map-status"), `${count.toLocaleString()} parcels in loaded chunks. Click a parcel for details.`);
    // Geometry outside the current viewport can be discarded and refetched later.
    for (const id of tileCache.keys()) {
      if (!wanted.has(id)) tileCache.delete(id);
    }
  } catch (error) {
    if (token === viewToken) status(byId("map-status"), `Could not load parcels: ${error.message}. Pan or zoom to retry.`, true);
  }
}

function addProperty(list, label, value, money = false) {
  const row = document.createElement("div");
  row.className = "property";
  row.append(textElement("dt", label));
  let formatted = value === null || value === undefined || value === "" ? "Not recorded" : String(value);
  if (money && typeof value === "number") {
    formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  }
  row.append(textElement("dd", formatted));
  list.append(row);
}

function renderDetails(attributes, feature) {
  const details = byId("details");
  details.replaceChildren();
  details.append(textElement("h2", `APN ${apnDisplay(attributes.APN || "")}`));
  details.append(textElement("p", attributes.full_address_display || "No situs address recorded", "detail-address"));
  details.append(textElement("span", attributes.USE_DESC?.trim() || "Unclassified use", "badge"));
  const summary = document.createElement("dl");
  for (const [field, label, money] of [
    ["P_OWNER_NM", "Owner"], ["LAND_VALUE", "Land value", true],
    ["IMP_VAL", "Improvement value", true], ["ACREAGE", "Acres"],
    ["BLDG_SQFT", "Building sq. ft."], ["YR_BUILT", "Year built"],
    ["s_city", "Situs city"], ["BOUNDARYID", "Boundary"],
  ]) addProperty(summary, label, attributes[field], money);
  details.append(summary);
  const all = document.createElement("details");
  all.append(textElement("summary", `All ${Object.keys(attributes).length} attributes`));
  const list = document.createElement("dl");
  const aliases = new Map(manifest.fields.map((field) => [field.name, field.alias]));
  for (const [key, value] of Object.entries(attributes)) {
    const alias = aliases.get(key);
    addProperty(list, alias && alias !== key ? `${alias} (${key})` : key, value);
  }
  all.append(list);
  details.append(all);
  if (selectionDownload) URL.revokeObjectURL(selectionDownload);
  selectionDownload = URL.createObjectURL(new Blob([
    JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: feature?.geometry || null, properties: attributes }] }),
  ], { type: "application/geo+json" }));
  const link = textElement("a", "Download this parcel as GeoJSON", "download-link");
  link.href = selectionDownload;
  link.download = `parcel-${attributes.APN || attributes.OBJECTID}.geojson`;
  details.append(link);
}

async function selectParcel(feature, tile, id = feature?.properties.OBJECTID) {
  const token = ++selectedToken;
  if (selectedLayer) map.removeLayer(selectedLayer);
  selectedLayer = null;
  if (feature?.geometry) {
    selectedLayer = L.geoJSON(feature, { style: selectedStyle, renderer: selectionRenderer }).addTo(map);
  }
  byId("details").replaceChildren(textElement("p", "Loading parcel attributes..."));
  try {
    const records = await fetchJson(`data/attributes/${tile}.json`, attributeCache, tile);
    if (token !== selectedToken) return;
    const attributes = records[String(id)];
    if (!attributes) throw new Error(`Object ID ${id} is missing from the attribute file`);
    renderDetails(attributes, feature);
    for (const key of attributeCache.keys()) {
      if (key !== tile) attributeCache.delete(key);
    }
  } catch (error) {
    if (token === selectedToken) byId("details").replaceChildren(textElement("p", `Could not load parcel details: ${error.message}. Select the parcel again to retry.`, "error"));
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
    const feature = data.features.find((item) => item.properties.OBJECTID === row.id);
    if (!feature) throw new Error(`Object ID ${row.id} is missing from the geometry file`);
    map.fitBounds(boundsToLeaflet(row.bounds), { padding: [40, 40], maxZoom: 18 });
    await selectParcel(feature, row.tile);
    if (token === searchToken) status(byId("search-status"), `Selected ${apnDisplay(row.apn)}.`);
  } catch (error) {
    if (token === searchToken) status(byId("search-status"), `Could not open parcel: ${error.message}`, true);
  }
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
    if (!searchRows) searchRows = await fetchJson("data/search.json");
    if (token !== searchToken) return;
    const normalized = term.replace(/[\s-]/g, "");
    const matches = searchRows.filter((row) => row.apn.toLowerCase().replace(/[\s-]/g, "").includes(normalized)
      || row.address.toLowerCase().includes(term));
    matches.sort((a, b) => Number(b.apn.replace(/-/g, "") === normalized) - Number(a.apn.replace(/-/g, "") === normalized));
    status(byId("search-status"), `${matches.length.toLocaleString()} matches${matches.length > 50 ? "; showing first 50. Refine your search." : "."}`);
    for (const row of matches.slice(0, 50)) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.append(textElement("strong", apnDisplay(row.apn)), textElement("small", row.address || "No address recorded"));
      button.addEventListener("click", () => chooseResult(row));
      li.append(button);
      byId("results").append(li);
    }
  } catch (error) {
    if (token === searchToken) status(byId("search-status"), `Search unavailable: ${error.message}. Submit again to retry.`, true);
  }
}

map.on("moveend", updateView);
byId("search-form").addEventListener("submit", search);
byId("show-parcels").addEventListener("change", updateView);
byId("reset-view").addEventListener("click", () => map.setView(overview.center, overview.zoom));

async function initialize() {
  try {
    manifest = await fetchJson("data/manifest.json");
    if (!Array.isArray(manifest.tiles) || !manifest.feature_count) throw new Error("Invalid dataset manifest");
    status(byId("dataset-status"), `${manifest.feature_count.toLocaleString()} parcels / ${manifest.geometry_count.toLocaleString()} geometries`);
    byId("search").disabled = false;
    byId("search-button").disabled = false;
    await updateView();
  } catch (error) {
    status(byId("map-status"), `Dataset unavailable: ${error.message}. Build the site data and reload.`, true);
    status(byId("dataset-status"), "Dataset failed to load", true);
  }
}

initialize();
