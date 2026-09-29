/**
 * Chat Radar local (1.5) — français parlé, sans LLM ni réseau.
 * Explique pile / scores / skips et mute les requêtes (achat max, revente, marge).
 */
(function (root) {
  "use strict";

  const VCA = (root.VCA = root.VCA || {});
  const CAP = 40;
  VCA.RADAR_CHAT_CAP = CAP;

  const NICKS = {
    lveb: ["lveb", "la vie est belle", "vie est belle"],
    libre: ["libre", "ysl libre", "ysl", "saint laurent libre"],
    "black-opium": ["black opium", "blackopium", "opium"],
    sauvage: ["sauvage", "dior sauvage"],
    "one-million": ["1 million", "one million", "1million", "million paco", "million"],
    khamrah: ["khamrah", "khamra"],
    hawas: ["hawas", "rasasi hawas"],
    asad: ["asad", "lattafa asad", "lattafa"],
    nike: ["nike"],
    adidas: ["adidas"],
    lacoste: ["lacoste", "lacost"],
    levis: ["levis", "levi's", "levi s", "levi"]
  };

  function fold(s) {
    return typeof VCA.radarFold === "function" ? VCA.radarFold(s) : String(s || "").toLowerCase().trim();
  }

  function lev(a, b) {
    if (a === b) return 0;
    const al = a.length;
    const bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    if (Math.abs(al - bl) > 2) return 9;
    const prev = new Array(bl + 1);
    const cur = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
      cur[0] = i;
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= bl; j++) prev[j] = cur[j];
    }
    return prev[bl];
  }

  function toks(folded) {
    return String(folded || "").split(/[^a-z0-9]+/).filter(Boolean);
  }

  function hasWord(folded, words) {
    const t = toks(folded);
    return (words || []).some((w) => {
      const wf = fold(w);
      if (!wf) return false;
      if (wf.indexOf(" ") >= 0) return folded.indexOf(wf) >= 0;
      if (t.indexOf(wf) >= 0) return true;
      if (wf.length >= 4) {
        return t.some((x) => x.length >= 3 && lev(x, wf) <= 1);
      }
      return false;
    });
  }

  function num(x) {
    const n = Number(String(x == null ? "" : x).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 9999) return null;
    return Math.round(n * 100) / 100;
  }

  function firstNumber(s) {
    const m = String(s || "").match(/(\d+(?:[.,]\d+)?)/);
    return m ? num(m[1]) : null;
  }

  function labeledAmounts(s) {
    const t = fold(s);
    const pick = (re) => {
      const m = t.match(re);
      return m ? num(m[1]) : null;
    };
    return {
      buyMax: pick(/(?:achat(?:\s+max)?|buy\s*max|plafond|max\s+achat)\s*(?:de\s+|a\s+|=)?\s*(\d+(?:[.,]\d+)?)/),
      resale: pick(/revente\s*(?:de\s+|a\s+|=)?\s*(\d+(?:[.,]\d+)?)/),
      minMargin: pick(/marge(?:\s+mini(?:male)?|\s+nette)?\s*(?:de\s+|a\s+|=)?\s*(\d+(?:[.,]\d+)?)/)
    };
  }

  function cloneQueries(raw) {
    return typeof VCA.migrateRadarQueries === "function"
      ? VCA.migrateRadarQueries(raw)
      : (Array.isArray(raw) ? raw.map((q) => Object.assign({}, q)) : []);
  }

  function nickList(q) {
    const extra = NICKS[q.id] || [];
    return [q.brand, q.query, q.id, String(q.id || "").replace(/-/g, " ")].concat(extra);
  }

  VCA.matchChatQuery = function matchChatQuery(queries, text) {
    const hay = fold(text);
    if (!hay) return null;
    let best = null;
    let bestLen = 0;
    const t = toks(hay);
    (queries || []).forEach((q) => {
      nickList(q).filter(Boolean).map(fold).filter((n) => n.length >= 2).forEach((n) => {
        if (hay.indexOf(n) >= 0 && n.length > bestLen) {
          best = q;
          bestLen = n.length;
          return;
        }
        if (n.indexOf(" ") < 0 && n.length >= 4) {
          t.forEach((x) => {
            if (x.length >= 4 && lev(x, n) <= 1 && n.length > bestLen) {
              best = q;
              bestLen = n.length;
            }
          });
        }
      });
    });
    return best;
  };

  VCA.radarChatAppend = function radarChatAppend(messages, userText, reply) {
    const list = Array.isArray(messages) ? messages.slice() : [];
    const ts = Date.now();
    list.push({ role: "user", text: String(userText || "").slice(0, 400), ts });
    list.push({ role: "assistant", text: String(reply || "").slice(0, 900), ts });
    return list.slice(-CAP);
  };

  VCA.radarChatScanFollowup = function radarChatScanFollowup(reply, scan) {
    const base = String(reply || "").trim();
    if (!scan || !scan.ok) {
      if (scan && scan.skipped === "off") {
        return `${base} Radar désactivé dans les réglages.`.trim();
      }
      return `${base} Scan incomplet — ouvre vinted.fr / une recherche.`.trim();
    }
    return `${base} ${scan.scored || 0} scorée(s), ${scan.alerts || 0} A.`.trim();
  };

  function fmtQuery(q) {
    const on = q.enabled === false ? "OFF" : "ON";
    return `${q.brand || q.query} ${on} · achat≤${q.buyMax} · rev.${q.resale} · marge ${q.minMargin}`;
  }

  function listQueries(queries) {
    const list = queries || [];
    if (!list.length) return "Aucune requête. Ajoute une marque ou restaure la pile.";
    const on = list.filter((q) => q.enabled !== false).length;
    const lines = list.map((q) => "· " + fmtQuery(q));
    return `${list.length} recherches (${on} ON) :\n${lines.join("\n")}`;
  }

  function listDeals(inbox) {
    const list = Array.isArray(inbox) ? inbox.slice(0, 8) : [];
    if (!list.length) return "Aucun deal en boîte. Lance un scan sur une page Vinted — je n’invente pas les prix live.";
    return "Derniers deals :\n" + list.map((d) => {
      const px = typeof VCA.formatEuro === "function" ? VCA.formatEuro(d.price) : d.price;
      return `· ${d.score || "?"} · ${px} € · ${(d.title || d.brand || d.id || "").slice(0, 40)}`;
    }).join("\n");
  }

  function explainScore(letter) {
    const L = String(letter || "").toUpperCase();
    if (L === "A") {
      return "A = affaire confortable : marge nette ≥ max(marge mini, 12 €) et ≥ 1,5× la mini, sans drapeau (tester, vide, NFS, trop cheap, photo floue, vendeur tout nouveau). Notif silencieuse + pastille.";
    }
    if (L === "B") {
      return "B = marge nette ≥ mini, pas de drapeau dur. Pas de notif : ça reste dans la boîte Radar.";
    }
    if (L === "C") {
      return "C = sous la marge mini, ou drapeau dur (tester, flacon vide, pas à vendre, prix absurde). Pas d’alerte.";
    }
    return "A = marge confortable sans drapeau (notif + pastille). B = marge OK, pas de drapeau dur. C = trop juste ou drapeau dur. Je ne certifie pas l’authenticité.";
  }

  function explainMargin() {
    return "Marge nette = revente − prix d’achat − frais. Marge mini = seuil pour un B (A plus haut, sans drapeau). Chaque marque a la sienne.";
  }

  function explainSkipGeneric() {
    return "Ignoré si : prix > achat max, drapeau dur (tester, vide, NFS, trop cheap), titre hors pile, ou déjà vu (re-alerte A seulement si le prix baisse d’au moins 5 €).";
  }

  function cosmeticsLine() {
    return "Cosmétiques : pas de tester, pas de pousse de contrefaçon, comptes Pro cosmétiques interdits. Le Radar flag tester / vide / prix absurde. Je ne dis jamais qu’une annonce est authentique.";
  }

  function howItWorks() {
    return "Veille locale : alarme 30–60 min tant que Chrome est ouvert (ou worker cloud). Une recherche de la pile, scrape catalogue, score A/B/C. Déjà vu : A seulement si −5 €. Pas d’API officielle, pas de prix inventés.";
  }

  function helpLine() {
    return "Radar local, sans compte ni IA. Parle comme d’habitude : une marque, un score, un scan…";
  }

  function prettyName(s) {
    return String(s || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
      .slice(0, 48);
  }

  function nameFromAdd(folded) {
    let rest = folded
      .replace(/^(ajoute(?:r)?|rajoute(?:r)?|nouvelle\s+requete|new\s+query)\s+/, "")
      .replace(/^(une|la|les|des|mes)\s+(requetes?|recherches?)\s+/, "")
      .replace(/^(les|des|le|la|un|une|mes|du|de)\s+/, "")
      .replace(/\b(achat(?:\s+max)?|buy\s*max|plafond|revente|marge(?:\s+mini(?:male)?)?)\s*(?:de\s+|a\s+|=)?\s*\d+(?:[.,]\d+)?/g, " ")
      .replace(/\b(parfum|vetement)s?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return rest.slice(0, 48);
  }

  function categoryFrom(folded) {
    if (/\b(vetement|habit|polo|polos|hoodie|jean|tshirt|tee\s*shirt|baskets?|sneakers?)\b/.test(folded)) return "vetement";
    if (/\bparfum/.test(folded)) return "parfum";
    return "parfum";
  }

  function setField(queries, q, field, amount) {
    const labels = { buyMax: "achat max", resale: "revente", minMargin: "marge mini" };
    const next = queries.map((x) => (x.id === q.id ? Object.assign({}, x, { [field]: amount }) : x));
    return {
      reply: `${q.brand || q.query} : ${labels[field] || field} ${amount} €.`,
      queries: next,
      pending: null,
      mutated: true,
      wantScan: false
    };
  }

  function setEnabled(queries, q, enabled) {
    const next = queries.map((x) => (x.id === q.id ? Object.assign({}, x, { enabled }) : x));
    return {
      reply: enabled
        ? `${q.brand || q.query} activée.`
        : `${q.brand || q.query} désactivée — plus scannée.`,
      queries: next,
      pending: null,
      mutated: true,
      wantScan: false
    };
  }

  function addQuery(queries, name, extras) {
    const existing = VCA.matchChatQuery(queries, name);
    if (existing) {
      return {
        reply: `${existing.brand || existing.query} est déjà dans la pile. ${fmtQuery(existing)}.`,
        queries,
        pending: null,
        mutated: false,
        wantScan: false
      };
    }
    const q = {
      id: typeof VCA.uid === "function" ? VCA.uid("rq") : "rq-" + Date.now(),
      query: name,
      brand: name,
      buyMax: extras.buyMax != null ? extras.buyMax : 20,
      resale: extras.resale != null ? extras.resale : 35,
      minMargin: extras.minMargin != null ? extras.minMargin : 10,
      category: extras.category || "parfum",
      enabled: true
    };
    return {
      reply: `Ajouté : ${fmtQuery(q)} €.`,
      queries: queries.concat([q]),
      pending: null,
      mutated: true,
      wantScan: false
    };
  }

  function extractScoreLetter(folded) {
    if (/\ba\s*\/\s*b(\s*\/\s*c)?/.test(folded) || /\bscores?\s*a\s*b\s*c\b/.test(folded)) return "ALL";
    const m = folded.match(/\b(?:score|note)s?\s*([abc])\b/)
      || folded.match(/\b(?:un|une|le|en)\s+([abc])\b/)
      || folded.match(/\b(?:quoi|koi|keske|pourquoi|pk).{0,28}\b([abc])\b/)
      || folded.match(/\b([abc])\s*(?:cest|veut dire|signifie|ca veut)/);
    return m ? String(m[1]).toUpperCase() : null;
  }

  function isQuestion(folded) {
    return hasWord(folded, ["quoi", "koi", "keske", "comment", "pourquoi", "pk", "cest", "ca"])
      || /\?/.test(folded);
  }

  function isLivePriceAsk(folded) {
    if (hasWord(folded, ["mets", "met", "achat", "buymax", "revente", "marge", "plafond", "baisse", "ajoute"])) return false;
    return hasWord(folded, ["combien"]) || /(prix (actuel|live|vinted)|sur vinted|cest combien|ca cote|cote actuelle)/.test(folded);
  }

  function isAuthAsk(folded) {
    return hasWord(folded, ["authentique", "authenticite"])
      || /(original\b|vrai parfum|vraie? bouteille|cest du fake|garanti authentic)/.test(folded);
  }

  function looksAdd(folded) {
    return hasWord(folded, ["ajoute", "ajouter", "rajoute", "rajouter"])
      || /^(nouvelle\s+requete|new\s+query)\b/.test(folded);
  }

  function looksDisable(folded) {
    return hasWord(folded, ["desactive", "desactiver", "coupe", "eteins", "enleve", "enlever", "retire", "retirer", "stoppe"])
      || /(veux pas|veut pas|jveux pas|je veux plus|plus de|arrete)\b/.test(folded);
  }

  function looksEnable(folded) {
    return hasWord(folded, ["active", "activer", "allume", "allumer", "remets", "remettre", "reprend", "reprendre"])
      && !looksDisable(folded);
  }

  function looksScanAction(folded) {
    if (isQuestion(folded) && hasWord(folded, ["comment", "quoi", "koi", "marche", "pourquoi"])) return false;
    return hasWord(folded, ["lance", "lancer", "balaye", "demarre", "relance"]) && hasWord(folded, ["scan", "scanne", "scanner"])
      || /^(scanne|scanner|scan)s?\b/.test(folded)
      || (hasWord(folded, ["scanne", "scanner"]) && hasWord(folded, ["maintenant", "maintenat"]));
  }

  function looksHow(folded) {
    return hasWord(folded, ["comment"])
      || (hasWord(folded, ["marche", "fonctionne"]) && hasWord(folded, ["comment", "ca", "quoi", "koi"]))
      || /(boucle|alarme|veille|comment tu scores|cest quoi le radar)/.test(folded)
      || (hasWord(folded, ["scanne", "scanner", "scan"]) && hasWord(folded, ["comment", "quoi", "koi"]));
  }

  function looksList(folded) {
    return hasWord(folded, ["liste", "requete", "requetes", "recherche", "recherches", "pile", "watches", "surveille"])
      || /(mes marques|mes recherches|cest quoi mes)/.test(folded);
  }

  function looksDeals(folded) {
    if (looksList(folded) && hasWord(folded, ["recherche", "recherches", "requete", "requetes", "pile"])) return false;
    return hasWord(folded, ["affaire", "affaires", "deal", "deals", "inbox", "trouvailles"])
      || /(boite radar|ce que tu as trouve)/.test(folded)
      || (hasWord(folded, ["montre", "affiche", "voir"]) && hasWord(folded, ["derniers", "dernieres", "dernier"]))
      || /montre moi les derniers/.test(folded)
      || /\bderniers?\b/.test(folded) && !hasWord(folded, ["recherche", "requete"]);
  }

  function looksSkip(folded) {
    return hasWord(folded, ["ignore", "ignoree", "saute", "skip", "ecarte", "filtre", "rejete", "jete"])
      || /(deja vu|over.?budget|drapeau dur|hard flag|buymax|tu l as ignore|tu las ignore)/.test(folded);
  }

  function looksBuySet(folded) {
    return hasWord(folded, ["baisse", "baisser", "monte", "monter", "augmente", "augmenter", "max", "plafond", "achat", "mets", "met", "mettez", "passe", "buymax", "euro", "euros"]);
  }

  function isHardCommand(folded) {
    return looksScanAction(folded) || looksList(folded) || looksDeals(folded) || looksAdd(folded)
      || /^(aide|help|salut|bonjour)\b/.test(folded);
  }

  function trySetFromSentence(folded, queries) {
    const labeled = labeledAmounts(folded);
    const q = VCA.matchChatQuery(queries, folded);
    const amount = firstNumber(folded);

    if (labeled.resale != null) {
      if (!q) {
        return { reply: "Revente : quelle marque ?", queries, pending: { intent: "set", field: "resale", amount: labeled.resale }, mutated: false, wantScan: false };
      }
      return setField(queries, q, "resale", labeled.resale);
    }
    if (labeled.minMargin != null && q) {
      return setField(queries, q, "minMargin", labeled.minMargin);
    }
    if (labeled.minMargin != null && !q && !isQuestion(folded)) {
      return { reply: "Marge mini pour quelle marque ?", queries, pending: { intent: "set", field: "minMargin", amount: labeled.minMargin }, mutated: false, wantScan: false };
    }

    const resaleM = folded.match(/\brevente(?:\s+(?:de|pour))?\s+(.+?)\s+(?:a\s+|=\s*)?(\d+(?:[.,]\d+)?)\s*$/);
    if (resaleM) {
      const n = num(resaleM[2]);
      const qq = VCA.matchChatQuery(queries, resaleM[1]) || q;
      if (n == null) return null;
      if (!qq) {
        return { reply: "Revente : quelle marque ?", queries, pending: { intent: "set", field: "resale", amount: n }, mutated: false, wantScan: false };
      }
      return setField(queries, qq, "resale", n);
    }

    if ((looksBuySet(folded) || (q && amount != null && /\bmax\b|\beuros?\b|\beur\b/.test(folded))) && amount != null) {
      if (!q) {
        return { reply: "Quelle marque pour cet achat max ?", queries, pending: { intent: "set", field: "buyMax", amount }, mutated: false, wantScan: false };
      }
      let next = setField(queries, q, "buyMax", amount);
      if (labeled.resale != null) next = setField(next.queries, q, "resale", labeled.resale);
      if (labeled.minMargin != null) next = setField(next.queries, q, "minMargin", labeled.minMargin);
      return next;
    }

    const buyM = folded.match(/(?:mets?|mettez|passe|achat\s+max|buy\s*max|plafond|max\s+achat|baisse(?:r)?|monte(?:r)?)(?:\s+(?:le|la|l))?\s+(.+?)\s+(?:a\s+|=\s*)?(\d+(?:[.,]\d+)?)/);
    if (buyM) {
      const n = num(buyM[2]);
      const brandBit = String(buyM[1] || "").replace(/\b(a|achat|max|buymax)\b/g, " ").trim();
      const qq = VCA.matchChatQuery(queries, brandBit) || q;
      if (n == null) return null;
      if (!qq) {
        return { reply: "Quelle marque pour cet achat max ?", queries, pending: { intent: "set", field: "buyMax", amount: n }, mutated: false, wantScan: false };
      }
      return setField(queries, qq, "buyMax", n);
    }

    if (looksBuySet(folded) && q && amount == null) {
      return {
        reply: `À combien d’euros max pour ${q.brand || q.query} ?`,
        queries,
        pending: { intent: "set", field: "buyMax", queryId: q.id },
        mutated: false,
        wantScan: false
      };
    }

    if (q && amount != null && !isQuestion(folded) && !looksSkip(folded) && !looksList(folded) && !looksDeals(folded)) {
      return setField(queries, q, "buyMax", amount);
    }
    return null;
  }

  function applyPending(text, folded, pending, queries) {
    if (!pending || !pending.intent) return null;
    if (isHardCommand(folded)) return null;

    if (pending.intent === "set") {
      const field = pending.field || "buyMax";
      const amount = pending.amount != null ? pending.amount : firstNumber(folded);
      let q = pending.queryId
        ? queries.find((x) => x.id === pending.queryId)
        : VCA.matchChatQuery(queries, text);
      if (!q && pending.brand) q = VCA.matchChatQuery(queries, pending.brand);
      if (!q) {
        const token = folded.replace(/^\d+(?:[.,]\d+)?\s*(?:€|eur|euros?)?\s*/, "").trim();
        if (token) q = VCA.matchChatQuery(queries, token);
      }
      if (!q && amount == null) return null;
      if (!q) {
        return { reply: "Quelle marque ?", queries, pending: { intent: "set", field, amount }, mutated: false, wantScan: false };
      }
      if (amount == null) {
        return { reply: `Quel montant (€) pour ${q.brand || q.query} ?`, queries, pending: { intent: "set", field, queryId: q.id }, mutated: false, wantScan: false };
      }
      return setField(queries, q, field, amount);
    }

    if (pending.intent === "enable" || pending.intent === "disable") {
      const q = VCA.matchChatQuery(queries, text);
      if (!q) return { reply: "Quelle marque ?", queries, pending, mutated: false, wantScan: false };
      return setEnabled(queries, q, pending.intent === "enable");
    }

    if (pending.intent === "add") {
      const name = nameFromAdd("ajoute " + folded) || folded;
      if (!name || name.length < 2) {
        return { reply: "Quelle marque ajouter ?", queries, pending: { intent: "add" }, mutated: false, wantScan: false };
      }
      return addQuery(queries, prettyName(name), labeledAmounts(text));
    }

    if (pending.intent === "which" && pending.queryId) {
      const q = queries.find((x) => x.id === pending.queryId);
      if (!q) return null;
      if (hasWord(folded, ["revente"])) {
        const n = firstNumber(folded);
        if (n == null) return { reply: `Revente actuelle ${q.resale} €. Nouveau montant ?`, queries, pending: { intent: "set", field: "resale", queryId: q.id }, mutated: false, wantScan: false };
        return setField(queries, q, "resale", n);
      }
      if (hasWord(folded, ["marge"])) {
        const n = firstNumber(folded);
        if (n == null) return { reply: `Marge mini ${q.minMargin} €. Nouveau montant ?`, queries, pending: { intent: "set", field: "minMargin", queryId: q.id }, mutated: false, wantScan: false };
        return setField(queries, q, "minMargin", n);
      }
      if (looksDisable(folded)) return setEnabled(queries, q, false);
      if (looksEnable(folded)) return setEnabled(queries, q, true);
      const n = firstNumber(folded);
      if (n != null) return setField(queries, q, "buyMax", n);
      return { reply: `${q.brand || q.query} : achat max ${q.buyMax} €. Tu le changes, ou tu regardes les deals ?`, queries, pending, mutated: false, wantScan: false };
    }
    return null;
  }

  function explainSkip(text, folded, queries, settings, inbox) {
    const q = VCA.matchChatQuery(queries, text);
    const amt = firstNumber(folded);
    if (q && amt != null) {
      const listing = { title: q.query, price: amt, raw: text };
      const s = typeof VCA.scoreRadarDeal === "function"
        ? VCA.scoreRadarDeal(listing, queries, settings)
        : { ok: false, skipped: "no-engine" };
      if (!s.ok) {
        if (s.skipped === "over-budget") {
          return `Skip : ${amt} € > achat max ${q.buyMax} € (${q.brand || q.query}).`;
        }
        if (s.skipped === "no-match") return "Titre hors pile active — aucune requête ne matche.";
        if (s.error === "no-price") return "Pas de prix fourni — je n’en invente pas.";
        return `Ignoré (${s.skipped || s.error}).`;
      }
      const hard = (s.flags || []).filter((f) => f.hard);
      if (hard.length) {
        return `Drapeau dur : ${hard.map((f) => f.label || f.id).join(", ")} → plutôt C, pas d’alerte A. (Montant que tu as tapé, pas un prix live.)`;
      }
      return `Avec ${amt} € ça scorait ${s.score} (marge ~${s.net} €). Ce n’est pas un prix live Vinted.`;
    }
    if (q && Array.isArray(inbox)) {
      const hit = inbox.find((d) => fold(d.brand || d.title || "").indexOf(fold(q.brand || q.query)) >= 0);
      if (hit) {
        const flags = Array.isArray(hit.flags) ? hit.flags.join(", ") : "";
        return `${hit.score} · ${hit.title || q.brand} · ${hit.price} €${flags ? " · " + flags : ""}. Skip classique : over buyMax, drapeau dur, déjà vu (−5 € pour re-alerte A).`;
      }
    }
    return explainSkipGeneric();
  }

  function unclearGuess(folded, queries) {
    const q = VCA.matchChatQuery(queries, folded);
    const n = firstNumber(folded);
    if (q && n != null) {
      return `J’imagine un achat max ${q.brand || q.query} à ${n} € — c’est ça ?`;
    }
    if (q) {
      return `${q.brand || q.query} : achat max ${q.buyMax} €. Tu le changes, ou tu veux les deals ?`;
    }
    if (n != null) {
      return `C’est ${n} € d’achat max pour quelle marque ?`;
    }
    return "Tu parles d’un score, d’une marque de la pile, ou des derniers deals ?";
  }

  VCA.radarChatTurn = function radarChatTurn(raw, ctx) {
    const queries = cloneQueries(ctx && ctx.queries);
    const inbox = Array.isArray(ctx && ctx.inbox) ? ctx.inbox : [];
    const settings = (ctx && ctx.settings) || {};
    const pending = ctx && ctx.pending && typeof ctx.pending === "object" ? Object.assign({}, ctx.pending) : null;
    const text = String(raw || "").trim();
    const folded = fold(text);

    function out(reply, extra) {
      return Object.assign({
        reply,
        queries,
        pending: null,
        mutated: false,
        wantScan: false
      }, extra || {});
    }

    if (!text) return out("Écris comme tu parles — une marque, un score, un scan…");

    if (isAuthAsk(folded)) {
      return out("Je ne certifie jamais qu’une annonce est authentique. En cas de doute, passe.");
    }

    if (pending) {
      const resolved = applyPending(text, folded, pending, queries);
      if (resolved) return resolved;
    }

    if (/^(salut|bonjour|hey|hello|aide|help|\?)$/.test(folded) || /^(aide|help)\b/.test(folded) || /que peux tu/.test(folded)) {
      return out(helpLine());
    }

    if (hasWord(folded, ["tester", "contrefacon", "fake"]) || /(pro cosm|compte pro)/.test(folded)) {
      return out(cosmeticsLine());
    }

    const letter = extractScoreLetter(folded);
    if (letter && !looksSkip(folded) && (isQuestion(folded) || hasWord(folded, ["score", "note"]) || /\bun\s+[abc]\b/.test(folded))) {
      return out(explainScore(letter === "ALL" ? "" : letter));
    }

    if (looksSkip(folded)) {
      return out(explainSkip(text, folded, queries, settings, inbox));
    }

    if (looksHow(folded) && !looksScanAction(folded)) {
      return out(howItWorks());
    }

    if (hasWord(folded, ["marge"]) && firstNumber(folded) == null && !looksBuySet(folded) && (isQuestion(folded) || /cest quoi la marge/.test(folded))) {
      return out(explainMargin());
    }

    if (looksScanAction(folded) || folded === "scan") {
      return out("Je lance un scan sur une recherche de la pile.", { wantScan: true });
    }

    if (looksDeals(folded)) return out(listDeals(inbox));
    if (looksList(folded) || folded === "pile") return out(listQueries(queries));

    if (isLivePriceAsk(folded)) {
      return out("Je n’invente pas les prix Vinted live. Lance un scan ou ouvre la recherche.");
    }

    if (looksDisable(folded)) {
      const q = VCA.matchChatQuery(queries, text);
      if (/radar/.test(folded) && !q) {
        return out("Pour couper tout le Radar : Paramètres → Radar, décoche la veille.");
      }
      if (!q) return out("Quelle marque désactiver ?", { pending: { intent: "disable" } });
      return setEnabled(queries, q, false);
    }

    if (looksEnable(folded)) {
      const q = VCA.matchChatQuery(queries, text);
      if (/radar/.test(folded) && !q) {
        return out("Pour activer le Radar : Paramètres → Radar, coche la veille.");
      }
      if (!q) return out("Quelle marque activer ?", { pending: { intent: "enable" } });
      return setEnabled(queries, q, true);
    }

    if (looksAdd(folded)) {
      const name = nameFromAdd(folded);
      if (!name || name.length < 2) {
        return out("Quelle marque ajouter ?", { pending: { intent: "add" } });
      }
      const extras = labeledAmounts(folded);
      extras.category = categoryFrom(folded);
      return addQuery(queries, prettyName(name), extras);
    }

    const setHit = trySetFromSentence(folded, queries);
    if (setHit) return setHit;

    const onlyNum = folded.match(/^(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros?)?$/);
    if (onlyNum) {
      return out("C’est l’achat max de quelle marque ?", { pending: { intent: "set", field: "buyMax", amount: num(onlyNum[1]) } });
    }

    const asBrand = VCA.matchChatQuery(queries, text);
    if (asBrand && toks(folded).length <= 3) {
      return out(`${fmtQuery(asBrand)}. Tu changes l’achat max, ou tu veux les deals ?`, {
        pending: { intent: "which", queryId: asBrand.id }
      });
    }

    return out(unclearGuess(folded, queries));
  };

  VCA.radarChatRender = function radarChatRender(logEl, messages) {
    if (!logEl) return;
    logEl.innerHTML = "";
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length) {
      const p = document.createElement("div");
      p.className = "chat-msg bot";
      p.textContent = "Radar local. Écris comme tu parles — une marque, un score, un scan…";
      logEl.appendChild(p);
    } else {
      list.forEach((m) => {
        const d = document.createElement("div");
        d.className = "chat-msg " + (m.role === "user" ? "me" : "bot");
        d.textContent = m.text || "";
        logEl.appendChild(d);
      });
    }
    logEl.scrollTop = logEl.scrollHeight;
  };

  VCA.bindRadarChat = function bindRadarChat(els) {
    if (!els || !els.log || !els.input || !els.send) return;
    const sendBtn = els.send;
    const input = els.input;

    async function refresh(messages) {
      VCA.radarChatRender(els.log, messages);
    }

    async function load() {
      try {
        const st = await chrome.runtime.sendMessage({ type: "VCA_RADAR_CHAT_HISTORY" });
        refresh(st && st.messages);
      } catch (_) {
        refresh([]);
      }
    }

    async function submit() {
      const raw = String(input.value || "").trim();
      if (!raw || sendBtn.disabled) return;
      input.value = "";
      sendBtn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({ type: "VCA_RADAR_CHAT", text: raw });
        refresh(res && res.messages);
        if (typeof els.onResult === "function") els.onResult(res || {});
      } catch (_) {
        refresh([{ role: "assistant", text: "Chat indisponible (recharge l’extension)." }]);
      }
      sendBtn.disabled = false;
      input.focus();
    }

    sendBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
    load();
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
