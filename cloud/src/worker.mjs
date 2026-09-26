import {
  computeNego,
  negoMessageFor,
  negoVars,
  applyVars,
  templateReady,
  offerBelowMinMargin,
  guardCheck,
  guardRecord,
  markProcessed,
  wasProcessed,
  guardReasonLabel
} from "../shared/rules.mjs";
import { loadState, saveState, log } from "./store.mjs";
import { decryptJson } from "./crypto.mjs";
import {
  httpInbox,
  httpReply,
  playwrightInbox,
  playwrightReply,
  playwrightRepost,
  parseInboxConversations
} from "./vinted.mjs";

export function workerSettings(state) {
  const s = { ...(state.config?.settings || {}) };
  s.modeAuto = !!(state.enabled && !state.killed);
  return s;
}

export function sessionPlain(state) {
  if (!state.session?.blob) return null;
  try {
    return decryptJson(state.session.blob);
  } catch {
    return null;
  }
}

export function prepareNegoJob(state, job) {
  const settings = workerSettings(state);
  if (job.dryRun) settings.modeAuto = true;
  const result0 = computeNego({
    listPrice: job.listPrice,
    offer: job.offer,
    costPrice: settings.costPrice,
    minMarginEur: settings.minMarginEur,
    floorPrice: settings.floorPrice,
    maxDropPercent: settings.maxDropPercent,
    counterStepPercent: settings.counterStepPercent
  });
  if (!result0.ok) {
    log(state, { type: "nego", target: job.conversationId || "dry", ok: false, error: result0.error });
    return { ok: false, error: result0.error };
  }
  const result = { ...result0 };
  if (result.action === "accept" && offerBelowMinMargin(job.offer, settings)) {
    result.action = "refuse";
    result.suggested = null;
    result.reason = "Marge mini : acceptation auto bloquée.";
  }
  const tpl = negoMessageFor(result, state.config.templates);
  if (!templateReady(tpl)) {
    log(state, { type: "nego", target: job.conversationId || "dry", ok: false, error: "no-template" });
    return { ok: false, error: "no-template" };
  }
  const text = applyVars(tpl.text, negoVars(result, job));
  const key = `nego:${job.conversationId || "dry"}:${job.offer}:${job.listPrice}`;
  if (wasProcessed(state.guardState, key) && !job.force) {
    return { ok: false, skipped: "already" };
  }
  const gate = guardCheck(settings, state.guardState, "message", job.conversationId || "dry");
  if (!gate.ok) {
    log(state, {
      type: "nego",
      target: job.conversationId || "dry",
      ok: false,
      error: gate.reason,
      detail: guardReasonLabel(gate.reason)
    });
    return { ok: false, reason: gate.reason };
  }
  return { ok: true, result, text, key };
}

export function commitNegoJob(state, job, prepared) {
  state.guardState = markProcessed(
    guardRecord(state.guardState, "message", job.conversationId || "dry"),
    prepared.key
  );
  log(state, {
    type: job.dryRun ? "dry-run" : "nego",
    target: job.conversationId || "dry",
    ok: true,
    detail: `${prepared.result.action} ${prepared.text.slice(0, 90)}`
  });
  return { ok: true, result: prepared.result, text: prepared.text };
}

export function processNegoJob(state, job) {
  const prepared = prepareNegoJob(state, job);
  if (!prepared.ok) return prepared;
  return commitNegoJob(state, job, prepared);
}

export function runDryQueueOnce() {
  const state = loadState();
  while (state.dryRunQueue.length) {
    const job = state.dryRunQueue.shift();
    processNegoJob(state, { ...job, dryRun: true });
  }
  state.lastTick = new Date().toISOString();
  saveState(state);
  return state;
}

async function sendNegoText(session, conversationId, text) {
  const http = await httpReply(session, conversationId, text);
  if (http.ok) return http;
  return playwrightReply(session, conversationId, text);
}

async function processLiveInbox(state, sess, settings) {
  if (settings.autoNegoSend === false) return;
  let inbox = await httpInbox(sess);
  let conversations = inbox.ok ? parseInboxConversations(inbox.data) : [];
  if (!inbox.ok) {
    inbox = await playwrightInbox(sess);
    conversations = inbox.conversations || [];
  }
  if (!inbox.ok) {
    log(state, {
      type: "inbox",
      ok: false,
      error: "no-session",
      detail: `HTTP ${inbox.status || ""} — rouvrez Chrome et « Synchroniser la session »`
    });
    state.lastError = "session-invalide";
    return;
  }
  log(state, {
    type: "inbox",
    ok: true,
    detail: `${inbox.mode || "http"} · ${conversations.length} conv.`
  });

  const candidates = conversations.filter((c) => {
    if (c.fromMe) return false;
    if (c.offer == null || c.listPrice == null) return false;
    return true;
  });

  for (const conv of candidates) {
    const job = {
      listPrice: conv.listPrice,
      offer: conv.offer,
      conversationId: conv.conversationId,
      nom: conv.nom,
      article: conv.article
    };
    const prepared = prepareNegoJob(state, job);
    if (!prepared.ok) {
      if (prepared.reason === "delay" || prepared.reason === "cap-msg" || prepared.reason === "cooldown") break;
      continue;
    }
    try {
      const sent = await sendNegoText(sess, conv.conversationId, prepared.text);
      if (sent.ok) {
        commitNegoJob(state, job, prepared);
        log(state, {
          type: "nego",
          target: conv.conversationId,
          ok: true,
          detail: `${prepared.result.action} via ${sent.mode || "send"}`
        });
      } else {
        log(state, {
          type: "nego",
          target: conv.conversationId,
          ok: false,
          error: sent.error || "send-fail"
        });
      }
    } catch (err) {
      state.lastError = String(err.message || err);
      log(state, { type: "nego", target: conv.conversationId, ok: false, error: state.lastError });
    }
    break;
  }
}

async function processRepost(state, sess, settings) {
  if (!state.config?.repost?.length || settings.autoRepostDo === false) return;
  const item = state.config.repost[0];
  const gate = guardCheck(settings, state.guardState, "repost", "");
  if (!gate.ok || !item.url) return;
  try {
    const res = await playwrightRepost(sess, item.url);
    if (res.ok) {
      state.guardState = guardRecord(state.guardState, "repost", item.id || item.url);
    }
    const rest = state.config.repost.slice(1);
    item.lastOpenedAt = new Date().toISOString();
    rest.push(item);
    state.config.repost = rest;
    log(state, {
      type: "repost",
      target: item.url,
      ok: !!res.ok,
      error: res.error || "",
      detail: res.mode || ""
    });
  } catch (err) {
    state.lastError = String(err.message || err);
    log(state, { type: "repost", target: item.url, ok: false, error: state.lastError });
  }
}

async function processPostsale(state, sess, settings) {
  if (settings.autoPostSaleSend === false) return;
  const now = Date.now();
  const jobs = state.config?.postsale || [];
  const due = jobs.find((j) => {
    if (!j.thankYouDone && j.thankYouAt && Date.parse(j.thankYouAt) <= now) return true;
    if (!j.reviewDone && j.reviewAt && Date.parse(j.reviewAt) <= now) return true;
    return false;
  });
  if (!due) return;
  const kind = !due.thankYouDone && due.thankYouAt && Date.parse(due.thankYouAt) <= now ? "merci" : "avis";
  const want = kind === "avis" ? "sav-avis" : "sav-merci";
  const tpl = (state.config.templates?.postVente || []).find((t) => t.id === want)
    || (state.config.templates?.postVente || [])[0];
  if (!templateReady(tpl)) {
    log(state, { type: "postsale", target: due.id, ok: false, error: "no-template" });
    return;
  }
  const conv = due.conversationId || due.id || "sav";
  const key = `sav:${conv}:${want}`;
  if (wasProcessed(state.guardState, key)) return;
  const gate = guardCheck(settings, state.guardState, "message", conv);
  if (!gate.ok) return;
  const text = applyVars(tpl.text, { article: due.title || "", nom: due.nom || "" });
  try {
    let sent = { ok: false };
    if (due.conversationId) sent = await sendNegoText(sess, due.conversationId, text);
    if (!sent.ok && due.url) {
      const { playwrightAction } = await import("./vinted.mjs");
      sent = await playwrightAction(sess, async (page) => {
        await page.goto(due.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        const box = page.locator("textarea, [contenteditable='true']").first();
        if (await box.count()) {
          await box.fill(text);
          const send = page.locator("button[type='submit']").first();
          if (await send.count()) await send.click();
          else await box.press("Enter");
          return { ok: true, mode: "playwright-url" };
        }
        return { ok: false, error: "no-input" };
      });
    }
    if (sent.ok) {
      if (kind === "avis") due.reviewDone = true;
      else due.thankYouDone = true;
      state.guardState = markProcessed(guardRecord(state.guardState, "message", conv), key);
    }
    log(state, {
      type: "postsale",
      target: due.id || conv,
      ok: !!sent.ok,
      error: sent.error || "",
      detail: want
    });
  } catch (err) {
    state.lastError = String(err.message || err);
    log(state, { type: "postsale", target: due.id, ok: false, error: state.lastError });
  }
}

export async function runTick() {
  const state = loadState();
  state.lastTick = new Date().toISOString();
  state.lastError = "";

  while (state.dryRunQueue.length) {
    const job = state.dryRunQueue.shift();
    processNegoJob(state, { ...job, dryRun: true });
  }

  if (!state.enabled || state.killed) {
    saveState(state);
    return state;
  }

  const settings = workerSettings(state);
  const sess = sessionPlain(state);

  if (!sess) {
    log(state, {
      type: "inbox",
      ok: false,
      error: "no-session",
      detail: "Aucune session chiffrée — synchronisez depuis l’extension"
    });
    state.lastError = "session-absente";
    saveState(state);
    return state;
  }

  try {
    await processLiveInbox(state, sess, settings);
    await processRepost(state, sess, settings);
    await processPostsale(state, sess, settings);
  } catch (err) {
    state.lastError = String(err.message || err);
    log(state, { type: "system", ok: false, error: state.lastError });
  }

  saveState(state);
  return state;
}
