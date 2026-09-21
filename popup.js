async function load() {
  const all = await VCA.loadAll();
  const settings = all.settings;
  const st = VCA.crmStats(all.crm, settings);

  document.getElementById("caMonth").textContent = VCA.formatEuro(st.caMonth);
  document.getElementById("stock").textContent = String(st.stock);
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
      ? "La bulle (Messages, Négo, Repost, CRM, Colis, SAV) est en bas à droite."
      : "Bulle désactivée — réactivez-la ci-dessous.";
  } else {
    dot.className = "dot off";
    statusText.textContent = "Pas sur Vinted";
    pageHint.textContent = "Ouvrez vinted.fr ou vinted.com, ou le CRM ci-dessous.";
  }

  document.getElementById("btnOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("btnCrm").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("crm.html") });
  });
  document.getElementById("btnRepostNext").addEventListener("click", async () => {
    const res = await chrome.runtime.sendMessage({ type: "VCA_REPOST_NEXT" });
    pageHint.textContent = res?.ok ? "Ouverture du prochain article…" : (res?.error || "File vide");
  });

  btnToggle.addEventListener("click", async () => {
    const next = !(settings.bubbleEnabled !== false);
    settings.bubbleEnabled = next;
    await VCA.storageSet({ [VCA.KEYS.settings]: settings });
    btnToggle.textContent = next ? "Bulle : on" : "Bulle : off";
    if (onVinted) {
      pageHint.textContent = next
        ? "La bulle flottante est disponible en bas à droite."
        : "Bulle désactivée — réactivez-la ci-dessous.";
    }
  });
}

load();
