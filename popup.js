function renderLog(log) {
  const ul = document.getElementById("autoLog");
  ul.innerHTML = "";
  (log || []).slice(0, 6).forEach((e) => {
    const li = document.createElement("li");
    const t = (e.ts || "").replace("T", " ").slice(11, 19);
    li.className = e.ok ? "ok" : "err";
    li.textContent = `${t} · ${e.type} · ${e.ok ? "ok" : (e.error || "échec")} ${e.target || ""}`;
    ul.appendChild(li);
  });
  if (!log?.length) {
    ul.innerHTML = "<li>Aucune action auto pour l’instant.</li>";
  }
}

async function refreshAutoCard() {
  const st = await chrome.runtime.sendMessage({ type: "VCA_AUTO_STATUS" });
  const on = !!st?.modeAuto;
  const dot = document.getElementById("autoDot");
  const hint = document.getElementById("autoHint");
  const btn = document.getElementById("btnModeAuto");
  const caps = document.getElementById("autoCaps");
  dot.className = "dot " + (on ? "on" : "off");
  btn.textContent = on ? "Mode auto : ON" : "Activer Mode auto";
  if (st?.cloudEnabled) {
    hint.textContent = "Cloud activé : Mode auto local coupé (XOR). Le worker distant envoie s’il est vraiment joignable.";
    btn.textContent = "Local coupé (cloud)";
    btn.disabled = true;
  } else {
    hint.textContent = on
      ? "Envoi réel actif (négo / repost / post-vente) tant que Chrome est ouvert."
      : "Désactivé. Insertion manuelle uniquement — rien n’est envoyé tout seul.";
    btn.disabled = false;
  }
  const s = st?.state || {};
  const cap = st?.settings || {};
  caps.textContent = `Messages ${s.messagesSent || 0}/${cap.autoDailyMessageCap || 40} · Reposts ${s.repostsDone || 0}/${cap.autoDailyRepostCap || 20} · délai ${cap.autoMinDelaySeconds || 60}s`;
  renderLog(st?.log);
  return st;
}

async function refreshRadarCard() {
  const st = await chrome.runtime.sendMessage({ type: "VCA_RADAR_STATUS" });
  const ul = document.getElementById("radarInbox");
  const hint = document.getElementById("radarHint");
  const dot = document.getElementById("radarDot");
  if (!ul) return st;
  const inbox = st?.inbox || [];
  ul.innerHTML = "";
  inbox.slice(0, 8).forEach((d) => {
    const li = document.createElement("li");
    li.className = "score-" + (d.score || "C");
    li.textContent = `${d.score} · ${VCA.formatEuro(d.price)} € · ${(d.title || "").slice(0, 36)}`;
    li.title = d.url || "";
    li.style.cursor = d.url ? "pointer" : "default";
    if (d.url) {
      li.addEventListener("click", () => chrome.tabs.create({ url: d.url }));
    }
    ul.appendChild(li);
  });
  if (!inbox.length) ul.innerHTML = "<li>Aucune affaire scorée. Scanner une recherche Vinted.</li>";
  const unread = Number(st?.unread) || 0;
  if (dot) dot.className = "dot " + (unread > 0 ? "on" : (st?.enabled === false ? "off" : "on"));
  if (hint) {
    hint.textContent = unread
      ? `${unread} nouvelle(s) A — pastille icône (sans son).`
      : (st?.enabled === false ? "Radar OFF dans les paramètres." : "Score A → pastille + notif silencieuse.");
  }
  if (unread) await chrome.runtime.sendMessage({ type: "VCA_RADAR_MARK_READ" });
  return st;
}

async function refreshCloudCard() {
  const all = await VCA.loadAll();
  const dot = document.getElementById("cloudDot");
  const hint = document.getElementById("cloudHint");
  if (!dot || !hint) return;
  const url = all.settings.cloudUrl;
  if (!url) {
    dot.className = "dot off";
    hint.textContent = "Déconnecté — aucune URL. Paramètres → Cloud.";
    return;
  }
  const health = await VCA.cloudHealth(url);
  if (!health.ok) {
    dot.className = "dot err";
    hint.textContent = (health.status === "error" ? "Erreur" : "Déconnecté") + " — " + (health.error || "health KO");
    return;
  }
  dot.className = "dot on";
  const wanted = all.settings.cloudEnabled ? " · worker demandé ON" : " · worker localement OFF";
  hint.textContent = "Connecté (/health ok)" + wanted;
}

async function load() {
  const all = await VCA.loadAll();
  const settings = all.settings;
  const crm = VCA.crmStats(all.crm, settings);

  document.getElementById("caMonth").textContent = VCA.formatEuro(crm.caMonth);
  document.getElementById("stock").textContent = String(crm.stock);
  document.getElementById("queue").textContent = String(all.repost.length);

  const btnToggle = document.getElementById("btnToggleBubble");
  const enabled = settings.bubbleEnabled !== false;
  btnToggle.textContent = enabled ? "Bulle : on" : "Bulle : off";

  let onVinted = false;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";
    onVinted = /https:\/\/www\.vinted\.(fr|com)\//.test(url);
  } catch (_) { /* ignore */ }

  const dot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const pageHint = document.getElementById("pageHint");
  if (onVinted) {
    dot.className = "dot on";
    statusText.textContent = "Page Vinted détectée";
    pageHint.textContent = enabled
      ? "La bulle est en bas à droite. Mode auto : ci-dessus."
      : "Bulle désactivée — réactivez-la ci-dessous.";
  } else {
    dot.className = "dot off";
    statusText.textContent = "Pas sur Vinted";
    pageHint.textContent = "Ouvrez vinted.fr (session connectée) pour l’auto.";
  }

  await refreshAutoCard();
  await refreshCloudCard();
  await refreshRadarCard();

  document.getElementById("btnRadarOpts")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html?tab=radar") });
  });
  document.getElementById("btnRadarScan")?.addEventListener("click", async () => {
    const hint = document.getElementById("radarHint");
    if (hint) hint.textContent = "Scan…";
    const res = await chrome.runtime.sendMessage({ type: "VCA_RADAR_SCAN" });
    await refreshRadarCard();
    if (hint) {
      hint.textContent = res?.ok
        ? `${res.scored || 0} scorée(s) · ${res.alerts || 0} A`
        : (res?.skipped === "off" ? "Radar désactivé." : "Ouvrez vinted.fr / une recherche.");
    }
  });
  document.getElementById("btnCloud")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html?tab=cloud") });
  });
  document.getElementById("btnOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("btnCrm").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("crm.html") });
  });
  document.getElementById("btnRepostNext").addEventListener("click", async () => {
    const res = await chrome.runtime.sendMessage({ type: "VCA_REPOST_NEXT" });
    pageHint.textContent = res?.ok ? "Repost lancé…" : (res?.error || res?.reason || "File vide");
  });
  document.getElementById("btnModeAuto").addEventListener("click", async () => {
    const cur = await chrome.runtime.sendMessage({ type: "VCA_AUTO_STATUS" });
    if (cur?.cloudEnabled) {
      pageHint.textContent = "Cloud actif : Mode auto local désactivé (XOR).";
      return;
    }
    const next = !cur?.modeAuto;
    if (next && !confirm("Activer le Mode auto ? Les réponses / reposts / post-vente partiront seuls (caps + délai). Chrome doit rester ouvert.")) {
      return;
    }
    await chrome.runtime.sendMessage({ type: "VCA_SET_MODE_AUTO", on: next });
    await refreshAutoCard();
  });
  document.getElementById("btnKill").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "VCA_KILL_AUTO" });
    if (settings.cloudEnabled && settings.cloudUrl) {
      await VCA.cloudRequest(settings.cloudUrl, settings.cloudToken, "/api/kill", { method: "POST", body: {} });
      settings.cloudEnabled = false;
      await VCA.storageSet({ [VCA.KEYS.settings]: settings });
    }
    await refreshAutoCard();
    await refreshCloudCard();
    pageHint.textContent = "STOP : plus aucun envoi auto (local + cloud si joignable).";
  });

  btnToggle.addEventListener("click", async () => {
    const next = !(settings.bubbleEnabled !== false);
    settings.bubbleEnabled = next;
    await VCA.storageSet({ [VCA.KEYS.settings]: settings });
    btnToggle.textContent = next ? "Bulle : on" : "Bulle : off";
  });
}

load();
