/**
 * Vinted Chine Assist — constantes, stockage, utilitaires (MV3, sans bundler).
 * Chargé en premier par le service worker, le content script, options et popup.
 */
(function (root) {
  "use strict";

  const VCA = (root.VCA = root.VCA || {});

  VCA.VERSION = "1.1.0";

  VCA.KEYS = {
    settings: "vca_settings",
    templates: "vca_templates",
    crm: "vca_crm",
    repost: "vca_repost_queue",
    orders: "vca_orders",
    packing: "vca_packing",
    itemTemplates: "vca_item_templates",
    profiles: "vca_profiles",
    activeProfile: "vca_active_profile",
    schedule: "vca_schedule",
    postsale: "vca_postsale",
    notifyUrls: "vca_notify_urls"
  };

  VCA.MSG_CATEGORIES = [
    { id: "favoris", label: "Favoris" },
    { id: "nego", label: "Négo" },
    { id: "postVente", label: "Post-vente" },
    { id: "relance", label: "Relance" }
  ];

  VCA.DEFAULT_TEMPLATES = {
    favoris: [
      {
        id: "fav-urgence",
        label: "Favori — urgence",
        text: "Bonjour {{nom}} ! 👋 Je vois que vous aimez {{article}}. Il y a déjà plusieurs personnes intéressées — si vous le souhaitez, je peux vous le réserver rapidement. Dites-moi !"
      },
      {
        id: "fav-offre",
        label: "Favori — petite offre",
        text: "Bonjour {{nom}} ! Merci pour le ❤️ sur {{article}}. Je peux vous faire une petite réduction si vous achetez rapidement — le prix actuel est {{prix}} €. Faites-moi une offre 🙂"
      },
      {
        id: "fav-bundle",
        label: "Favori — lot",
        text: "Bonjour {{nom}} ! Vous avez mis plusieurs de mes articles en favoris. Je peux vous préparer un lot avec une réduction + frais groupés. Intéressé(e) ?"
      },
      {
        id: "fav-dispo",
        label: "Toujours dispo",
        text: "Oui, {{article}} est toujours disponible ! 🙂"
      },
      {
        id: "fav-mesure",
        label: "Mesures",
        text: "Bien sûr, je peux vous envoyer les mesures précises de {{article}}. Que souhaitez-vous exactement (longueur, largeur, etc.) ?"
      },
      {
        id: "fav-etat",
        label: "État / défauts",
        text: "{{article}} est en bon état, comme sur les photos. Si un détail vous inquiète, dites-moi et je regarde de plus près !"
      },
      {
        id: "fav-envoi",
        label: "Envoi rapide",
        text: "Dès l'achat validé, j'expédie sous 24–48 h avec suivi. Merci pour votre confiance !"
      }
    ],
    nego: [
      {
        id: "nego-contre",
        label: "Contre-offre polie",
        text: "Merci pour votre offre de {{offre}} € sur {{article}} ! Je ne peux pas descendre autant, mais je peux vous proposer {{contre}} € — ça vous irait ?"
      },
      {
        id: "nego-accepte",
        label: "Accepter offre",
        text: "Parfait {{nom}}, j'accepte votre offre de {{offre}} € pour {{article}} ! Vous pouvez finaliser l'achat quand vous voulez. Merci 🙂"
      },
      {
        id: "nego-refuse-plancher",
        label: "Refus sous plancher",
        text: "Merci pour votre offre de {{offre}} €. Pour {{article}} je ne peux malheureusement pas descendre en dessous de {{plancher}} €. Dites-moi si un autre montant vous convient !"
      }
    ],
    postVente: [
      {
        id: "sav-merci",
        label: "Remerciement",
        text: "Merci pour votre achat de {{article}} {{nom}} ! Je prépare le colis avec soin. N'hésitez pas si vous avez une question 📦"
      },
      {
        id: "sav-avis",
        label: "Demande d'avis",
        text: "Bonjour {{nom}}, j'espère que {{article}} vous plaît ! Si c'est le cas, un petit avis ⭐ sur Vinted me ferait très plaisir. Merci encore !"
      },
      {
        id: "sav-suivi",
        label: "Colis expédié",
        text: "Votre colis pour {{article}} est en route. Vous recevrez le suivi via Vinted. Belle journée !"
      }
    ],
    relance: [
      {
        id: "rel-favori",
        label: "Relance favori",
        text: "Bonjour {{nom}}, {{article}} est toujours dispo ({{prix}} €). Je peux le réserver un court moment si vous le souhaitez !"
      },
      {
        id: "rel-offre",
        label: "Relance offre en cours",
        text: "Bonjour {{nom}}, je reviens vers vous au sujet de {{article}}. Mon offre à {{contre}} € est encore valable un petit moment 🙂"
      },
      {
        id: "rel-panier",
        label: "Relance douce",
        text: "Hello {{nom}} ! Juste un petit message : {{article}} n'a pas encore été réservé. Dites-moi si vous avez une question."
      }
    ]
  };

  VCA.DEFAULT_ITEM_TEMPLATES = [
    {
      id: "it-vetement",
      name: "Vêtement standard",
      title: "{{marque}} {{modele}} {{taille}} — {{etat}}",
      description: "{{marque}} {{modele}}\nTaille : {{taille}}\nÉtat : {{etat}}\n\n{{details}}\n\nEnvoi soigné sous 24–48 h, non-fumeur.",
      priceFormula: "achat + marge"
    },
    {
      id: "it-lot",
      name: "Lot / bundle",
      title: "Lot {{marque}} ×{{qte}} — {{taille}}",
      description: "Lot de {{qte}} articles {{marque}}.\nTaille : {{taille}}\nÉtat : {{etat}}\n\n{{details}}\n\nPrix lot avantageux, frais groupés.",
      priceFormula: "(achat + marge) * 0.9"
    },
    {
      id: "it-neuf",
      name: "Neuf avec étiquette",
      title: "{{marque}} {{modele}} {{taille}} — neuf avec étiquette",
      description: "Article neuf avec étiquette.\nMarque : {{marque}}\nTaille : {{taille}}\n\n{{details}}\n\nVendu comme neuf, envoi suivi.",
      priceFormula: "achat * 1.35 + marge"
    }
  ];

  VCA.DEFAULT_PACKING = [
    { id: "pk-verif", label: "Vérifier l'article (état, accessoires, étiquette)", done: false },
    { id: "pk-nettoyer", label: "Nettoyer / plier / caler", done: false },
    { id: "pk-bordereau", label: "Imprimer le bordereau / l'étiquette Vinted", done: false },
    { id: "pk-bon", label: "Joindre le bon de livraison (CRM)", done: false },
    { id: "pk-colis", label: "Colis adapté, fermé, étiquette lisible", done: false },
    { id: "pk-depot", label: "Déposer en point relais / boîte aux lettres", done: false }
  ];

  VCA.DEFAULT_SETTINGS = {
    bubbleEnabled: true,
    costPrice: 0,
    minMarginEur: 5,
    floorPrice: 0,
    maxDropPercent: 15,
    counterStepPercent: 8,
    autoReplyEnabled: false,
    negotiationFloorPercent: 15,
    suggestCounterPercent: 8,
    openaiApiKey: "",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiModel: "gpt-4o-mini",
    feePercent: 0,
    feeFixed: 0,
    defaultShippingCost: 0,
    repostIntervalMinutes: 60,
    repostAutoOpen: false,
    postSaleThankYouHours: 1,
    postSaleReviewHours: 48,
    activeProfileId: "default"
  };

  VCA.DEFAULT_PROFILE = {
    id: "default",
    name: "Compte principal",
    notes: "Profil local (les cookies Vinted restent ceux de Chrome)."
  };

  VCA.clone = function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  };

  VCA.uid = function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  };

  VCA.esc = function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  VCA.parseMoney = function parseMoney(str) {
    if (str == null || str === "") return null;
    const cleaned = String(str)
      .replace(/\s/g, "")
      .replace(/€/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  VCA.formatEuro = function formatEuro(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return (Math.round(Number(n) * 100) / 100).toFixed(2).replace(".", ",");
  };

  VCA.roundEuro = function roundEuro(n) {
    return Math.round(Number(n) * 100) / 100;
  };

  VCA.todayISODate = function todayISODate() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  };

  VCA.migrateTemplates = function migrateTemplates(raw) {
    const base = VCA.clone(VCA.DEFAULT_TEMPLATES);
    if (!raw || typeof raw !== "object") return base;
    const out = {
      favoris: Array.isArray(raw.favoris) ? raw.favoris : base.favoris,
      nego: Array.isArray(raw.nego) ? raw.nego : base.nego,
      postVente: Array.isArray(raw.postVente) ? raw.postVente : base.postVente,
      relance: Array.isArray(raw.relance) ? raw.relance : base.relance
    };
    if ((!raw.nego || !raw.nego.length) && Array.isArray(raw.reponsesRapides)) {
      const mapped = raw.reponsesRapides.map((t) => ({
        id: t.id || VCA.uid("nego"),
        label: t.label || "Réponse",
        text: t.text || ""
      }));
      const negoish = mapped.filter((t) => /contre|accepte|offre|nego/i.test(`${t.id} ${t.label}`));
      const rest = mapped.filter((t) => !negoish.includes(t));
      if (negoish.length) out.nego = negoish;
      if (rest.length && out.favoris === base.favoris) {
        out.favoris = (out.favoris || []).concat(rest);
      } else if (rest.length) {
        out.favoris = (Array.isArray(raw.favoris) ? raw.favoris : []).concat(rest);
      }
    }
    return out;
  };

  VCA.migrateSettings = function migrateSettings(raw) {
    const s = { ...VCA.DEFAULT_SETTINGS, ...(raw || {}) };
    if (raw && raw.maxDropPercent == null && raw.negotiationFloorPercent != null) {
      s.maxDropPercent = raw.negotiationFloorPercent;
    }
    if (raw && raw.counterStepPercent == null && raw.suggestCounterPercent != null) {
      s.counterStepPercent = raw.suggestCounterPercent;
    }
    s.negotiationFloorPercent = s.maxDropPercent;
    s.suggestCounterPercent = s.counterStepPercent;
    return s;
  };

  /**
   * Interpolate {{prix}} {{nom}} {{article}} {{contre}} {{offre}} {{plancher}} etc.
   */
  VCA.applyVars = function applyVars(text, vars) {
    let out = String(text || "");
    const map = vars || {};
    out = out.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const v = map[key];
      if (v == null || v === "") return "";
      return String(v);
    });
    return out;
  };

  VCA.evalPriceFormula = function evalPriceFormula(formula, vars) {
    const v = vars || {};
    const achat = Number(v.achat) || 0;
    const marge = Number(v.marge) || 0;
    let s = String(formula || "achat + marge").trim();
    s = VCA.applyVars(s, {
      achat,
      marge,
      qte: Number(v.qte) || 1
    });
    s = s.replace(/achat/gi, String(achat));
    s = s.replace(/marge/gi, String(marge));
    s = s.replace(/qte/gi, String(Number(v.qte) || 1));
    s = s.replace(/,/g, ".");
    if (!/^[\d\s+\-*/().]+$/.test(s)) {
      throw new Error("Formule invalide (chiffres et + - * / uniquement)");
    }
    const n = Function(`"use strict"; return (${s});`)();
    if (!Number.isFinite(n) || n < 0 || n > 1e7) {
      throw new Error("Résultat de formule invalide");
    }
    return VCA.roundEuro(n);
  };

  VCA.netMargin = function netMargin(item, settings) {
    const sale = Number(item.salePrice) || 0;
    const buy = Number(item.purchasePrice) || 0;
    let fees = Number(item.fees);
    if (!Number.isFinite(fees)) {
      const pct = Number(settings?.feePercent) || 0;
      const fix = Number(settings?.feeFixed) || 0;
      fees = VCA.roundEuro(sale * (pct / 100) + fix);
    }
    const ship = Number(item.shippingCost) || 0;
    return VCA.roundEuro(sale - buy - fees - ship);
  };

  VCA.estimateFees = function estimateFees(salePrice, settings) {
    const sale = Number(salePrice) || 0;
    const pct = Number(settings?.feePercent) || 0;
    const fix = Number(settings?.feeFixed) || 0;
    return VCA.roundEuro(sale * (pct / 100) + fix);
  };

  VCA.crmStats = function crmStats(items, settings) {
    const list = Array.isArray(items) ? items : [];
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let caMonth = 0;
    let profit = 0;
    let soldCount = 0;
    let stock = 0;
    list.forEach((it) => {
      if (it.status === "sold") {
        soldCount += 1;
        const d = it.soldAt ? new Date(it.soldAt) : null;
        const inMonth = d && d.getFullYear() === y && d.getMonth() === m;
        const sale = Number(it.salePrice) || 0;
        const margin = VCA.netMargin(it, settings);
        profit += margin;
        if (inMonth) caMonth += sale;
      } else {
        stock += 1;
      }
    });
    return {
      caMonth: VCA.roundEuro(caMonth),
      profit: VCA.roundEuro(profit),
      soldCount,
      stock
    };
  };

  VCA.toCsv = function toCsv(items) {
    const headers = [
      "id",
      "title",
      "listingUrl",
      "purchasePrice",
      "salePrice",
      "fees",
      "shippingCost",
      "status",
      "soldAt",
      "notes"
    ];
    const escCell = (v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(",")];
    (items || []).forEach((it) => {
      lines.push(headers.map((h) => escCell(it[h])).join(","));
    });
    return lines.join("\n") + "\n";
  };

  VCA.parseCsv = function parseCsv(text) {
    const rows = [];
    let i = 0;
    const src = String(text || "").replace(/^\uFEFF/, "");
    const len = src.length;
    function readRow() {
      const cells = [];
      if (i >= len) return null;
      while (i < len) {
        if (src[i] === '"') {
          i += 1;
          let cell = "";
          while (i < len) {
            if (src[i] === '"' && src[i + 1] === '"') {
              cell += '"';
              i += 2;
              continue;
            }
            if (src[i] === '"') {
              i += 1;
              break;
            }
            cell += src[i];
            i += 1;
          }
          cells.push(cell);
        } else {
          let cell = "";
          while (i < len && src[i] !== "," && src[i] !== "\n" && src[i] !== "\r") {
            cell += src[i];
            i += 1;
          }
          cells.push(cell);
        }
        if (src[i] === ",") {
          i += 1;
          continue;
        }
        if (src[i] === "\r") i += 1;
        if (src[i] === "\n") i += 1;
        break;
      }
      return cells;
    }
    const header = readRow();
    if (!header) return [];
    const idx = {};
    header.forEach((h, n) => {
      idx[String(h).trim()] = n;
    });
    let row;
    while ((row = readRow())) {
      if (row.length === 1 && !row[0]) continue;
      const get = (k) => {
        const n = idx[k];
        return n == null ? "" : (row[n] || "").trim();
      };
      const purchasePrice = VCA.parseMoney(get("purchasePrice")) ?? 0;
      const salePrice = VCA.parseMoney(get("salePrice"));
      const fees = VCA.parseMoney(get("fees"));
      const shippingCost = VCA.parseMoney(get("shippingCost")) ?? 0;
      rows.push({
        id: get("id") || VCA.uid("crm"),
        title: get("title") || "Sans titre",
        listingUrl: get("listingUrl"),
        purchasePrice,
        salePrice: salePrice == null ? "" : salePrice,
        fees: fees == null ? "" : fees,
        shippingCost,
        status: get("status") === "sold" ? "sold" : "stock",
        soldAt: get("soldAt") || "",
        notes: get("notes") || ""
      });
    }
    return rows;
  };

  VCA.storageGet = function storageGet(keys) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    });
  };

  VCA.storageSet = function storageSet(obj) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.set(obj, () => resolve());
    });
  };

  VCA.loadAll = async function loadAll() {
    const keys = Object.values(VCA.KEYS);
    const data = await VCA.storageGet(keys);
    const settings = VCA.migrateSettings(data[VCA.KEYS.settings]);
    const templates = VCA.migrateTemplates(data[VCA.KEYS.templates]);
    const crm = Array.isArray(data[VCA.KEYS.crm]) ? data[VCA.KEYS.crm] : [];
    const repost = Array.isArray(data[VCA.KEYS.repost]) ? data[VCA.KEYS.repost] : [];
    const orders = Array.isArray(data[VCA.KEYS.orders]) ? data[VCA.KEYS.orders] : [];
    const packing = Array.isArray(data[VCA.KEYS.packing]) && data[VCA.KEYS.packing].length
      ? data[VCA.KEYS.packing]
      : VCA.clone(VCA.DEFAULT_PACKING);
    const itemTemplates = Array.isArray(data[VCA.KEYS.itemTemplates]) && data[VCA.KEYS.itemTemplates].length
      ? data[VCA.KEYS.itemTemplates]
      : VCA.clone(VCA.DEFAULT_ITEM_TEMPLATES);
    let profiles = Array.isArray(data[VCA.KEYS.profiles]) && data[VCA.KEYS.profiles].length
      ? data[VCA.KEYS.profiles]
      : [VCA.clone(VCA.DEFAULT_PROFILE)];
    const activeProfileId = data[VCA.KEYS.activeProfile] || settings.activeProfileId || profiles[0].id;
    const schedule = Array.isArray(data[VCA.KEYS.schedule]) ? data[VCA.KEYS.schedule] : [];
    const postsale = Array.isArray(data[VCA.KEYS.postsale]) ? data[VCA.KEYS.postsale] : [];
    return {
      settings,
      templates,
      crm,
      repost,
      orders,
      packing,
      itemTemplates,
      profiles,
      activeProfileId,
      schedule,
      postsale
    };
  };

  VCA.ensureInstalledDefaults = async function ensureInstalledDefaults() {
    const data = await VCA.storageGet([
      VCA.KEYS.settings,
      VCA.KEYS.templates,
      VCA.KEYS.profiles,
      VCA.KEYS.packing,
      VCA.KEYS.itemTemplates
    ]);
    const patch = {};
    if (!data[VCA.KEYS.settings]) patch[VCA.KEYS.settings] = VCA.clone(VCA.DEFAULT_SETTINGS);
    else patch[VCA.KEYS.settings] = VCA.migrateSettings(data[VCA.KEYS.settings]);
    if (!data[VCA.KEYS.templates]) patch[VCA.KEYS.templates] = VCA.clone(VCA.DEFAULT_TEMPLATES);
    else patch[VCA.KEYS.templates] = VCA.migrateTemplates(data[VCA.KEYS.templates]);
    if (!data[VCA.KEYS.profiles]) patch[VCA.KEYS.profiles] = [VCA.clone(VCA.DEFAULT_PROFILE)];
    if (!data[VCA.KEYS.packing]) patch[VCA.KEYS.packing] = VCA.clone(VCA.DEFAULT_PACKING);
    if (!data[VCA.KEYS.itemTemplates]) patch[VCA.KEYS.itemTemplates] = VCA.clone(VCA.DEFAULT_ITEM_TEMPLATES);
    await VCA.storageSet(patch);
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
