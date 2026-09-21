(() => {
  "use strict";

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

  const REPOST_CHECKLIST = [
    "Photos nettes (lumière naturelle, fond simple)",
    "Titre clair + marque / taille / état",
    "Description honnête (défauts mentionnés)",
    "Prix cohérent avec le marché Vinted",
    "Hashtags / mots-clés utiles dans le titre",
    "Répondre vite aux messages après republication"
  ];

  let settings = { ...DEFAULT_SETTINGS };
  let templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  let lastCounter = null;
  let root = null;

  function parseMoney(str) {
    if (str == null || str === "") return null;
    const cleaned = String(str)
      .replace(/\s/g, "")
      .replace(/€/g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function formatEuro(n) {
    return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
  }

  function findChatInput() {
    const selectors = [
      'textarea[data-testid*="message"]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="écrire" i]',
      'textarea[placeholder*="ecrire" i]',
      'div[contenteditable="true"][data-testid*="message"]',
      'div[contenteditable="true"][role="textbox"]',
      '[data-testid="inbox-message-form"] textarea',
      '[data-testid="inbox-reply"] textarea',
      "form textarea",
      'textarea[name="body"]',
      'div[contenteditable="true"]'
    ];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      for (const el of nodes) {
        if (!el || el.closest("#vca-root")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 16) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        return el;
      }
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function insertText(text) {
    const el = findChatInput();
    if (!el) return { ok: false, reason: "no-input" };

    el.focus();
    if (el.isContentEditable) {
      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
      } catch (_) {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      return { ok: true, mode: "contenteditable" };
    }

    setNativeValue(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      el.setSelectionRange(text.length, text.length);
    } catch (_) { /* ignore */ }
    return { ok: true, mode: "textarea" };
  }

  async function copyFallback(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  function toast(msg) {
    let t = document.getElementById("vca-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "vca-toast";
      t.className = "vca-toast";
      document.documentElement.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  async function applyTemplate(rawText) {
    let text = rawText || "";
    if (text.includes("{{contre}}")) {
      const counter = lastCounter != null
        ? formatEuro(lastCounter)
        : "…";
      text = text.replace(/\{\{contre\}\}/g, counter);
    }
    const result = insertText(text);
    if (result.ok) {
      toast("Message inséré");
      return;
    }
    const copied = await copyFallback(text);
    toast(copied ? "copié" : "Impossible d’insérer — sélectionnez le champ");
  }

  function computeNego(price, offer) {
    const floorPct = settings.negotiationFloorPercent ?? 15;
    const counterPct = settings.suggestCounterPercent ?? 8;
    const minAccept = price * (1 - floorPct / 100);
    const suggested = price * (1 - counterPct / 100);
    lastCounter = suggested;

    if (offer >= minAccept) {
      return {
        cls: "ok",
        html: `<strong>Conseil : accepter</strong><br>Offre ≥ ${formatEuro(minAccept)} € (seuil −${floorPct} %).`
      };
    }
    return {
      cls: "warn",
      html: `<strong>Conseil : contre-offre</strong><br>Offre sous le seuil (${formatEuro(minAccept)} €). Proposez environ <strong>${formatEuro(suggested)} €</strong> (−${counterPct} %).`
    };
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function preview(text, max = 72) {
    const t = (text || "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max) + "…" : t;
  }

  function renderButtons(list, container) {
    container.innerHTML = "";
    if (!list?.length) {
      container.innerHTML = '<p style="font-size:12px;color:#5a716c;margin:8px 0">Aucun modèle — configurez-les dans les paramètres.</p>';
      return;
    }
    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vca-btn";
      btn.innerHTML = `<strong>${esc(item.label || "Sans titre")}</strong><span>${esc(preview(item.text))}</span>`;
      btn.addEventListener("click", () => applyTemplate(item.text));
      container.appendChild(btn);
    });
  }

  function buildUI() {
    if (document.getElementById("vca-root")) return;

    root = document.createElement("div");
    root.id = "vca-root";
    root.innerHTML = `
      <div id="vca-panel" role="dialog" aria-label="Vinted Chine Assist">
        <div class="vca-hd">
          <h2>Vinted Chine Assist</h2>
          <p>Modèles · négociation · republication</p>
        </div>
        <div class="vca-tabs">
          <button type="button" class="vca-tab active" data-tab="msg">Messages</button>
          <button type="button" class="vca-tab" data-tab="nego">Négociation</button>
          <button type="button" class="vca-tab" data-tab="repost">Repost</button>
        </div>
        <div class="vca-body">
          <div class="vca-pane active" data-pane="msg">
            <div class="vca-section-label">Favoris</div>
            <div id="vca-favoris"></div>
            <div class="vca-section-label">Réponses rapides</div>
            <div id="vca-rr"></div>
            <button type="button" class="vca-link" id="vca-open-options">Ouvrir les paramètres</button>
          </div>
          <div class="vca-pane" data-pane="nego">
            <div class="vca-nego">
              <label for="vca-price">Prix affiché (€)</label>
              <input id="vca-price" type="text" inputmode="decimal" placeholder="ex. 40" />
              <label for="vca-offer">Offre reçue (€)</label>
              <input id="vca-offer" type="text" inputmode="decimal" placeholder="ex. 32" />
              <div id="vca-nego-result" class="vca-result">Saisissez le prix et l’offre pour un conseil.</div>
            </div>
            <button type="button" class="vca-btn" id="vca-insert-counter">
              <strong>Insérer réponse contre-offre</strong>
              <span>Utilise le modèle « Contre-offre polie »</span>
            </button>
            <button type="button" class="vca-btn" id="vca-insert-accept">
              <strong>Insérer acceptation</strong>
              <span>Modèle « Accepter offre »</span>
            </button>
          </div>
          <div class="vca-pane" data-pane="repost">
            <div class="vca-section-label">Checklist republication</div>
            <ul class="vca-check" id="vca-checklist"></ul>
          </div>
        </div>
        <div class="vca-ft">Usage manuel · respectez les CGU Vinted</div>
      </div>
      <button type="button" id="vca-fab" title="Vinted Chine Assist" aria-expanded="false">V</button>
    `;
    document.documentElement.appendChild(root);

    const fab = root.querySelector("#vca-fab");
    fab.addEventListener("click", () => {
      const open = root.classList.toggle("open");
      fab.setAttribute("aria-expanded", open ? "true" : "false");
    });

    root.querySelectorAll(".vca-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        root.querySelectorAll(".vca-tab").forEach((t) => t.classList.remove("active"));
        root.querySelectorAll(".vca-pane").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        root.querySelector(`[data-pane="${tab.dataset.tab}"]`)?.classList.add("active");
      });
    });

    const checklist = root.querySelector("#vca-checklist");
    REPOST_CHECKLIST.forEach((label, i) => {
      const li = document.createElement("li");
      const id = `vca-check-${i}`;
      li.innerHTML = `<input type="checkbox" id="${id}" /><label for="${id}">${esc(label)}</label>`;
      checklist.appendChild(li);
    });

    const priceEl = root.querySelector("#vca-price");
    const offerEl = root.querySelector("#vca-offer");
    const resultEl = root.querySelector("#vca-nego-result");

    function refreshNego() {
      const price = parseMoney(priceEl.value);
      const offer = parseMoney(offerEl.value);
      if (!price || !offer) {
        resultEl.className = "vca-result";
        resultEl.textContent = "Saisissez le prix et l’offre pour un conseil.";
        lastCounter = price ? price * (1 - (settings.suggestCounterPercent ?? 8) / 100) : null;
        return;
      }
      const r = computeNego(price, offer);
      resultEl.className = "vca-result " + r.cls;
      resultEl.innerHTML = r.html;
    }

    priceEl.addEventListener("input", refreshNego);
    offerEl.addEventListener("input", refreshNego);

    root.querySelector("#vca-insert-counter").addEventListener("click", () => {
      refreshNego();
      const tpl = templates.reponsesRapides?.find((t) => t.id === "rr-contre")
        || templates.reponsesRapides?.find((t) => /contre/i.test(t.label || ""))
        || { text: "Merci pour votre offre ! Je peux vous proposer {{contre}} € — ça vous irait ?" };
      applyTemplate(tpl.text);
    });

    root.querySelector("#vca-insert-accept").addEventListener("click", () => {
      const tpl = templates.reponsesRapides?.find((t) => t.id === "rr-accepte")
        || { text: "Parfait, j'accepte votre offre ! Vous pouvez finaliser l'achat quand vous voulez. Merci 🙂" };
      applyTemplate(tpl.text);
    });

    root.querySelector("#vca-open-options").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "VCA_OPEN_OPTIONS" });
      try { chrome.runtime.openOptionsPage(); } catch (_) { /* ignore */ }
    });

    refreshTemplatesUI();
  }

  function refreshTemplatesUI() {
    if (!root) return;
    renderButtons(templates.favoris, root.querySelector("#vca-favoris"));
    renderButtons(templates.reponsesRapides, root.querySelector("#vca-rr"));
  }

  function setVisible(show) {
    if (!root) return;
    root.style.display = show ? "" : "none";
    if (!show) root.classList.remove("open");
  }

  async function loadState() {
    const data = await chrome.storage.local.get(["vca_settings", "vca_templates"]);
    settings = { ...DEFAULT_SETTINGS, ...(data.vca_settings || {}) };
    templates = data.vca_templates
      ? JSON.parse(JSON.stringify(data.vca_templates))
      : JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
    if (!templates.favoris) templates.favoris = [];
    if (!templates.reponsesRapides) templates.reponsesRapides = [];
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.vca_settings) {
      settings = { ...DEFAULT_SETTINGS, ...(changes.vca_settings.newValue || {}) };
      setVisible(settings.bubbleEnabled !== false);
    }
    if (changes.vca_templates) {
      templates = changes.vca_templates.newValue
        ? JSON.parse(JSON.stringify(changes.vca_templates.newValue))
        : JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
      refreshTemplatesUI();
    }
  });

  async function init() {
    await loadState();
    buildUI();
    setVisible(settings.bubbleEnabled !== false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
