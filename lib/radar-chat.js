/**
 * Chat Radar local (1.5) — parseur français, sans LLM ni réseau.
 * Explique pile / scores / skips et mute les requêtes (achat max, revente, marge).
 */
(function (root) {
  "use strict";

  const VCA = (root.VCA = root.VCA || {});
  const CAP = 40;
  VCA.RADAR_CHAT_CAP = CAP;

  function fold(s) {
    return typeof VCA.radarFold === "function" ? VCA.radarFold(s) : String(s || "").toLowerCase().trim();
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

  VCA.matchChatQuery = function matchChatQuery(queries, text) {
    const hay = fold(text);
    if (!hay) return null;
    let best = null;
    let bestLen = 0;
    (queries || []).forEach((q) => {
      const tokens = [q.brand, q.query, q.id, String(q.id || "").replace(/-/g, " ")]
        .filter(Boolean)
        .map(fold)
        .filter((t) => t.length >= 2);
      tokens.forEach((t) => {
        if (hay.includes(t) && t.length > bestLen) {
          best = q;
          bestLen = t.length;
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
    if (!list.length) return "Aucune requête. Dis « ajoute Polo » ou restaure la pile.";
    const on = list.filter((q) => q.enabled !== false).length;
    const lines = list.map((q) => "· " + fmtQuery(q));
    return `${list.length} recherches (${on} ON) :\n${lines.join("\n")}`;
  }

  function listDeals(inbox) {
    const list = Array.isArray(inbox) ? inbox.slice(0, 8) : [];
    if (!list.length) return "Aucun deal en boîte. Dis « scanner » sur une page Vinted — je n’invente pas les prix live.";
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
    return "A = marge confortable sans drapeau (notif + pastille). B = marge OK, pas de drapeau dur. C = trop juste ou drapeau dur (tester / vide / NFS / trop cheap). Je ne certifie pas l’authenticité.";
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
    return "Radar local, sans compte ni IA. Ex. « liste », « mets Lacoste à 15 », « revente Nike 40 », « désactive Hawas », « scanner », « derniers deals ».";
  }

  function nameFromAdd(folded) {
    let rest = folded
      .replace(/^(ajoute(?:r)?|nouvelle\s+requete|new\s+query)\s+/, "")
      .replace(/^une\s+(requete|recherche)\s+/, "")
      .replace(/\b(achat(?:\s+max)?|buy\s*max|plafond|revente|marge(?:\s+mini(?:male)?)?)\s*(?:de\s+|a\s+|=)?\s*\d+(?:[.,]\d+)?/g, " ")
      .replace(/\b(parfum|vetement)s?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return rest.slice(0, 48);
  }

  function categoryFrom(folded) {
    if (/\b(vetement|habit|polo|hoodie|jean|tshirt|tee\s*shirt|baskets?|sneakers?)\b/.test(folded)) return "vetement";
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

  function isLivePriceAsk(folded) {
    if (/(mets?|achat max|buy\s*max|revente|marge|plafond|desactive|active|ajoute)/.test(folded)) return false;
    return /(combien|quel prix|prix (actuel|live|vinted|sur vinted)|cest combien|ca cote|cote actuelle)/.test(folded);
  }

  function isAuthAsk(folded) {
    return /(authentique|original\b|vrai parfum|vraie? bouteille|cest du fake|garanti authentic)/.test(folded);
  }

  function isHardCommand(folded) {
    return /^(scanne|liste|aide|help|salut|bonjour|derniers?|ajoute|desactive|active|mets? |revente |marge )/.test(folded)
      || /\b(scanner|derniers? deals?|requetes?)\b/.test(folded);
  }

  function trySetFromSentence(folded, queries) {
    const labeled = labeledAmounts(folded);
    const resaleM = folded.match(/\brevente(?:\s+(?:de|pour))?\s+(.+?)\s+(?:a\s+|=\s*)?(\d+(?:[.,]\d+)?)\s*$/);
    const margeM = folded.match(/\bmarge(?:\s+mini(?:male)?|\s+nette)?(?:\s+(?:de|pour))?\s+(.+?)\s+(?:a\s+|=\s*)?(\d+(?:[.,]\d+)?)\s*$/);
    const buyM = folded.match(/(?:mets?|mettez|passe|achat\s+max|buy\s*max|plafond|max\s+achat)(?:\s+(?:le|la|l))?\s+(.+?)\s+(?:a\s+|=\s*)?(\d+(?:[.,]\d+)?)/);

    if (resaleM) {
      const amount = num(resaleM[2]);
      const q = VCA.matchChatQuery(queries, resaleM[1]);
      if (amount == null) return null;
      if (!q) {
        return { reply: "Quelle marque pour la revente ?", queries, pending: { intent: "set", field: "resale", amount }, mutated: false, wantScan: false };
      }
      return setField(queries, q, "resale", amount);
    }
    if (margeM) {
      const amount = num(margeM[2]);
      const q = VCA.matchChatQuery(queries, margeM[1]);
      if (amount == null) return null;
      if (!q) {
        return { reply: "Marge mini pour quelle marque ?", queries, pending: { intent: "set", field: "minMargin", amount }, mutated: false, wantScan: false };
      }
      return setField(queries, q, "minMargin", amount);
    }
    if (buyM) {
      const amount = num(buyM[2]);
      const brandBit = String(buyM[1] || "").replace(/\b(a|achat|max|buymax)\b/g, " ").trim();
      const q = VCA.matchChatQuery(queries, brandBit);
      if (amount == null) return null;
      if (!q) {
        return { reply: "Quelle marque pour cet achat max ?", queries, pending: { intent: "set", field: "buyMax", amount }, mutated: false, wantScan: false };
      }
      if (labeled.resale != null || labeled.minMargin != null) {
        let next = setField(queries, q, "buyMax", amount);
        if (labeled.resale != null) next = setField(next.queries, q, "resale", labeled.resale);
        if (labeled.minMargin != null) next = setField(next.queries, q, "minMargin", labeled.minMargin);
        next.reply = `${q.brand || q.query} mis à jour (achat max ${amount} €).`;
        return next;
      }
      return setField(queries, q, "buyMax", amount);
    }
    return null;
  }

  function applyPending(text, folded, pending, queries) {
    if (!pending || !pending.intent) return null;
    if (isHardCommand(folded)) return null;

    if (pending.intent === "set") {
      const field = pending.field || "buyMax";
      let amount = pending.amount != null ? pending.amount : firstNumber(folded);
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
      return addQuery(queries, name.replace(/^\w/, (c) => c.toUpperCase()), labeledAmounts(text));
    }

    if (pending.intent === "which" && pending.queryId) {
      const q = queries.find((x) => x.id === pending.queryId);
      if (!q) return null;
      if (/revente/.test(folded)) {
        const n = firstNumber(folded);
        if (n == null) return { reply: `Revente actuelle ${q.resale} €. Nouveau montant ?`, queries, pending: { intent: "set", field: "resale", queryId: q.id }, mutated: false, wantScan: false };
        return setField(queries, q, "resale", n);
      }
      if (/marge/.test(folded)) {
        const n = firstNumber(folded);
        if (n == null) return { reply: `Marge mini ${q.minMargin} €. Nouveau montant ?`, queries, pending: { intent: "set", field: "minMargin", queryId: q.id }, mutated: false, wantScan: false };
        return setField(queries, q, "minMargin", n);
      }
      if (/desactive|off|coupe/.test(folded)) return setEnabled(queries, q, false);
      if (/active|on/.test(folded)) return setEnabled(queries, q, true);
      const n = firstNumber(folded);
      if (n != null) return setField(queries, q, "buyMax", n);
      return { reply: `${fmtQuery(q)}. Tu changes l’achat max, la revente, ou tu (dés)actives ?`, queries, pending, mutated: false, wantScan: false };
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
      const hit = inbox.find((d) => fold(d.brand || d.title || "").includes(fold(q.brand || q.query)));
      if (hit) {
        const flags = Array.isArray(hit.flags) ? hit.flags.join(", ") : "";
        return `${hit.score} · ${hit.title || q.brand} · ${hit.price} €${flags ? " · " + flags : ""}. Skip classique : over buyMax, drapeau dur, déjà vu (−5 € pour re-alerte A).`;
      }
    }
    return explainSkipGeneric();
  }

  VCA.radarChatTurn = function radarChatTurn(raw, ctx) {
    const queries = cloneQueries(ctx && ctx.queries);
    const inbox = Array.isArray(ctx && ctx.inbox) ? ctx.inbox : [];
    const settings = (ctx && ctx.settings) || {};
    let pending = ctx && ctx.pending && typeof ctx.pending === "object" ? Object.assign({}, ctx.pending) : null;
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

    if (!text) return out("Écris une question — ex. « liste » ou « mets Lacoste à 15 ».");

    if (isLivePriceAsk(folded)) {
      return out("Je n’invente pas les prix Vinted live. Lance « scanner » ou ouvre la recherche.");
    }
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

    if (/^(scanne|scanner|scanne maintenant|lancer (un )?scan|balaye)\b/.test(folded) || folded === "scan") {
      return out("Je lance un scan sur une recherche de la pile.", { wantScan: true });
    }

    if (/(derniers? deals?|dernieres? affaires?|boite radar|\binbox\b|ce que tu as trouve)/.test(folded)) {
      return out(listDeals(inbox));
    }

    if (/^(liste|requetes?|recherches?|pile|watches|mes marques)\b/.test(folded)
      || /(liste|montre|affiche).*(requetes?|recherches?|pile|marques)/.test(folded)
      || folded === "pile") {
      return out(listQueries(queries));
    }

    if (/\b(tester|contrefacon|fake|pro cosm|compte pro)\b/.test(folded)) {
      return out(cosmeticsLine());
    }

    if (/(comment ca marche|boucle|alarme|comment tu scores|cest quoi le radar|veille)/.test(folded)) {
      return out(howItWorks());
    }

    if (/\bscores?\s*[abc]\b/.test(folded) || /cest quoi.{0,20}\b[abc]\b/.test(folded)
      || /que (veut dire|signifie)\s*[abc]\b/.test(folded) || /a\s*\/\s*b\s*\/\s*c/.test(folded)) {
      const m = folded.match(/\b([abc])\b/);
      const all = /[abc].*[abc].*[abc]/.test(folded) || /a\s*\/\s*b/.test(folded);
      return out(explainScore(all ? "" : (m && m[1])));
    }

    if (/(pourquoi|pk).*(ignore|saute|skip|ecarte|filtre|rejete)/.test(folded)
      || /(deja vu|over.?budget|drapeau dur|hard flag|buymax)/.test(folded)) {
      return out(explainSkip(text, folded, queries, settings, inbox));
    }

    const enM = folded.match(/^(?:active(?:r)?|allume|enable|remets?)\s+(?:la\s+requete\s+)?(.+)/);
    const disM = folded.match(/^(?:desactive(?:r)?|coupe|eteins?|disable|stop(?:pe)?(?:r)?)\s+(?:la\s+requete\s+)?(.+)/);
    if (disM) {
      const target = disM[1];
      if (/^(le\s+)?radar$/.test(target)) {
        return out("Pour couper tout le Radar : Paramètres → Radar, décoche la veille.");
      }
      const q = VCA.matchChatQuery(queries, target);
      if (!q) return out("Quelle marque désactiver ?", { pending: { intent: "disable" } });
      return setEnabled(queries, q, false);
    }
    if (enM) {
      const target = enM[1];
      if (/^(le\s+)?radar$/.test(target)) {
        return out("Pour activer le Radar : Paramètres → Radar, coche la veille.");
      }
      const q = VCA.matchChatQuery(queries, target);
      if (!q) return out("Quelle marque activer ?", { pending: { intent: "enable" } });
      return setEnabled(queries, q, true);
    }

    if (/^(ajoute(?:r)?|nouvelle\s+requete|new\s+query)\b/.test(folded)) {
      const name = nameFromAdd(folded);
      if (!name || name.length < 2) {
        return out("Quelle marque ajouter ?", { pending: { intent: "add" } });
      }
      const extras = labeledAmounts(folded);
      extras.category = categoryFrom(folded);
      const pretty = name.replace(/^\w/, (c) => c.toUpperCase());
      return addQuery(queries, pretty, extras);
    }

    const setHit = trySetFromSentence(folded, queries);
    if (setHit) return setHit;

    const onlyNum = folded.match(/^(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros?)?$/);
    if (onlyNum) {
      const amount = num(onlyNum[1]);
      return out("C’est l’achat max de quelle marque ?", { pending: { intent: "set", field: "buyMax", amount } });
    }

    const asBrand = VCA.matchChatQuery(queries, text);
    if (asBrand && fold(text).length <= fold(asBrand.brand || asBrand.query).length + 4) {
      return out(`${fmtQuery(asBrand)}. Tu changes l’achat max, la revente, ou tu (dés)actives ?`, {
        pending: { intent: "which", queryId: asBrand.id }
      });
    }

    return out("Je n’ai pas compris. Tu veux changer un achat max, lister la pile, scanner, ou voir les derniers deals ?");
  };

  VCA.radarChatRender = function radarChatRender(logEl, messages) {
    if (!logEl) return;
    logEl.innerHTML = "";
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length) {
      const p = document.createElement("div");
      p.className = "chat-msg bot";
      p.textContent = "Radar local (sans compte). Ex. « mets Lacoste à 15 », « liste », « scanner ».";
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
      const text = String(input.value || "").trim();
      if (!text || sendBtn.disabled) return;
      input.value = "";
      sendBtn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({ type: "VCA_RADAR_CHAT", text });
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
