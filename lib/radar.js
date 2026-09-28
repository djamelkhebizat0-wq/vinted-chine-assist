/**
 * Radar bonnes affaires — scoring, requêtes, dédoublonnage (local, pas d’API officielle).
 */
(function (root) {
  "use strict";

  const VCA = (root.VCA = root.VCA || {});

  VCA.DEFAULT_RADAR_QUERIES = [
    { id: "lveb", query: "LVEB", brand: "LVEB", buyMax: 22, resale: 40, minMargin: 10, category: "parfum", enabled: true },
    { id: "libre", query: "YSL Libre", brand: "Libre", buyMax: 42, resale: 72, minMargin: 10, category: "parfum", enabled: true },
    { id: "black-opium", query: "Black Opium", brand: "Black Opium", buyMax: 40, resale: 68, minMargin: 10, category: "parfum", enabled: true },
    { id: "sauvage", query: "Dior Sauvage", brand: "Sauvage", buyMax: 48, resale: 82, minMargin: 10, category: "parfum", enabled: true },
    { id: "one-million", query: "1 Million", brand: "1 Million", buyMax: 32, resale: 55, minMargin: 10, category: "parfum", enabled: true },
    { id: "khamrah", query: "Khamrah", brand: "Khamrah", buyMax: 24, resale: 42, minMargin: 10, category: "parfum", enabled: true },
    { id: "hawas", query: "Hawas", brand: "Hawas", buyMax: 26, resale: 45, minMargin: 10, category: "parfum", enabled: true },
    { id: "asad", query: "Asad Lattafa", brand: "Asad", buyMax: 20, resale: 38, minMargin: 10, category: "parfum", enabled: true },
    { id: "nike", query: "Nike", brand: "Nike", buyMax: 25, resale: 45, minMargin: 10, category: "vetement", enabled: true },
    { id: "adidas", query: "Adidas", brand: "Adidas", buyMax: 22, resale: 40, minMargin: 10, category: "vetement", enabled: true },
    { id: "lacoste", query: "Lacoste", brand: "Lacoste", buyMax: 24, resale: 42, minMargin: 10, category: "vetement", enabled: true },
    { id: "levis", query: "Levi's", brand: "Levi's", buyMax: 20, resale: 38, minMargin: 10, category: "vetement", enabled: true }
  ];

  const ALIASES = {
    lveb: ["lveb"],
    libre: ["libre", "ysl libre", "saint laurent libre"],
    "black-opium": ["black opium", "blackopium"],
    sauvage: ["sauvage", "dior sauvage"],
    "one-million": ["1 million", "one million", "1million", "million paco"],
    khamrah: ["khamrah", "khamra"],
    hawas: ["hawas"],
    asad: ["asad", "lattafa asad"],
    nike: ["nike"],
    adidas: ["adidas"],
    lacoste: ["lacoste"],
    levis: ["levis", "levi's", "levi s"]
  };

  VCA.radarFold = function radarFold(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  VCA.migrateRadarQueries = function migrateRadarQueries(raw) {
    if (!Array.isArray(raw) || !raw.length) return VCA.clone(VCA.DEFAULT_RADAR_QUERIES);
    return raw.map((q) => ({
      id: q.id || VCA.uid("rq"),
      query: q.query || q.brand || "",
      brand: q.brand || q.query || "",
      buyMax: Number(q.buyMax) || 0,
      resale: Number(q.resale) || 0,
      minMargin: Number(q.minMargin) || 10,
      category: q.category === "vetement" ? "vetement" : "parfum",
      enabled: q.enabled !== false
    })).filter((q) => q.query);
  };

  VCA.radarSearchUrl = function radarSearchUrl(query, origin) {
    const o = (origin || "https://www.vinted.fr").replace(/\/$/, "");
    return `${o}/catalog?search_text=${encodeURIComponent(query || "")}&order=newest_first`;
  };

  VCA.matchRadarQuery = function matchRadarQuery(title, queries) {
    const hay = VCA.radarFold(`${title || ""}`);
    if (!hay) return null;
    const list = (queries || []).filter((q) => q && q.enabled !== false);
    for (const q of list) {
      const aliases = ALIASES[q.id] || [];
      const tokens = [q.brand, q.query].concat(aliases).filter(Boolean).map(VCA.radarFold);
      if (tokens.some((t) => t.length >= 2 && hay.includes(t))) return q;
    }
    return null;
  };

  VCA.collectRadarFlags = function collectRadarFlags(listing, query) {
    const blob = VCA.radarFold(`${listing?.title || ""} ${listing?.raw || ""} ${listing?.photoHint || ""}`);
    const flags = [];
    const price = Number(listing?.price);
    const resale = Number(query?.resale) || 0;
    if (/\btesters?\b|testeur|echantillon|sample|decant|recharge/.test(blob)) {
      flags.push({ id: "tester", hard: true, label: "Tester / échantillon" });
    }
    if (/pas a vendre|not for sale|echange uniquement|\bdon\b/.test(blob)) {
      flags.push({ id: "nfs", hard: true, label: "Pas à vendre" });
    }
    if (/boite vide|flacon vide|empty bottle|sans jus/.test(blob)) {
      flags.push({ id: "empty", hard: true, label: "Vide / sans produit" });
    }
    if (/floue?|blurry|sans photo|photo manquante/.test(blob)) {
      flags.push({ id: "fuzzy", hard: false, label: "Photo douteuse" });
    }
    if (listing?.sellerNew || /0 avis|aucun avis|nouveau vendeur|no reviews/.test(blob)) {
      flags.push({ id: "new-seller", hard: false, label: "Vendeur tout nouveau" });
    }
    if (Number.isFinite(price) && resale > 0) {
      const perfume = (query?.category || "parfum") !== "vetement";
      const tooCheap = perfume
        ? price < 12 && price < resale * 0.25
        : price < 8 && price < resale * 0.22;
      if (tooCheap) {
        flags.push({ id: "too-cheap", hard: true, label: "Prix trop bas vs marque (risque)" });
      }
    }
    return flags;
  };

  VCA.scoreRadarDeal = function scoreRadarDeal(listing, queries, settings) {
    const price = Number(listing?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, error: "no-price" };
    }
    const query = listing?.queryId
      ? (queries || []).find((q) => q.id === listing.queryId)
      : VCA.matchRadarQuery(listing?.title || listing?.raw, queries);
    if (!query) return { ok: false, skipped: "no-match" };
    if (query.buyMax > 0 && price > query.buyMax + 0.001) {
      return { ok: false, skipped: "over-budget", queryId: query.id, brand: query.brand, price };
    }
    const fees = typeof VCA.estimateFees === "function"
      ? VCA.estimateFees(price, settings)
      : 0;
    const resale = Number(query.resale) || 0;
    const net = VCA.roundEuro(resale - price - (Number(fees) || 0));
    const minM = Math.max(0, Number(query.minMargin) || Number(settings?.radarMinMarginEur) || 10);
    const flags = VCA.collectRadarFlags(listing, query);
    const hard = flags.some((f) => f.hard);
    const mild = flags.filter((f) => !f.hard).length;
    let score = "C";
    if (!hard && mild === 0 && net >= Math.max(minM, 12) && net >= minM * 1.5) {
      score = "A";
    } else if (!hard && net >= minM) {
      score = "B";
    } else {
      score = "C";
    }
    return {
      ok: true,
      score,
      net,
      resale,
      minMargin: minM,
      flags,
      queryId: query.id,
      brand: query.brand,
      price,
      title: listing.title || "",
      url: listing.url || "",
      id: String(listing.id || "")
    };
  };

  VCA.radarShouldAlert = function radarShouldAlert(seen, listing, scored) {
    if (!scored || scored.score !== "A") return false;
    const id = String(listing?.id || scored.id || "");
    if (!id) return false;
    const prev = seen && seen[id];
    if (!prev) return true;
    const drop = (Number(prev.price) || 0) - (Number(listing?.price ?? scored.price) || 0);
    return drop >= 5;
  };

  VCA.radarMarkSeen = function radarMarkSeen(seen, listing, scored, alerted) {
    const map = seen && typeof seen === "object" ? seen : {};
    const id = String(listing?.id || scored?.id || "");
    if (!id) return map;
    map[id] = {
      price: Number(listing?.price ?? scored?.price) || 0,
      ts: Date.now(),
      score: scored?.score || "",
      lastAlerted: alerted ? Date.now() : (map[id]?.lastAlerted || 0)
    };
    const keys = Object.keys(map);
    if (keys.length > 400) {
      keys.slice(0, keys.length - 400).forEach((k) => delete map[k]);
    }
    return map;
  };

  VCA.radarMergeInbox = function radarMergeInbox(inbox, deals) {
    const list = Array.isArray(inbox) ? inbox.slice() : [];
    (deals || []).forEach((d) => {
      if (!d || !d.id) return;
      const i = list.findIndex((x) => x.id === d.id);
      const row = {
        id: d.id,
        title: d.title || "",
        url: d.url || "",
        price: d.price,
        net: d.net,
        score: d.score,
        brand: d.brand || "",
        flags: (d.flags || []).map((f) => f.label || f.id),
        ts: d.ts || new Date().toISOString()
      };
      if (i >= 0) list[i] = { ...list[i], ...row };
      else list.unshift(row);
    });
    return list.slice(0, 50);
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
