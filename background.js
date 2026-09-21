/**
 * Service worker MV3 — alarmes locales, notifications, IA optionnelle, navigation.
 * Rien n'est envoyé vers un « cloud Vinted Chine Assist » : tout reste dans Chrome.
 */
/* global importScripts, VCA */
importScripts("lib/shared.js", "lib/nego.js");

const ALARM_REPOST = "vca-repost";
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

async function openUrl(url) {
  if (!url) return { ok: false };
  await chrome.tabs.create({ url });
  return { ok: true };
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
  await syncRepostAlarm();
  await syncScheduleAlarms();
  await syncPostsaleAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncRepostAlarm();
  await syncScheduleAlarms();
  await syncPostsaleAlarms();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[VCA.KEYS.settings] || changes[VCA.KEYS.repost]) {
    syncRepostAlarm();
  }
  if (changes[VCA.KEYS.schedule]) syncScheduleAlarms();
  if (changes[VCA.KEYS.postsale]) syncPostsaleAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const name = alarm?.name || "";
  if (name === ALARM_REPOST) {
    const { settings, repost } = await VCA.loadAll();
    if (!repost.length) return;
    const item = repost[0];
    notify(
      "vca-repost-" + Date.now(),
      "Repost — prochain article",
      item.title || item.url || "Article en file",
      item.url
    );
    if (settings.repostAutoOpen && item.url) {
      await openUrl(item.url);
      await nextRepostItem(true);
    }
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
    const kind = isAvis ? "Demande d'avis" : "Remerciement post-vente";
    notify(
      name + "-" + Date.now(),
      kind,
      job.title || "Ouvrir la conversation",
      job.url
    );
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
    sendResponse({ ok: true, version: VCA.VERSION, cloud: false });
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
    nextRepostItem(true).then(async (item) => {
      if (!item) {
        sendResponse({ ok: false, error: "File vide" });
        return;
      }
      if (item.url) await openUrl(item.url);
      sendResponse({ ok: true, item });
    });
    return true;
  }
  if (type === "VCA_NOTIFY") {
    notify("vca-msg-" + Date.now(), msg.title || "Vinted Chine Assist", msg.message || "", msg.url);
    sendResponse({ ok: true });
    return true;
  }
  if (type === "VCA_SYNC_ALARMS") {
    Promise.all([syncRepostAlarm(), syncScheduleAlarms(), syncPostsaleAlarms()]).then(() => {
      sendResponse({ ok: true });
    });
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
  if (type === "VCA_REQUEST_AI_PERMISSION") {
    chrome.permissions.request({ origins: ["https://*/*"] }, (granted) => {
      sendResponse({ ok: !!granted });
    });
    return true;
  }
  return false;
});
