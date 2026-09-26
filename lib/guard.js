/**
 * Garde-fous Mode auto (local, sans cloud).
 * Caps journaliers, délai, cooldown conversation, journal d’actions.
 */
(function (root) {
  "use strict";

  const VCA = (root.VCA = root.VCA || {});
  const LOG_MAX = 80;

  VCA.emptyAutoState = function emptyAutoState(day) {
    return {
      day: day || VCA.todayISODate(),
      messagesSent: 0,
      repostsDone: 0,
      lastOutboundAt: 0,
      lastByConversation: {},
      processedKeys: {}
    };
  };

  VCA.normalizeAutoState = function normalizeAutoState(raw) {
    const today = VCA.todayISODate();
    const s = raw && typeof raw === "object" ? raw : {};
    if (s.day !== today) return VCA.emptyAutoState(today);
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
  };

  VCA.templateReady = function templateReady(tpl) {
    const text = String(tpl?.text || "").replace(/\{\{[^}]+\}\}/g, "x").trim();
    return text.length >= 8;
  };

  VCA.offerBelowMinMargin = function offerBelowMinMargin(offer, settings) {
    const cost = Number(settings?.costPrice) || 0;
    const minM = Number(settings?.minMarginEur) || 0;
    if (cost <= 0) return false;
    const n = Number(offer);
    if (!Number.isFinite(n)) return true;
    return n < cost + minM;
  };

  /**
   * @param {"message"|"repost"} type
   */
  VCA.guardCheck = function guardCheck(settings, state, type, conversationId) {
    const st = VCA.normalizeAutoState(state);
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
      if (st.messagesSent >= cap) {
        return { ok: false, reason: "cap-msg", state: st };
      }
    }
    if (type === "repost") {
      const cap = Math.max(1, Number(settings.autoDailyRepostCap) || 20);
      if (st.repostsDone >= cap) {
        return { ok: false, reason: "cap-repost", state: st };
      }
    }
    if (conversationId && type === "message") {
      const cool = Math.max(5, Number(settings.autoConversationCooldownMinutes) || 90) * 60 * 1000;
      const last = Number(st.lastByConversation[conversationId]) || 0;
      if (last && now - last < cool) {
        return { ok: false, reason: "cooldown", state: st };
      }
    }
    return { ok: true, state: st };
  };

  VCA.guardRecord = function guardRecord(state, type, conversationId) {
    const st = VCA.normalizeAutoState(state);
    const now = Date.now();
    st.lastOutboundAt = now;
    if (type === "message") st.messagesSent += 1;
    if (type === "repost") st.repostsDone += 1;
    if (conversationId) st.lastByConversation[conversationId] = now;
    return st;
  };

  VCA.markProcessed = function markProcessed(state, key) {
    const st = VCA.normalizeAutoState(state);
    st.processedKeys[key] = Date.now();
    const keys = Object.keys(st.processedKeys);
    if (keys.length > 200) {
      keys.slice(0, keys.length - 200).forEach((k) => delete st.processedKeys[k]);
    }
    return st;
  };

  VCA.wasProcessed = function wasProcessed(state, key) {
    const st = VCA.normalizeAutoState(state);
    return Boolean(st.processedKeys[key]);
  };

  VCA.appendAutoLog = function appendAutoLog(log, entry) {
    const list = Array.isArray(log) ? log.slice() : [];
    list.unshift({
      id: VCA.uid("log"),
      ts: new Date().toISOString(),
      type: entry.type || "info",
      target: entry.target || "",
      ok: !!entry.ok,
      error: entry.error || "",
      detail: entry.detail || ""
    });
    return list.slice(0, LOG_MAX);
  };

  VCA.guardReasonLabel = function guardReasonLabel(reason) {
    const map = {
      "mode-off": "Mode auto désactivé",
      delay: "Délai minimum entre envois",
      "cap-msg": "Plafond quotidien de messages atteint",
      "cap-repost": "Plafond quotidien de reposts atteint",
      cooldown: "Cooldown de cette conversation",
      empty: "Modèle vide — envoi annulé",
      "below-margin": "Offre sous la marge mini — pas d’acceptation auto",
      "no-template": "Aucun modèle configuré"
    };
    return map[reason] || reason || "";
  };

  VCA.loadGuard = async function loadGuard() {
    const data = await VCA.storageGet([VCA.KEYS.autoState, VCA.KEYS.autoLog, VCA.KEYS.settings]);
    return {
      settings: VCA.migrateSettings(data[VCA.KEYS.settings]),
      state: VCA.normalizeAutoState(data[VCA.KEYS.autoState]),
      log: Array.isArray(data[VCA.KEYS.autoLog]) ? data[VCA.KEYS.autoLog] : []
    };
  };

  VCA.saveGuard = async function saveGuard(state, log) {
    const patch = { [VCA.KEYS.autoState]: VCA.normalizeAutoState(state) };
    if (log) patch[VCA.KEYS.autoLog] = log.slice(0, LOG_MAX);
    await VCA.storageSet(patch);
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
