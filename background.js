/**
 * Service worker MV3 — alarmes locales, Mode auto, pont cloud 1.3.0.
 * Le Mode auto local s'arrête si cloudEnabled (XOR). Le worker distant tourne sans Chrome.
 */
/* global importScripts, VCA */
importScripts("lib/shared.js", "lib/nego.js", "lib/guard.js", "lib/cloud.js");

const ALARM_REPOST = "vca-repost";
const ALARM_INBOX = "vca-inbox-poll";
const PREFIX_SCHED = "vca-sched-";
const PREFIX_SAV = "vca-sav-";

async function syncRepostAlarm() {
  const { settings } = await VCA.loadAll();
  await chrome.alarms.clear(ALARM_REPOST);
  const minutes = Math.max(15, Number(settings.repostIntervalMinutes) || 60);
  await chrome.alarms.create(ALARM_REPOST, {
    delayInMinutes: minutes,
    periodInMinutes: minutes
  });
}

async function syncInboxAlarm() {
  const { settings } = await VCA.loadAll();
  await chrome.alarms.clear(ALARM_INBOX);
  if (!VCA.localAutoActive(settings)) return;
  const minutes = Math.max(1, Number(settings.autoInboxPollMinutes) || 1);
  await chrome.alarms.create(ALARM_INBOX, {
    delayInMinutes: minutes,
    periodInMinutes: minutes
  });
}

async function syncScheduleAlarms() {
  const all = await chrome.alarms.getAll();
  await Promise.all(
    all.filter((a) => a.name.startsWith(PREFIX_SCHED)).map((a) => chrome.alarms.clear(a.name))
  );
  const { schedule } = await VCA.loadAll();
  const now = Date.now();
  for (const job of schedule) {
    if (!job?.id || job.enabled === false) continue;
    const when = Date.parse(job.when);
    if (!Number.isFinite(when) || when <= now) continue;
    await chrome.alarms.create(PREFIX_SCHED + job.id, { when });
  }
}

async function syncPostsaleAlarms() {
  const all = await chrome.alarms.getAll();
  await Promise.all(
    all.filter((a) => a.name.startsWith(PREFIX_SAV)).map((a) => chrome.alarms.clear(a.name))
  );
  const { postsale } = await VCA.loadAll();
  const now = Date.now();
  for (const job of postsale) {
    if (!job?.id) continue;
    if (!job.thankYouDone && job.thankYouAt) {
      const t = Date.parse(job.thankYouAt);
      if (Number.isFinite(t) && t > now) {
        await chrome.alarms.create(`${PREFIX_SAV}${job.id}-merci`, { when: t });
      }
    }
    if (!job.reviewDone && job.reviewAt) {
      const t = Date.parse(job.reviewAt);
      if (Number.isFinite(t) && t > now) {
        await chrome.alarms.create(`${PREFIX_SAV}${job.id}-avis`, { when: t });
      }
    }
  }
}

async function syncAllAlarms() {
  await syncRepostAlarm();
  await syncInboxAlarm();
  await syncScheduleAlarms();
  await syncPostsaleAlarms();
}

async function rememberNotifyUrl(notifId, url) {
  const data = await VCA.storageGet([VCA.KEYS.notifyUrls]);
  const map = data[VCA.KEYS.notifyUrls] || {};
  map[notifId] = url;
  const keys = Object.keys(map);
  if (keys.length > 40) {
    keys.slice(0, keys.length - 40).forEach((k) => delete map[k]);
  }
  await VCA.storageSet({ [VCA.KEYS.notifyUrls]: map });
}

function notify(id, title, message, url) {
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message: message || "",
    priority: 1
  });
  if (url) rememberNotifyUrl(id, url);
}

async function updateBadge() {
  const { settings } = await VCA.loadAll();
  if (VCA.localAutoActive(settings)) {
    const g = await VCA.loadGuard();
    chrome.action.setBadgeBackgroundColor({ color: "#c23b3b" });
    chrome.action.setBadgeText({ text: g.state.messagesSent > 0 ? String(g.state.messagesSent) : "ON" });
    chrome.action.setTitle({ title: "Vinted Chine Assist — Mode auto ON" });
  } else {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Vinted Chine Assist" });
  }
}

async function writeLog(entry) {
  const g = await VCA.loadGuard();
  const log = VCA.appendAutoLog(g.log, entry);
  await VCA.saveGuard(g.state, log);
}

let reserveChain = Promise.resolve();

async function reserveGuard(kind, conversationId, processKey) {
  const run = async () => {
  const g = await VCA.loadGuard();
  const check = VCA.guardCheck(g.settings, g.state, kind, conversationId);
  if (!check.ok) {
    await writeLog({
      type: kind,
      target: conversationId || "",
      ok: false,
      error: check.reason,
      detail: VCA.guardReasonLabel(check.reason)
    });
    return { ok: false, reason: check.reason, waitSeconds: check.waitSeconds };
  }
  if (processKey && VCA.wasProcessed(g.state, processKey)) {
    return { ok: false, reason: "already" };
  }
  let state = VCA.guardRecord(g.state, kind, conversationId);
  if (processKey) state = VCA.markProcessed(state, processKey);
  await VCA.saveGuard(state, g.log);
  await updateBadge();
  return { ok: true };
  };
  const done = reserveChain.then(run, run);
  reserveChain = done.catch(() => {});
  return done;
}

async function nextRepostItem(rotate) {
  const { repost } = await VCA.loadAll();
  if (!repost.length) return null;
  const item = repost[0];
  if (rotate) {
    const rest = repost.slice(1);
    item.lastOpenedAt = new Date().toISOString();
    rest.push(item);
    await VCA.storageSet({ [VCA.KEYS.repost]: rest });
  }
  return item;
}

async function openUrl(url, active) {
  if (!url) return { ok: false };
  const tab = await chrome.tabs.create({ url, active: active !== false });
  return { ok: true, tabId: tab.id };
}

function waitTabComplete(tabId, ms) {
  const limit = ms || 20000;
  const start = Date.now();
  return new Promise((resolve) => {
    const t = setInterval(async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete" && Date.now() - start > 800) {
          clearInterval(t);
          resolve(tab);
        }
      } catch (_) {
        clearInterval(t);
        resolve(null);
      }
      if (Date.now() - start > limit) {
        clearInterval(t);
        resolve(null);
      }
    }, 400);
  });
}

async function pingTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    return { ok: false, error: "no-content" };
  }
}

async function vintedTabs() {
  const tabs = await chrome.tabs.query({
    url: ["https://www.vinted.fr/*", "https://www.vinted.com/*"]
  });
  return tabs || [];
}

async function ensureInboxTab() {
  const tabs = await vintedTabs();
  const inbox = tabs.find((t) => /\/inbox/i.test(t.url || ""));
  if (inbox) return inbox;
  const any = tabs[0];
  if (any) {
    const origin = (any.url || "").startsWith("https://www.vinted.com")
      ? "https://www.vinted.com"
      : "https://www.vinted.fr";
    const created = await chrome.tabs.create({ url: `${origin}/inbox`, active: false });
    await waitTabComplete(created.id);
    return created;
  }
  const created = await chrome.tabs.create({ url: "https://www.vinted.fr/inbox", active: false });
  await waitTabComplete(created.id);
  return created;
}

async function tickInboxTabs() {
  const { settings } = await VCA.loadAll();
  if (!VCA.localAutoActive(settings)) return { skipped: settings.cloudEnabled ? "cloud" : "off" };
  let tabs = await vintedTabs();
  if (!tabs.length) {
    const inbox = await ensureInboxTab();
    tabs = inbox ? [inbox] : [];
  }
  const results = [];
  for (const tab of tabs) {
    if (!tab.id) continue;
    const res = await pingTab(tab.id, { type: "VCA_AUTO_TICK" });
    results.push({ tabId: tab.id, url: tab.url, res });
    if (res?.unread?.length) {
      const href = res.unread[0];
      const existing = tabs.find((t) => t.url && href && t.url.split("?")[0] === href.split("?")[0]);
      if (!existing) {
        const opened = await chrome.tabs.create({ url: href, active: false });
        await waitTabComplete(opened.id, 12000);
        await new Promise((r) => setTimeout(r, 1200));
        results.push({
          tabId: opened.id,
          url: href,
          res: await pingTab(opened.id, { type: "VCA_AUTO_SEND_NEGO" })
        });
      }
    }
  }
  return { ok: true, results };
}

async function executeAutoRepost() {
  const { settings, repost } = await VCA.loadAll();
  if (!repost.length) return { ok: false, error: "File vide" };
  const item = repost[0];
  if (!VCA.localAutoActive(settings) || !settings.autoRepostDo) {
    notify("vca-repost-" + Date.now(), "Repost — prochain article", item.title || item.url, item.url);
    if (settings.repostAutoOpen && item.url) {
      await openUrl(item.url, true);
      await nextRepostItem(true);
    }
    return { ok: true, mode: "notify" };
  }
  const gate = await reserveGuard("repost", item.id || item.url, `repost:${item.id || item.url}:${item.lastOpenedAt || ""}`);
  if (!gate.ok) {
    notify("vca-repost-skip", "Repost reporté", VCA.guardReasonLabel(gate.reason), item.url);
    return { ok: false, reason: gate.reason };
  }
  if (!item.url) return { ok: false, error: "no-url" };
  const tab = await chrome.tabs.create({ url: item.url, active: false });
  await waitTabComplete(tab.id);
  await new Promise((r) => setTimeout(r, 1400));
  let res = await pingTab(tab.id, { type: "VCA_AUTO_REPOST_THIS" });
  if (res?.mode === "goto-edit") {
    await waitTabComplete(tab.id, 15000);
    await new Promise((r) => setTimeout(r, 1600));
    res = await pingTab(tab.id, { type: "VCA_AUTO_REPOST_THIS" });
  }
  await nextRepostItem(true);
  await writeLog({
    type: "repost",
    target: item.url,
    ok: !!res?.ok,
    error: res?.error || "",
    detail: res?.mode || ""
  });
  notify(
    "vca-repost-" + Date.now(),
    res?.ok ? "Repost auto effectué" : "Repost auto — échec",
    item.title || item.url,
    item.url
  );
  return res || { ok: false };
}

async function executeAutoPostsale(job, kind) {
  const { settings } = await VCA.loadAll();
  if (!job) return;
  if (!VCA.localAutoActive(settings) || !settings.autoPostSaleSend) {
    notify(
      "vca-sav-" + job.id,
      kind === "avis" ? "Demande d'avis" : "Remerciement post-vente",
      job.title || "",
      job.url
    );
    return { mode: "notify" };
  }
  if (!job.url) {
    await writeLog({ type: "postsale", target: job.id, ok: false, error: "no-url" });
    return { ok: false };
  }
  const tab = await chrome.tabs.create({ url: job.url, active: false });
  await waitTabComplete(tab.id);
  await new Promise((r) => setTimeout(r, 1200));
  const res = await pingTab(tab.id, { type: "VCA_AUTO_SEND_SAV", kind });
  if (res?.ok) {
    const { postsale } = await VCA.loadAll();
    const j = postsale.find((x) => x.id === job.id);
    if (j) {
      if (kind === "avis") j.reviewDone = true;
      else j.thankYouDone = true;
      await VCA.storageSet({ [VCA.KEYS.postsale]: postsale });
    }
  }
  return res;
}

async function setModeAuto(on) {
  const all = await VCA.loadAll();
  if (on && all.settings.cloudEnabled) {
    return { ok: false, error: "cloud-xor", modeAuto: false };
  }
  all.settings.modeAuto = !!on;
  await VCA.storageSet({ [VCA.KEYS.settings]: all.settings });
  const tabs = await vintedTabs();
  await Promise.all(tabs.map((t) => pingTab(t.id, { type: on ? "VCA_AUTO_RESUME" : "VCA_AUTO_KILL" })));
  await syncInboxAlarm();
  await updateBadge();
  await writeLog({
    type: "system",
    target: "",
    ok: true,
    detail: on ? "Mode auto activé" : "Mode auto / STOP"
  });
  return { ok: true, modeAuto: !!on };
}

async function openUrlsStaggered(urls) {
  const list = (urls || []).filter(Boolean).slice(0, 5);
  for (let i = 0; i < list.length; i += 1) {
    await chrome.tabs.create({ url: list[i] });
    if (i < list.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return { ok: true, count: list.length };
}

chrome.runtime.onInstalled.addListener(async () => {
  await VCA.ensureInstalledDefaults();
  await syncAllAlarms();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncAllAlarms();
  await updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[VCA.KEYS.settings] || changes[VCA.KEYS.repost]) {
    syncRepostAlarm();
    syncInboxAlarm();
    updateBadge();
  }
  if (changes[VCA.KEYS.schedule]) syncScheduleAlarms();
  if (changes[VCA.KEYS.postsale]) syncPostsaleAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const name = alarm?.name || "";
  if (name === ALARM_INBOX) {
    await tickInboxTabs();
    return;
  }
  if (name === ALARM_REPOST) {
    await executeAutoRepost();
    return;
  }
  if (name.startsWith(PREFIX_SCHED)) {
    const id = name.slice(PREFIX_SCHED.length);
    const { schedule } = await VCA.loadAll();
    const job = schedule.find((j) => j.id === id);
    if (!job) return;
    notify("vca-sched-" + id, job.title || "Rappel planifié", job.url || "", job.url);
    if (job.url) await openUrl(job.url);
    job.lastFiredAt = new Date().toISOString();
    job.enabled = false;
    await VCA.storageSet({ [VCA.KEYS.schedule]: schedule });
    return;
  }
  if (name.startsWith(PREFIX_SAV)) {
    const rest = name.slice(PREFIX_SAV.length);
    const isAvis = rest.endsWith("-avis");
    const jobId = rest.replace(/-(merci|avis)$/, "");
    const { postsale } = await VCA.loadAll();
    const job = postsale.find((j) => j.id === jobId);
    if (!job) return;
    await executeAutoPostsale(job, isAvis ? "avis" : "merci");
  }
});

chrome.notifications.onClicked.addListener(async (id) => {
  const data = await VCA.storageGet([VCA.KEYS.notifyUrls]);
  const url = (data[VCA.KEYS.notifyUrls] || {})[id];
  if (url) await openUrl(url);
});

async function callOpenAi(settings, payload) {
  const key = (settings.openaiApiKey || "").trim();
  if (!key) return { ok: false, error: "no-key" };
  const base = (settings.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const body = {
    model: settings.openaiModel || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: "Tu aides un vendeur Vinted. Réponds UNIQUEMENT en JSON {\"suggested\": number, \"message\": string}. Ne propose jamais un prix sous le plancher fourni. Français, poli, court."
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ]
  };
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `HTTP ${res.status}`, detail: t.slice(0, 200) };
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "Réponse IA non JSON" };
    const parsed = JSON.parse(match[0]);
    return { ok: true, suggested: parsed.suggested, message: parsed.message };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const type = msg?.type;
  if (type === "VCA_PING") {
    (async () => {
      const { settings } = await VCA.loadAll();
      sendResponse({
        ok: true,
        version: VCA.VERSION,
        cloud: false,
        cloudConfigured: !!settings.cloudEnabled
      });
    })();
    return true;
  }
  if (type === "VCA_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  if (type === "VCA_OPEN_PAGE") {
    const page = msg.page === "crm" ? "crm.html" : msg.page === "slip" ? "packing-slip.html" : "options.html";
    const q = msg.query ? `?${msg.query}` : "";
    chrome.tabs.create({ url: chrome.runtime.getURL(page + q) });
    sendResponse({ ok: true });
    return true;
  }
  if (type === "VCA_OPEN_URL") {
    openUrl(msg.url).then(sendResponse);
    return true;
  }
  if (type === "VCA_OPEN_URLS") {
    openUrlsStaggered(msg.urls).then(sendResponse);
    return true;
  }
  if (type === "VCA_REPOST_NEXT") {
    executeAutoRepost().then(sendResponse);
    return true;
  }
  if (type === "VCA_NOTIFY") {
    notify("vca-msg-" + Date.now(), msg.title || "Vinted Chine Assist", msg.message || "", msg.url);
    sendResponse({ ok: true });
    return true;
  }
  if (type === "VCA_SYNC_ALARMS") {
    syncAllAlarms().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (type === "VCA_SET_MODE_AUTO") {
    setModeAuto(!!msg.on).then(sendResponse);
    return true;
  }
  if (type === "VCA_KILL_AUTO") {
    setModeAuto(false).then(sendResponse);
    return true;
  }
  if (type === "VCA_GUARD_RESERVE") {
    reserveGuard(msg.kind || "message", msg.conversationId, msg.processKey).then(sendResponse);
    return true;
  }
  if (type === "VCA_AUTO_LOG") {
    writeLog(msg).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (type === "VCA_AUTO_STATUS") {
    (async () => {
      const all = await VCA.loadAll();
      const g = await VCA.loadGuard();
      sendResponse({
        ok: true,
        modeAuto: VCA.localAutoActive(all.settings),
        cloudEnabled: !!all.settings.cloudEnabled,
        cloudUrl: all.settings.cloudUrl || "",
        settings: {
          autoDailyMessageCap: all.settings.autoDailyMessageCap,
          autoDailyRepostCap: all.settings.autoDailyRepostCap,
          autoMinDelaySeconds: all.settings.autoMinDelaySeconds
        },
        state: g.state,
        log: g.log.slice(0, 12)
      });
    })();
    return true;
  }
  if (type === "VCA_CLOUD_HEALTH") {
    VCA.cloudHealth(msg.url || "").then(sendResponse);
    return true;
  }
  if (type === "VCA_CLOUD_STATUS") {
    (async () => {
      const { settings } = await VCA.loadAll();
      const url = msg.url || settings.cloudUrl;
      const token = msg.token || settings.cloudToken;
      const health = await VCA.cloudHealth(url);
      if (!health.ok) {
        sendResponse(health);
        return;
      }
      const st = await VCA.cloudRequest(url, token, "/api/status");
      sendResponse(st);
    })();
    return true;
  }
  if (type === "VCA_AI_NEGO") {
    (async () => {
      const { settings } = await VCA.loadAll();
      const local = VCA.computeNego(msg.input || {});
      if (!settings.openaiApiKey) {
        sendResponse({ ok: true, local, ai: { ok: false, error: "no-key" } });
        return;
      }
      const ai = await callOpenAi(settings, {
        listPrice: local.listPrice,
        offer: local.offer,
        floor: local.floor,
        target: local.target,
        localAction: local.action,
        localSuggested: local.suggested,
        article: msg.article || "",
        nom: msg.nom || ""
      });
      let merged = local;
      if (ai.ok) merged = VCA.clampAiResult(local, ai.suggested);
      sendResponse({ ok: true, local: merged, ai, message: ai.message || null });
    })();
    return true;
  }
  return false;
});
