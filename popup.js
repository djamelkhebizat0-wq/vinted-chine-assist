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
  hint.textContent = on
    ? "Envoi réel actif (négo / repost / post-vente) tant que Chrome est ouvert."
    : "Désactivé. Insertion manuelle uniquement — rien n’est envoyé tout seul.";
  const s = st?.state || {};
  const cap = st?.settings || {};
  caps.textContent = `Messages ${s.messagesSent || 0}/${cap.autoDailyMessageCap || 40} · Reposts ${s.repostsDone || 0}/${cap.autoDailyRepostCap || 20} · délai ${cap.autoMinDelaySeconds || 60}s`;
  renderLog(st?.log);
  return st;
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
    const next = !cur?.modeAuto;
    if (next && !confirm("Activer le Mode auto ? Les réponses / reposts / post-vente partiront seuls (caps + délai). Chrome doit rester ouvert.")) {
      return;
    }
    await chrome.runtime.sendMessage({ type: "VCA_SET_MODE_AUTO", on: next });
    await refreshAutoCard();
  });
  document.getElementById("btnKill").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "VCA_KILL_AUTO" });
    await refreshAutoCard();
    pageHint.textContent = "STOP : plus aucun envoi auto.";
  });

  btnToggle.addEventListener("click", async () => {
    const next = !(settings.bubbleEnabled !== false);
    settings.bubbleEnabled = next;
    await VCA.storageSet({ [VCA.KEYS.settings]: settings });
    btnToggle.textContent = next ? "Bulle : on" : "Bulle : off";
  });
}

load();
