const DEFAULT_TEMPLATES = {
  favoris: [
    { id: "fav-urgence", label: "Favori — urgence", text: "Bonjour ! 👋 Je vois que vous aimez mon article. Il y a déjà plusieurs personnes intéressées — si vous le souhaitez, je peux vous le réserver rapidement. Dites-moi !" },
    { id: "fav-offre", label: "Favori — petite offre", text: "Bonjour ! Merci pour le ❤️ sur mon article. Je peux vous faire une petite réduction si vous achetez rapidement — faites-moi une offre ou dites-moi ce qui vous ferait plaisir 🙂" },
    { id: "fav-bundle", label: "Favori — lot", text: "Bonjour ! Vous avez mis plusieurs de mes articles en favoris. Je peux vous préparer un lot avec une réduction + frais groupés. Intéressé(e) ?" }
  ],
  reponsesRapides: [
    { id: "rr-dispo", label: "Toujours dispo", text: "Oui, l'article est toujours disponible ! 🙂" },
    { id: "rr-mesure", label: "Mesures", text: "Bien sûr, je peux vous envoyer les mesures précises. Que souhaitez-vous exactement (longueur, largeur, etc.) ?" },
    { id: "rr-etat", label: "État / défauts", text: "L'article est en bon état, comme sur les photos. Si un détail vous inquiète, dites-moi et je regarde de plus près !" },
    { id: "rr-envoi", label: "Envoi rapide", text: "Dès l'achat validé, j'expédie sous 24–48 h avec suivi. Merci pour votre confiance !" },
    { id: "rr-contre", label: "Contre-offre polie", text: "Merci pour votre offre ! Je ne peux pas descendre autant, mais je peux vous proposer {{contre}} € — ça vous irait ?" },
    { id: "rr-accepte", label: "Accepter offre", text: "Parfait, j'accepte votre offre ! Vous pouvez finaliser l'achat quand vous voulez. Merci 🙂" }
  ]
};

async function load() {
  const data = await chrome.storage.local.get(["vca_settings", "vca_templates"]);
  const settings = data.vca_settings || {
    negotiationFloorPercent: 15,
    suggestCounterPercent: 8,
    bubbleEnabled: true
  };
  const templates = data.vca_templates || DEFAULT_TEMPLATES;

  document.getElementById("favCount").textContent = String(templates.favoris?.length ?? 0);
  document.getElementById("rrCount").textContent = String(templates.reponsesRapides?.length ?? 0);
  document.getElementById("floorPct").textContent = `${settings.negotiationFloorPercent ?? 15}%`;

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
      ? "La bulle flottante est disponible en bas à droite."
      : "Bulle désactivée — réactivez-la ci-dessous.";
  } else {
    dot.className = "dot off";
    statusText.textContent = "Pas sur Vinted";
    pageHint.textContent = "Ouvrez vinted.fr ou vinted.com pour utiliser l'assistant.";
  }

  document.getElementById("btnOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  btnToggle.addEventListener("click", async () => {
    const next = !(settings.bubbleEnabled !== false);
    settings.bubbleEnabled = next;
    await chrome.storage.local.set({ vca_settings: settings });
    btnToggle.textContent = next ? "Bulle : on" : "Bulle : off";
    if (onVinted) {
      pageHint.textContent = next
        ? "La bulle flottante est disponible en bas à droite."
        : "Bulle désactivée — réactivez-la ci-dessous.";
    }
  });
}

load();
