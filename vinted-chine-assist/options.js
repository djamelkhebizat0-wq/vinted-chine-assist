const DEFAULT_TEMPLATES = {
  favoris: [
    {
      id: "fav-urgence",
      label: "Favori — urgence",
      text: "Bonjour ! 👋 Je vois que vous aimez mon article. Il y a déjà plusieurs personnes intéressées — si vous le souhaitez, je peux vous le réserver rapidement. Dites-moi !"
    },
    {
      id: "fav-offre",
      label: "Favori — petite offre",
      text: "Bonjour ! Merci pour le ❤️ sur mon article. Je peux vous faire une petite réduction si vous achetez rapidement — faites-moi une offre ou dites-moi ce qui vous ferait plaisir 🙂"
    },
    {
      id: "fav-bundle",
      label: "Favori — lot",
      text: "Bonjour ! Vous avez mis plusieurs de mes articles en favoris. Je peux vous préparer un lot avec une réduction + frais groupés. Intéressé(e) ?"
    }
  ],
  reponsesRapides: [
    {
      id: "rr-dispo",
      label: "Toujours dispo",
      text: "Oui, l'article est toujours disponible ! 🙂"
    },
    {
      id: "rr-mesure",
      label: "Mesures",
      text: "Bien sûr, je peux vous envoyer les mesures précises. Que souhaitez-vous exactement (longueur, largeur, etc.) ?"
    },
    {
      id: "rr-etat",
      label: "État / défauts",
      text: "L'article est en bon état, comme sur les photos. Si un détail vous inquiète, dites-moi et je regarde de plus près !"
    },
    {
      id: "rr-envoi",
      label: "Envoi rapide",
      text: "Dès l'achat validé, j'expédie sous 24–48 h avec suivi. Merci pour votre confiance !"
    },
    {
      id: "rr-contre",
      label: "Contre-offre polie",
      text: "Merci pour votre offre ! Je ne peux pas descendre autant, mais je peux vous proposer {{contre}} € — ça vous irait ?"
    },
    {
      id: "rr-accepte",
      label: "Accepter offre",
      text: "Parfait, j'accepte votre offre ! Vous pouvez finaliser l'achat quand vous voulez. Merci 🙂"
    }
  ]
};

const DEFAULT_SETTINGS = {
  negotiationFloorPercent: 15,
  suggestCounterPercent: 8,
  bubbleEnabled: true
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let state = {
  settings: clone(DEFAULT_SETTINGS),
  templates: clone(DEFAULT_TEMPLATES)
};

function showToast(msg, ok = true) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  el.className = "toast" + (ok ? " ok" : "");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

function renderList(containerId, items, kind) {
  const root = document.getElementById(containerId);
  root.innerHTML = "";
  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "tpl-card";
    card.dataset.index = String(index);

    const row = document.createElement("div");
    row.className = "row1";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = item.label || "";
    labelInput.placeholder = "Libellé";
    labelInput.addEventListener("input", () => {
      item.label = labelInput.value;
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "Supprimer";
    del.addEventListener("click", () => {
      items.splice(index, 1);
      renderAll();
    });

    row.appendChild(labelInput);
    row.appendChild(del);

    const ta = document.createElement("textarea");
    ta.value = item.text || "";
    ta.placeholder = "Texte du message…";
    ta.addEventListener("input", () => {
      item.text = ta.value;
    });

    card.appendChild(row);
    card.appendChild(ta);
    root.appendChild(card);
  });

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "desc";
    empty.textContent = kind === "favoris"
      ? "Aucun message favori. Ajoutez-en un."
      : "Aucune réponse rapide. Ajoutez-en une.";
    root.appendChild(empty);
  }
}

function renderAll() {
  document.getElementById("floorPct").value = state.settings.negotiationFloorPercent;
  document.getElementById("counterPct").value = state.settings.suggestCounterPercent;
  document.getElementById("bubbleEnabled").checked = state.settings.bubbleEnabled !== false;
  renderList("favorisList", state.templates.favoris, "favoris");
  renderList("rrList", state.templates.reponsesRapides, "rr");
}

function readFormSettings() {
  const floor = Number(document.getElementById("floorPct").value);
  const counter = Number(document.getElementById("counterPct").value);
  state.settings.negotiationFloorPercent = Number.isFinite(floor) ? Math.min(50, Math.max(0, floor)) : 15;
  state.settings.suggestCounterPercent = Number.isFinite(counter) ? Math.min(40, Math.max(0, counter)) : 8;
  state.settings.bubbleEnabled = document.getElementById("bubbleEnabled").checked;
}

async function load() {
  const data = await chrome.storage.local.get(["vca_settings", "vca_templates"]);
  state.settings = { ...clone(DEFAULT_SETTINGS), ...(data.vca_settings || {}) };
  state.templates = data.vca_templates
    ? clone(data.vca_templates)
    : clone(DEFAULT_TEMPLATES);
  if (!Array.isArray(state.templates.favoris)) state.templates.favoris = [];
  if (!Array.isArray(state.templates.reponsesRapides)) state.templates.reponsesRapides = [];
  renderAll();
}

async function save() {
  readFormSettings();
  await chrome.storage.local.set({
    vca_settings: state.settings,
    vca_templates: state.templates
  });
  showToast("Paramètres enregistrés");
}

document.getElementById("btnSave").addEventListener("click", save);

document.getElementById("btnReset").addEventListener("click", async () => {
  if (!confirm("Réinitialiser tous les modèles et seuils par défaut ?")) return;
  state.settings = clone(DEFAULT_SETTINGS);
  state.templates = clone(DEFAULT_TEMPLATES);
  renderAll();
  await chrome.storage.local.set({
    vca_settings: state.settings,
    vca_templates: state.templates
  });
  showToast("Valeurs par défaut restaurées");
});

document.getElementById("btnAddFav").addEventListener("click", () => {
  state.templates.favoris.push({
    id: uid("fav"),
    label: "Nouveau favori",
    text: ""
  });
  renderAll();
});

document.getElementById("btnAddRr").addEventListener("click", () => {
  state.templates.reponsesRapides.push({
    id: uid("rr"),
    label: "Nouvelle réponse",
    text: ""
  });
  renderAll();
});

load();
