/**
 * Règles négo + garde-fous — copie soignée du moteur extension (lib/nego.js, lib/guard.js).
 * Utilisée par le worker Node. Les tests comparent les résultats aux IIFE du navigateur.
 */

export function roundEuro(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function formatEuro(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return (Math.round(Number(n) * 100) / 100).toFixed(2).replace(".", ",");
}

export function todayISODate() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function applyVars(text, vars) {
  let out = String(text || "");
  const map = vars || {};
  out = out.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = map[key];
    if (v == null || v === "") return "";
    return String(v);
  });
  return out;
}

export function templateReady(tpl) {
  const text = String(tpl?.text || "").replace(/\{\{[^}]+\}\}/g, "x").trim();
  return text.length >= 8;
}

export function offerBelowMinMargin(offer, settings) {
  const cost = Number(settings?.costPrice) || 0;
  const minM = Number(settings?.minMarginEur) || 0;
  if (cost <= 0) return false;
  const n = Number(offer);
  if (!Number.isFinite(n)) return true;
  return n < cost + minM;
}

export function computeNego(p) {
  const list = Number(p.listPrice);
  const offer = Number(p.offer);
  if (!Number.isFinite(list) || list <= 0) {
    return { ok: false, error: "Prix affiché invalide" };
  }
  if (!Number.isFinite(offer) || offer < 0) {
    return { ok: false, error: "Offre invalide" };
  }

  const cost = Number(p.costPrice) || 0;
  const minMargin = Number(p.minMarginEur) || 0;
  const floorSetting = Number(p.floorPrice) || 0;
  const maxDrop = Number.isFinite(Number(p.maxDropPercent)) ? Number(p.maxDropPercent) : 15;
  const stepPct = Number.isFinite(Number(p.counterStepPercent)) ? Number(p.counterStepPercent) : 8;

  const dropFloor = list * (1 - Math.max(0, Math.min(90, maxDrop)) / 100);
  const costFloor = cost > 0 ? cost : 0;
  const marginFloor = cost > 0 ? cost + minMargin : 0;
  const floor = roundEuro(Math.max(floorSetting, dropFloor, costFloor, 0));

  let target = cost > 0 ? marginFloor : list;
  target = roundEuro(Math.max(target, floor));

  const stepAmt = list * (Math.max(0, Math.min(50, stepPct)) / 100);

  if (offer >= target && offer >= floor) {
    return {
      ok: true,
      action: "accept",
      floor,
      target,
      suggested: roundEuro(offer),
      listPrice: list,
      offer,
      reason: `Offre ≥ objectif (${formatEuro(target)} €) et ≥ plancher (${formatEuro(floor)} €).`
    };
  }

  if (offer < floor) {
    return {
      ok: true,
      action: "refuse",
      floor,
      target,
      suggested: null,
      listPrice: list,
      offer,
      reason: `Offre sous le plancher (${formatEuro(floor)} €). Refus — ne pas descendre plus bas.`
    };
  }

  let suggested = list;
  for (let i = 1; i <= 10; i += 1) {
    const candidate = roundEuro(list - stepAmt * i);
    if (candidate < floor - 0.001) break;
    suggested = Math.max(floor, candidate);
    if (suggested > offer) break;
  }
  suggested = roundEuro(Math.max(floor, suggested));
  if (suggested <= offer) {
    suggested = roundEuro(Math.max(floor, Math.min(list, offer + Math.max(stepAmt, 1))));
  }
  if (suggested <= offer && offer < target) {
    suggested = roundEuro(Math.max(floor, Math.min(list, (offer + target) / 2)));
  }

  return {
    ok: true,
    action: "counter",
    floor,
    target,
    suggested,
    listPrice: list,
    offer,
    reason: `Contre-offre par paliers (−${stepPct} %). Objectif ${formatEuro(target)} €, plancher ${formatEuro(floor)} €.`
  };
}

export function negoMessageFor(result, templates) {
  const nego = templates?.nego || [];
  if (result.action === "accept") {
    return nego.find((x) => x.id === "nego-accepte")
      || nego.find((x) => /accepte/i.test(x.label || ""))
      || { text: "Parfait, j'accepte votre offre de {{offre}} € !" };
  }
  if (result.action === "refuse") {
    return nego.find((x) => x.id === "nego-refuse-plancher")
      || { text: "Merci pour votre offre. Je ne peux pas descendre sous {{plancher}} €." };
  }
  return nego.find((x) => x.id === "nego-contre")
    || nego.find((x) => /contre/i.test(x.label || ""))
    || { text: "Merci pour votre offre ! Je peux vous proposer {{contre}} €." };
}

export function negoVars(result, extra) {
  const e = extra || {};
  return {
    prix: result.listPrice != null ? formatEuro(result.listPrice) : (e.prix || ""),
    offre: result.offer != null ? formatEuro(result.offer) : (e.offre || ""),
    contre: result.suggested != null ? formatEuro(result.suggested) : (e.contre || ""),
    plancher: result.floor != null ? formatEuro(result.floor) : (e.plancher || ""),
    nom: e.nom || "",
    article: e.article || ""
  };
}

export function emptyAutoState(day) {
  return {
    day: day || todayISODate(),
    messagesSent: 0,
    repostsDone: 0,
    lastOutboundAt: 0,
    lastByConversation: {},
    processedKeys: {}
  };
}

export function normalizeAutoState(raw) {
  const today = todayISODate();
  const s = raw && typeof raw === "object" ? raw : {};
  if (s.day !== today) return emptyAutoState(today);
  return {
    day: today,
    messagesSent: Number(s.messagesSent) || 0,
    repostsDone: Number(s.repostsDone) || 0,
    lastOutboundAt: Number(s.lastOutboundAt) || 0,
    lastByConversation: s.lastByConversation && typeof s.lastByConversation === "object"
      ? s.lastByConversation
      : {},
    processedKeys: s.processedKeys && typeof s.processedKeys === "object"
      ? s.processedKeys
      : {}
  };
}

export function guardCheck(settings, state, type, conversationId) {
  const st = normalizeAutoState(state);
  if (!settings?.modeAuto) {
    return { ok: false, reason: "mode-off", state: st };
  }
  const now = Date.now();
  const minDelay = Math.max(15, Number(settings.autoMinDelaySeconds) || 60) * 1000;
  if (st.lastOutboundAt && now - st.lastOutboundAt < minDelay) {
    const wait = Math.ceil((minDelay - (now - st.lastOutboundAt)) / 1000);
    return { ok: false, reason: "delay", waitSeconds: wait, state: st };
  }
  if (type === "message") {
    const cap = Math.max(1, Number(settings.autoDailyMessageCap) || 40);
    if (st.messagesSent >= cap) return { ok: false, reason: "cap-msg", state: st };
  }
  if (type === "repost") {
    const cap = Math.max(1, Number(settings.autoDailyRepostCap) || 20);
    if (st.repostsDone >= cap) return { ok: false, reason: "cap-repost", state: st };
  }
  if (conversationId && type === "message") {
    const cool = Math.max(5, Number(settings.autoConversationCooldownMinutes) || 90) * 60 * 1000;
    const last = Number(st.lastByConversation[conversationId]) || 0;
    if (last && now - last < cool) return { ok: false, reason: "cooldown", state: st };
  }
  return { ok: true, state: st };
}

export function guardRecord(state, type, conversationId) {
  const st = normalizeAutoState(state);
  const now = Date.now();
  st.lastOutboundAt = now;
  if (type === "message") st.messagesSent += 1;
  if (type === "repost") st.repostsDone += 1;
  if (conversationId) st.lastByConversation[conversationId] = now;
  return st;
}

export function markProcessed(state, key) {
  const st = normalizeAutoState(state);
  st.processedKeys[key] = Date.now();
  const keys = Object.keys(st.processedKeys);
  if (keys.length > 200) {
    keys.slice(0, keys.length - 200).forEach((k) => delete st.processedKeys[k]);
  }
  return st;
}

export function wasProcessed(state, key) {
  return Boolean(normalizeAutoState(state).processedKeys[key]);
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function appendAutoLog(log, entry) {
  const list = Array.isArray(log) ? log.slice() : [];
  list.unshift({
    id: uid("log"),
    ts: new Date().toISOString(),
    type: entry.type || "info",
    target: entry.target || "",
    ok: !!entry.ok,
    error: entry.error || "",
    detail: entry.detail || ""
  });
  return list.slice(0, 80);
}

export function guardReasonLabel(reason) {
  const map = {
    "mode-off": "Mode auto désactivé",
    delay: "Délai minimum entre envois",
    "cap-msg": "Plafond quotidien de messages atteint",
    "cap-repost": "Plafond quotidien de reposts atteint",
    cooldown: "Cooldown de cette conversation",
    empty: "Modèle vide — envoi annulé",
    "below-margin": "Offre sous la marge mini — pas d’acceptation auto",
    "no-template": "Aucun modèle configuré",
    "no-session": "Session Vinted absente ou expirée"
  };
  return map[reason] || reason || "";
}
