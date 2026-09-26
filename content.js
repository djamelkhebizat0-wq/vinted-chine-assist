(() => {
  "use strict";

  const VCA = globalThis.VCA;
  if (!VCA) return;

  let settings = VCA.clone(VCA.DEFAULT_SETTINGS);
  let templates = VCA.clone(VCA.DEFAULT_TEMPLATES);
  let crm = [];
  let repost = [];
  let orders = [];
  let packing = VCA.clone(VCA.DEFAULT_PACKING);
  let itemTemplates = VCA.clone(VCA.DEFAULT_ITEM_TEMPLATES);
  let profiles = [VCA.clone(VCA.DEFAULT_PROFILE)];
  let activeProfileId = "default";
  let schedule = [];
  let postsale = [];

  let lastNego = null;
  let lastCounter = null;
  let root = null;
  let autoFilledKey = "";

  const PAGE = {
    inbox: /\/inbox(\/|$)/i,
    itemNew: /\/items\/new/i,
    itemEdit: /\/items\/\d+\/edit/i,
    item: /\/items\/\d+/i,
    wardrobe: /(wardrobe|closet|\/member\/.+\/items|\/items\/saved)/i,
    orders: /(order|shipping|parcel|label|ventes|sold_items|my_orders)/i
  };

  function pageKind() {
    const p = location.pathname || "";
    if (PAGE.inbox.test(p)) return "inbox";
    if (PAGE.itemNew.test(p) || PAGE.itemEdit.test(p)) return "item-form";
    if (PAGE.item.test(p)) return "item";
    if (PAGE.orders.test(p)) return "orders";
    if (PAGE.wardrobe.test(p)) return "wardrobe";
    return "other";
  }

  function findChatInput() {
    const selectors = [
      'textarea[data-testid*="message"]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="écrire" i]',
      'textarea[placeholder*="ecrire" i]',
      'textarea[placeholder*="write" i]',
      'div[contenteditable="true"][data-testid*="message"]',
      'div[contenteditable="true"][role="textbox"]',
      '[data-testid="inbox-message-form"] textarea',
      '[data-testid="inbox-reply"] textarea',
      '[data-testid*="composer"] textarea',
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

  function fireInput(el, text) {
    el.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: text,
      inputType: "insertText"
    }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("keyup", { bubbles: true }));
  }

  function insertInto(el, text) {
    if (!el) return { ok: false, reason: "no-input" };
    el.focus();
    if (el.isContentEditable) {
      try {
        document.execCommand("selectAll", false, null);
        const ok = document.execCommand("insertText", false, text);
        if (!ok) el.textContent = text;
      } catch (_) {
        el.textContent = text;
      }
      fireInput(el, text);
      return { ok: true, mode: "contenteditable" };
    }
    setNativeValue(el, text);
    fireInput(el, text);
    try { el.setSelectionRange(text.length, text.length); } catch (_) { /* ignore */ }
    return { ok: true, mode: el.tagName.toLowerCase() };
  }

  function insertText(text) {
    return insertInto(findChatInput(), text);
  }

  function findItemFormFields() {
    const title = document.querySelector(
      'input[name="title"], input#title, input[data-testid*="title" i], input[placeholder*="titre" i], input[placeholder*="title" i]'
    );
    const description = document.querySelector(
      'textarea[name="description"], textarea#description, textarea[data-testid*="description" i], textarea[placeholder*="description" i]'
    );
    const price = document.querySelector(
      'input[name="price"], input#price, input[data-testid*="price" i], input[placeholder*="prix" i], input[inputmode="decimal"]'
    );
    return { title, description, price };
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

  function textOf(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function detectContext() {
    const ctx = { nom: "", article: "", prix: "", offre: "", url: location.href };
    const header = document.querySelector(
      '[data-testid*="conversation"] h1, [data-testid*="inbox"] h1, header h2, [class*="conversation"] a[href*="/member/"]'
    );
    const nameCandidates = [
      ...document.querySelectorAll('a[href*="/member/"]:not(#vca-root a)')
    ].filter((a) => {
      const t = textOf(a);
      return t && t.length < 40 && !/vinted/i.test(t);
    });
    if (nameCandidates.length) ctx.nom = textOf(nameCandidates[0]);
    else if (header) ctx.nom = textOf(header);

    const itemLink = document.querySelector(
      'a[href*="/items/"]:not(#vca-root a), [data-testid*="item"] a'
    );
    if (itemLink) ctx.article = textOf(itemLink);
    if (!ctx.article) {
      const h1 = document.querySelector("h1");
      if (h1) ctx.article = textOf(h1);
    }

    const priceEl = document.querySelector(
      '[data-testid*="price"], .web_ui__Text__subtitle, [class*="Price"]'
    );
    const blob = (priceEl ? textOf(priceEl) : "") + " " + (document.querySelector("h1")?.parentElement?.innerText || "");
    const priceMatch = blob.match(/(\d+[.,]\d+|\d+)\s*€/);
    if (priceMatch) ctx.prix = priceMatch[1].replace(".", ",");

    const offer = detectBuyerOffer();
    if (offer != null) ctx.offre = VCA.formatEuro(offer);
    return ctx;
  }

  function detectBuyerOffer() {
    const nodes = [
      ...document.querySelectorAll('[data-testid*="message"], [class*="message"], li, p, span')
    ].filter((el) => !el.closest("#vca-root") && el.children.length < 6);
    const texts = [];
    nodes.slice(-80).forEach((el) => {
      const t = textOf(el);
      if (t && t.length < 180) texts.push(t);
    });
    texts.push(textOf(document.querySelector("main"))?.slice(-1500) || "");
    const patterns = [
      /a fait une offre de\s+(\d+[.,]\d+|\d+)\s*€/i,
      /offre de\s+(\d+[.,]\d+|\d+)\s*€/i,
      /offered\s+(\d+[.,]\d+|\d+)/i,
      /nouvelle offre[^\d]*(\d+[.,]\d+|\d+)\s*€/i
    ];
    let found = null;
    texts.forEach((t) => {
      patterns.forEach((re) => {
        const m = t.match(re);
        if (m) found = VCA.parseMoney(m[1]);
      });
    });
    return found;
  }

  function detectListedPrice() {
    const ctx = detectContext();
    const n = VCA.parseMoney(ctx.prix);
    if (n) return n;
    const body = document.body?.innerText?.slice(0, 4000) || "";
    const m = body.match(/(\d+[.,]\d+|\d+)\s*€/);
    return m ? VCA.parseMoney(m[1]) : null;
  }

  function currentVars(extra) {
    const ctx = detectContext();
    const n = lastNego;
    return {
      nom: ctx.nom,
      article: ctx.article,
      prix: ctx.prix || (n ? VCA.formatEuro(n.listPrice) : ""),
      offre: ctx.offre || (n ? VCA.formatEuro(n.offer) : ""),
      contre: lastCounter != null ? VCA.formatEuro(lastCounter) : "",
      plancher: n ? VCA.formatEuro(n.floor) : VCA.formatEuro(settings.floorPrice),
      ...(extra || {})
    };
  }

  async function applyTemplate(rawText, extraVars) {
    const text = VCA.applyVars(rawText || "", currentVars(extraVars));
    const result = insertText(text);
    if (result.ok) {
      toast("Message inséré");
      return true;
    }
    const copied = await copyFallback(text);
    toast(copied ? "copié" : "Impossible d’insérer — cliquez le champ message");
    return copied;
  }

  function negoInputFromUi() {
    const priceEl = root?.querySelector("#vca-price");
    const offerEl = root?.querySelector("#vca-offer");
    const costEl = root?.querySelector("#vca-cost");
    const listPrice = VCA.parseMoney(priceEl?.value) || detectListedPrice();
    const offer = VCA.parseMoney(offerEl?.value) ?? detectBuyerOffer();
    return {
      listPrice,
      offer,
      costPrice: VCA.parseMoney(costEl?.value) ?? settings.costPrice,
      minMarginEur: settings.minMarginEur,
      floorPrice: settings.floorPrice,
      maxDropPercent: settings.maxDropPercent,
      counterStepPercent: settings.counterStepPercent
    };
  }

  function renderNegoResult(result, aiNote) {
    const resultEl = root?.querySelector("#vca-nego-result");
    if (!resultEl) return;
    if (!result || !result.ok) {
      resultEl.className = "vca-result";
      resultEl.textContent = result?.error || "Saisissez le prix et l’offre pour un conseil.";
      return;
    }
    lastNego = result;
    lastCounter = result.suggested;
    const cls = result.action === "accept" ? "ok" : result.action === "refuse" ? "bad" : "warn";
    const actionLabel = result.action === "accept"
      ? "Accepter"
      : result.action === "refuse"
        ? "Refuser (plancher)"
        : "Contre-offre";
    resultEl.className = "vca-result " + cls;
    resultEl.innerHTML = `<strong>${actionLabel}</strong><br>${VCA.esc(result.reason)}${
      result.suggested != null ? `<br>Suggestion : <strong>${VCA.formatEuro(result.suggested)} €</strong>` : ""
    }${aiNote ? `<br><em>${VCA.esc(aiNote)}</em>` : ""}`;
    const preview = root.querySelector("#vca-nego-preview");
    if (preview) {
      const tpl = VCA.negoMessageFor(result, templates);
      preview.textContent = VCA.applyVars(tpl.text, currentVars(VCA.negoVars(result, detectContext())));
    }
  }

  function refreshNego() {
    const input = negoInputFromUi();
    if (!input.listPrice || input.offer == null) {
      lastCounter = input.listPrice
        ? input.listPrice * (1 - (settings.counterStepPercent ?? 8) / 100)
        : null;
      renderNegoResult(null);
      return null;
    }
    const result = VCA.computeNego(input);
    renderNegoResult(result);
    return result;
  }

  async function maybeAiNego() {
    const input = negoInputFromUi();
    if (!input.listPrice || input.offer == null) {
      toast("Indiquez prix et offre");
      return;
    }
    const ctx = detectContext();
    try {
      const res = await chrome.runtime.sendMessage({
        type: "VCA_AI_NEGO",
        input,
        article: ctx.article,
        nom: ctx.nom
      });
      const local = res?.local;
      if (local) renderNegoResult(local, res?.ai?.ok ? "IA utilisée (bornée au plancher)" : "Règles locales uniquement");
      if (res?.message && root) {
        const preview = root.querySelector("#vca-nego-preview");
        if (preview) preview.textContent = res.message;
      }
      if (res?.ai?.error === "no-key") toast("Pas de clé API — règles locales");
      else if (res?.ai?.ok === false && res.ai.error !== "no-key") toast("IA indisponible — règles locales");
    } catch (_) {
      refreshNego();
    }
  }

  async function maybeAutoFill() {
    if (!settings.autoReplyEnabled) return;
    if (pageKind() !== "inbox") return;
    const offer = detectBuyerOffer();
    const price = detectListedPrice() || Number(settings.costPrice) || null;
    if (offer == null || !price) return;
    const key = `${location.pathname}:${offer}:${price}`;
    if (autoFilledKey === key) return;
    const priceEl = root?.querySelector("#vca-price");
    const offerEl = root?.querySelector("#vca-offer");
    if (priceEl && !priceEl.value) priceEl.value = VCA.formatEuro(price);
    if (offerEl && !offerEl.value) offerEl.value = VCA.formatEuro(offer);
    const result = VCA.computeNego({
      listPrice: price,
      offer,
      costPrice: settings.costPrice,
      minMarginEur: settings.minMarginEur,
      floorPrice: settings.floorPrice,
      maxDropPercent: settings.maxDropPercent,
      counterStepPercent: settings.counterStepPercent
    });
    if (!result.ok) return;
    lastNego = result;
    lastCounter = result.suggested;
    const tpl = VCA.negoMessageFor(result, templates);
    const text = VCA.applyVars(tpl.text, currentVars(VCA.negoVars(result, detectContext())));
    const ins = insertText(text);
    if (ins.ok) {
      autoFilledKey = key;
      toast("Contre-offre pré-remplie (non envoyée)");
    }
  }

  function collectLabelLinks() {
    const links = [...document.querySelectorAll("a[href]")].filter((a) => !a.closest("#vca-root"));
    const out = [];
    const seen = new Set();
    links.forEach((a) => {
      const href = a.href || "";
      const label = textOf(a);
      const hay = `${href} ${label}`;
      if (!/label|etiquette|étiquette|shipping|bordereau|print|imprimer/i.test(hay)) return;
      if (seen.has(href)) return;
      seen.add(href);
      out.push({ href, label: label || href });
    });
    return out;
  }

  function collectOpenOrdersFromDom() {
    const rows = [];
    const cards = document.querySelectorAll('[data-testid*="order"], [class*="order"], article, li');
    cards.forEach((el, i) => {
      if (el.closest("#vca-root")) return;
      const t = textOf(el);
      if (!t || t.length < 8 || t.length > 220) return;
      if (!/(en cours|à envoyer|expédi|étiquette|label|acheter|vente)/i.test(t)) return;
      const a = el.querySelector("a[href]");
      rows.push({
        id: VCA.uid("ord"),
        title: t.slice(0, 80),
        url: a?.href || location.href,
        labelUrl: collectLabelLinks()[0]?.href || "",
        collectedAt: new Date().toISOString()
      });
      if (rows.length >= 20) return;
    });
    if (!rows.length) {
      collectLabelLinks().forEach((l) => {
        rows.push({
          id: VCA.uid("ord"),
          title: l.label,
          url: l.href,
          labelUrl: l.href,
          collectedAt: new Date().toISOString()
        });
      });
    }
    return rows;
  }

  function renderButtons(list, container) {
    if (!container) return;
    container.innerHTML = "";
    if (!list?.length) {
      container.innerHTML = '<p class="vca-empty">Aucun modèle — configurez-les dans les paramètres.</p>';
      return;
    }
    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vca-btn";
      btn.innerHTML = `<strong>${VCA.esc(item.label || "Sans titre")}</strong><span>${VCA.esc(preview(item.text))}</span>`;
      btn.addEventListener("click", () => applyTemplate(item.text));
      container.appendChild(btn);
    });
  }

  function preview(text, max = 72) {
    const t = (text || "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max) + "…" : t;
  }

  function refreshTemplatesUI() {
    if (!root) return;
    const cat = root.querySelector(".vca-cat.active")?.dataset.cat || "favoris";
    renderButtons(templates[cat] || [], root.querySelector("#vca-msgs"));
  }

  function refreshRepostUI() {
    if (!root) return;
    const box = root.querySelector("#vca-repost-list");
    if (!box) return;
    box.innerHTML = "";
    if (!repost.length) {
      box.innerHTML = '<p class="vca-empty">File vide. Ajoutez l’URL de l’article courant.</p>';
      return;
    }
    repost.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "vca-row";
      row.innerHTML = `<span>${i === 0 ? "→ " : ""}${VCA.esc(it.title || it.url)}</span>`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "vca-mini";
      del.textContent = "×";
      del.addEventListener("click", async () => {
        repost = repost.filter((x) => x.id !== it.id);
        await VCA.storageSet({ [VCA.KEYS.repost]: repost });
        refreshRepostUI();
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function refreshCrmMini() {
    if (!root) return;
    const stats = VCA.crmStats(crm, settings);
    const el = root.querySelector("#vca-crm-mini");
    if (!el) return;
    el.innerHTML = `
      <div class="vca-stats">
        <div><b>${VCA.formatEuro(stats.caMonth)} €</b><span>CA mois</span></div>
        <div><b>${VCA.formatEuro(stats.profit)} €</b><span>Marge</span></div>
        <div><b>${stats.soldCount}</b><span>Vendus</span></div>
        <div><b>${stats.stock}</b><span>Stock</span></div>
      </div>`;
  }

  function refreshOrdersUI() {
    if (!root) return;
    const box = root.querySelector("#vca-orders-list");
    if (!box) return;
    box.innerHTML = "";
    if (!orders.length) {
      box.innerHTML = '<p class="vca-empty">Aucune commande enregistrée. Collectez-les sur la page commandes.</p>';
      return;
    }
    orders.slice(0, 12).forEach((o) => {
      const row = document.createElement("div");
      row.className = "vca-row";
      row.innerHTML = `<span>${VCA.esc(o.title)}</span>`;
      box.appendChild(row);
    });
  }

  function refreshPackingUI() {
    if (!root) return;
    const ul = root.querySelector("#vca-packing");
    if (!ul) return;
    ul.innerHTML = "";
    packing.forEach((p, i) => {
      const li = document.createElement("li");
      const id = `vca-pk-${i}`;
      li.innerHTML = `<input type="checkbox" id="${id}" ${p.done ? "checked" : ""} /><label for="${id}">${VCA.esc(p.label)}</label>`;
      li.querySelector("input").addEventListener("change", async (ev) => {
        packing[i].done = ev.target.checked;
        await VCA.storageSet({ [VCA.KEYS.packing]: packing });
      });
      ul.appendChild(li);
    });
  }

  function refreshPostsaleUI() {
    if (!root) return;
    const box = root.querySelector("#vca-sav-list");
    if (!box) return;
    box.innerHTML = "";
    if (!postsale.length) {
      box.innerHTML = '<p class="vca-empty">Aucun rappel post-vente. Marquez un article vendu dans le CRM.</p>';
      return;
    }
    postsale.slice(0, 8).forEach((j) => {
      const row = document.createElement("div");
      row.className = "vca-row";
      row.innerHTML = `<span>${VCA.esc(j.title || "Vente")} ${j.reviewDone ? "✓ avis" : j.thankYouDone ? "✓ merci" : "⏳"}</span>`;
      box.appendChild(row);
    });
  }

  function refreshScheduleUI() {
    if (!root) return;
    const box = root.querySelector("#vca-sched-list");
    if (!box) return;
    box.innerHTML = "";
    const upcoming = schedule.filter((s) => s.enabled !== false).slice(0, 6);
    if (!upcoming.length) {
      box.innerHTML = '<p class="vca-empty">Aucun créneau. Ajoutez-en dans les paramètres.</p>';
      return;
    }
    upcoming.forEach((s) => {
      const row = document.createElement("div");
      row.className = "vca-row";
      const when = s.when ? new Date(s.when).toLocaleString("fr-FR") : "";
      row.innerHTML = `<span>${VCA.esc(s.title || "Rappel")} · ${VCA.esc(when)}</span>`;
      box.appendChild(row);
    });
  }

  function refreshItemTplUI() {
    if (!root) return;
    const sel = root.querySelector("#vca-item-tpl");
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = itemTemplates.map((t) =>
      `<option value="${VCA.esc(t.id)}">${VCA.esc(t.name)}</option>`
    ).join("");
    if (cur && itemTemplates.some((t) => t.id === cur)) sel.value = cur;
  }

  function buildUI() {
    if (document.getElementById("vca-root")) return;

    root = document.createElement("div");
    root.id = "vca-root";
    root.innerHTML = `
      <div id="vca-panel" role="dialog" aria-label="Vinted Chine Assist">
        <div class="vca-hd">
          <h2>Vinted Chine Assist</h2>
          <p>Usage personnel · local · v${VCA.VERSION}</p>
        </div>
        <div class="vca-tabs">
          <button type="button" class="vca-tab active" data-tab="msg">Messages</button>
          <button type="button" class="vca-tab" data-tab="nego">Négo</button>
          <button type="button" class="vca-tab" data-tab="repost">Repost</button>
          <button type="button" class="vca-tab" data-tab="crm">CRM</button>
          <button type="button" class="vca-tab" data-tab="colis">Colis</button>
          <button type="button" class="vca-tab" data-tab="sav">SAV</button>
          <button type="button" class="vca-tab" data-tab="planif">Planif</button>
          <button type="button" class="vca-tab" data-tab="cloud">Cloud</button>
        </div>
        <div class="vca-body">
          <div class="vca-pane active" data-pane="msg">
            <div class="vca-cats">
              <button type="button" class="vca-cat active" data-cat="favoris">Favoris</button>
              <button type="button" class="vca-cat" data-cat="nego">Négo</button>
              <button type="button" class="vca-cat" data-cat="postVente">Post-vente</button>
              <button type="button" class="vca-cat" data-cat="relance">Relance</button>
            </div>
            <p class="vca-hint">Variables : {{prix}} {{nom}} {{article}} {{contre}} {{offre}}</p>
            <div id="vca-msgs"></div>
            <button type="button" class="vca-link" id="vca-open-options">Ouvrir les paramètres</button>
          </div>
          <div class="vca-pane" data-pane="nego">
            <div class="vca-nego">
              <label for="vca-price">Prix affiché (€)</label>
              <input id="vca-price" type="text" inputmode="decimal" placeholder="ex. 40" />
              <label for="vca-offer">Offre reçue (€)</label>
              <input id="vca-offer" type="text" inputmode="decimal" placeholder="ex. 32" />
              <label for="vca-cost">Prix d'achat (€) — optionnel</label>
              <input id="vca-cost" type="text" inputmode="decimal" placeholder="ex. 12" />
              <div id="vca-nego-result" class="vca-result">Saisissez le prix et l’offre, ou ouvrez une conversation.</div>
              <div id="vca-nego-preview" class="vca-preview"></div>
            </div>
            <button type="button" class="vca-btn" id="vca-insert-nego">
              <strong>Insérer la suggestion</strong>
              <span>Modèle selon accepter / contre / refus</span>
            </button>
            <button type="button" class="vca-btn" id="vca-copy-nego">
              <strong>Copier la suggestion</strong>
              <span>Presse-papiers</span>
            </button>
            <button type="button" class="vca-link" id="vca-ai-nego">Recalculer (+ IA si clé)</button>
          </div>
          <div class="vca-pane" data-pane="repost">
            <div class="vca-section-label">File de republication</div>
            <div id="vca-repost-list"></div>
            <button type="button" class="vca-btn" id="vca-repost-add">
              <strong>Ajouter cette page à la file</strong>
              <span>URL courante</span>
            </button>
            <button type="button" class="vca-btn" id="vca-repost-next">
              <strong>Repost suivant</strong>
              <span>Ouvre l’URL puis passe à la suivante</span>
            </button>
            <p class="vca-hint">Intervalle : alarmes Chrome (navigateur ouvert). Pas de spam infini.</p>
          </div>
          <div class="vca-pane" data-pane="crm">
            <div id="vca-crm-mini"></div>
            <label class="vca-field">Titre
              <input id="vca-crm-title" type="text" placeholder="Article" />
            </label>
            <label class="vca-field">URL
              <input id="vca-crm-url" type="url" placeholder="https://www.vinted.fr/items/…" />
            </label>
            <label class="vca-field">Prix d'achat €
              <input id="vca-crm-buy" type="text" inputmode="decimal" />
            </label>
            <button type="button" class="vca-btn" id="vca-crm-add"><strong>Ajouter au stock</strong><span>CRM local</span></button>
            <button type="button" class="vca-link" id="vca-open-crm">Ouvrir le tableau CRM</button>
            <div class="vca-section-label">Modèle d'annonce</div>
            <select id="vca-item-tpl"></select>
            <button type="button" class="vca-btn" id="vca-fill-item">
              <strong>Remplir /items/new</strong>
              <span>Titre, description, prix si les champs existent</span>
            </button>
          </div>
          <div class="vca-pane" data-pane="colis">
            <div class="vca-section-label">Commandes / étiquettes</div>
            <div id="vca-orders-list"></div>
            <button type="button" class="vca-btn" id="vca-collect-orders">
              <strong>Collecter sur cette page</strong>
              <span>Liens étiquette / commandes visibles</span>
            </button>
            <button type="button" class="vca-btn" id="vca-print-queue">
              <strong>Ouvrir la file d'impression</strong>
              <span>Max 5 onglets, avec pause</span>
            </button>
            <div class="vca-section-label">Checklist emballage</div>
            <ul class="vca-check" id="vca-packing"></ul>
            <button type="button" class="vca-link" id="vca-open-slip">Bon de livraison (CRM)</button>
          </div>
          <div class="vca-pane" data-pane="sav">
            <div class="vca-section-label">Post-vente</div>
            <div id="vca-sav-list"></div>
            <button type="button" class="vca-btn" id="vca-sav-merci">
              <strong>Insérer remerciement</strong>
              <span>Modèle post-vente</span>
            </button>
            <button type="button" class="vca-btn" id="vca-sav-avis">
              <strong>Insérer demande d'avis</strong>
              <span>Modèle avis</span>
            </button>
            <p class="vca-hint">Les rappels alarmes sonnent seulement si Chrome tourne.</p>
          </div>
          <div class="vca-pane" data-pane="planif">
            <div class="vca-section-label">Profil local</div>
            <select id="vca-profile"></select>
            <p class="vca-hint">Changer de profil ici ne déconnecte pas Vinted (cookies Chrome isolés par profil navigateur uniquement).</p>
            <div class="vca-section-label">Prochains rappels</div>
            <div id="vca-sched-list"></div>
            <button type="button" class="vca-link" id="vca-open-planif">Gérer planification</button>
          </div>
          <div class="vca-pane" data-pane="cloud">
            <div class="vca-banner">
              <strong>Mode local uniquement</strong>
              <p>Pas de Cloud 24/7 : les alarmes s’arrêtent quand Chrome est fermé. Pas d’app iOS/Android native. Voir Paramètres → Cloud &amp; mobile.</p>
            </div>
            <button type="button" class="vca-link" id="vca-open-cloud">Lire les limites</button>
          </div>
        </div>
        <div id="vca-auto-banner" class="vca-banner" hidden></div>
        <div class="vca-ft">Manuel sauf Mode auto · respectez les CGU Vinted · pas d’évasion de ban</div>
      </div>
      <button type="button" id="vca-fab" title="Vinted Chine Assist" aria-expanded="false">V</button>
    `;
    document.documentElement.appendChild(root);

    const fab = root.querySelector("#vca-fab");
    fab.addEventListener("click", () => {
      const open = root.classList.toggle("open");
      fab.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) onOpen();
    });

    root.querySelectorAll(".vca-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        root.querySelectorAll(".vca-tab").forEach((t) => t.classList.remove("active"));
        root.querySelectorAll(".vca-pane").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        root.querySelector(`[data-pane="${tab.dataset.tab}"]`)?.classList.add("active");
      });
    });

    root.querySelectorAll(".vca-cat").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".vca-cat").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        refreshTemplatesUI();
      });
    });

    const priceEl = root.querySelector("#vca-price");
    const offerEl = root.querySelector("#vca-offer");
    const costEl = root.querySelector("#vca-cost");
    priceEl.addEventListener("input", refreshNego);
    offerEl.addEventListener("input", refreshNego);
    costEl.addEventListener("input", refreshNego);

    root.querySelector("#vca-insert-nego").addEventListener("click", () => {
      const result = refreshNego();
      if (!result?.ok) {
        toast("Indiquez prix et offre");
        return;
      }
      const tpl = VCA.negoMessageFor(result, templates);
      applyTemplate(tpl.text, VCA.negoVars(result, detectContext()));
    });

    root.querySelector("#vca-copy-nego").addEventListener("click", async () => {
      const result = refreshNego();
      if (!result?.ok) {
        toast("Indiquez prix et offre");
        return;
      }
      const tpl = VCA.negoMessageFor(result, templates);
      const text = VCA.applyVars(tpl.text, currentVars(VCA.negoVars(result, detectContext())));
      const ok = await copyFallback(text);
      toast(ok ? "copié" : "Copie impossible");
    });

    root.querySelector("#vca-ai-nego").addEventListener("click", maybeAiNego);

    root.querySelector("#vca-open-options").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "VCA_OPEN_OPTIONS" });
    });
    root.querySelector("#vca-open-crm").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "VCA_OPEN_PAGE", page: "crm" });
    });
    root.querySelector("#vca-open-slip").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "VCA_OPEN_PAGE", page: "slip" });
    });
    root.querySelector("#vca-open-planif").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "VCA_OPEN_PAGE", page: "options", query: "tab=planif" });
    });
    root.querySelector("#vca-open-cloud").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "VCA_OPEN_PAGE", page: "options", query: "tab=cloud" });
    });

    root.querySelector("#vca-repost-add").addEventListener("click", async () => {
      const url = location.href;
      const title = (document.querySelector("h1") && textOf(document.querySelector("h1"))) || document.title;
      if (repost.some((r) => r.url === url)) {
        toast("Déjà dans la file");
        return;
      }
      repost.push({
        id: VCA.uid("rp"),
        title,
        url,
        addedAt: new Date().toISOString()
      });
      await VCA.storageSet({ [VCA.KEYS.repost]: repost });
      refreshRepostUI();
      toast("Ajouté à la file");
    });

    root.querySelector("#vca-repost-next").addEventListener("click", async () => {
      const res = await chrome.runtime.sendMessage({ type: "VCA_REPOST_NEXT" });
      if (!res?.ok) toast(res?.error || "File vide");
      else toast("Ouverture du suivant");
    });

    root.querySelector("#vca-crm-add").addEventListener("click", async () => {
      const title = root.querySelector("#vca-crm-title").value.trim()
        || textOf(document.querySelector("h1"))
        || "Article";
      const listingUrl = root.querySelector("#vca-crm-url").value.trim() || location.href;
      const purchasePrice = VCA.parseMoney(root.querySelector("#vca-crm-buy").value) ?? 0;
      crm.push({
        id: VCA.uid("crm"),
        title,
        listingUrl,
        purchasePrice,
        salePrice: "",
        fees: "",
        shippingCost: settings.defaultShippingCost || 0,
        status: "stock",
        soldAt: "",
        notes: ""
      });
      await VCA.storageSet({ [VCA.KEYS.crm]: crm });
      refreshCrmMini();
      toast("Ajouté au CRM");
    });

    root.querySelector("#vca-fill-item").addEventListener("click", () => {
      const id = root.querySelector("#vca-item-tpl").value;
      const tpl = itemTemplates.find((t) => t.id === id) || itemTemplates[0];
      if (!tpl) return;
      const ctx = detectContext();
      const vars = {
        marque: "",
        modele: ctx.article || "",
        taille: "",
        etat: "bon état",
        details: "",
        qte: "1",
        achat: settings.costPrice || 0,
        marge: settings.minMarginEur || 0
      };
      const title = VCA.applyVars(tpl.title, vars);
      const description = VCA.applyVars(tpl.description, vars);
      let price = "";
      try {
        price = String(VCA.evalPriceFormula(tpl.priceFormula, vars)).replace(".", ",");
      } catch (_) {
        price = "";
      }
      const fields = findItemFormFields();
      let filled = 0;
      if (fields.title) {
        insertInto(fields.title, title);
        filled += 1;
      }
      if (fields.description) {
        insertInto(fields.description, description);
        filled += 1;
      }
      if (fields.price && price) {
        insertInto(fields.price, price);
        filled += 1;
      }
      if (!filled) {
        copyFallback(`${title}\n\n${description}\n\nPrix : ${price} €`);
        toast("Champs introuvables — copié");
      } else toast(`Champs remplis (${filled})`);
    });

    root.querySelector("#vca-collect-orders").addEventListener("click", async () => {
      const found = collectOpenOrdersFromDom();
      if (!found.length) {
        toast("Rien détecté sur cette page");
        return;
      }
      const urls = new Set(orders.map((o) => o.url + "|" + o.labelUrl));
      found.forEach((o) => {
        const k = o.url + "|" + o.labelUrl;
        if (!urls.has(k)) {
          orders.push(o);
          urls.add(k);
        }
      });
      await VCA.storageSet({ [VCA.KEYS.orders]: orders });
      refreshOrdersUI();
      toast(`${found.length} élément(s) collecté(s)`);
    });

    root.querySelector("#vca-print-queue").addEventListener("click", async () => {
      const urls = orders.map((o) => o.labelUrl || o.url).filter(Boolean);
      if (!urls.length) {
        toast("File d'impression vide");
        return;
      }
      await chrome.runtime.sendMessage({ type: "VCA_OPEN_URLS", urls });
      toast("Ouverture (max 5)");
    });

    root.querySelector("#vca-sav-merci").addEventListener("click", () => {
      const tpl = (templates.postVente || []).find((t) => t.id === "sav-merci") || templates.postVente?.[0];
      applyTemplate(tpl?.text || "Merci pour votre achat !");
    });
    root.querySelector("#vca-sav-avis").addEventListener("click", () => {
      const tpl = (templates.postVente || []).find((t) => t.id === "sav-avis")
        || { text: "Un petit avis me ferait plaisir !" };
      applyTemplate(tpl.text);
    });

    root.querySelector("#vca-profile").addEventListener("change", async (ev) => {
      activeProfileId = ev.target.value;
      await VCA.storageSet({ [VCA.KEYS.activeProfile]: activeProfileId });
      toast("Profil local activé (cookies inchangés)");
    });

    refreshAllPanels();
    refreshAutoBanner();
  }

  function refreshAutoBanner() {
    const el = root?.querySelector("#vca-auto-banner");
    if (!el) return;
    if (settings.modeAuto) {
      el.hidden = false;
      el.textContent = "Mode auto ON — envoi réel (caps / délai). STOP dans le popup.";
    } else {
      el.hidden = true;
    }
  }

  function refreshProfilesSelect() {
    const sel = root?.querySelector("#vca-profile");
    if (!sel) return;
    sel.innerHTML = profiles.map((p) =>
      `<option value="${VCA.esc(p.id)}">${VCA.esc(p.name)}</option>`
    ).join("");
    sel.value = activeProfileId;
  }

  function refreshAllPanels() {
    refreshTemplatesUI();
    refreshRepostUI();
    refreshCrmMini();
    refreshOrdersUI();
    refreshPackingUI();
    refreshPostsaleUI();
    refreshScheduleUI();
    refreshItemTplUI();
    refreshProfilesSelect();
    refreshAutoBanner();
    if (root?.querySelector("#vca-cost") && settings.costPrice) {
      root.querySelector("#vca-cost").value = String(settings.costPrice);
    }
  }

  function onOpen() {
    const kind = pageKind();
    const priceEl = root.querySelector("#vca-price");
    const offerEl = root.querySelector("#vca-offer");
    const urlEl = root.querySelector("#vca-crm-url");
    const titleEl = root.querySelector("#vca-crm-title");
    const listed = detectListedPrice();
    const offer = detectBuyerOffer();
    if (priceEl && !priceEl.value && listed) priceEl.value = String(listed).replace(".", ",");
    if (offerEl && !offerEl.value && offer != null) offerEl.value = String(offer).replace(".", ",");
    if (urlEl && !urlEl.value) urlEl.value = location.href;
    if (titleEl && !titleEl.value) titleEl.value = textOf(document.querySelector("h1")) || "";
    refreshNego();
    if (kind === "item-form") {
      root.querySelector('[data-tab="crm"]')?.click();
    }
    maybeAutoFill();
  }

  function setVisible(show) {
    if (!root) return;
    root.style.display = show ? "" : "none";
    if (!show) root.classList.remove("open");
  }

  async function loadState() {
    const all = await VCA.loadAll();
    settings = all.settings;
    templates = all.templates;
    crm = all.crm;
    repost = all.repost;
    orders = all.orders;
    packing = all.packing;
    itemTemplates = all.itemTemplates;
    profiles = all.profiles;
    activeProfileId = all.activeProfileId;
    schedule = all.schedule;
    postsale = all.postsale;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    loadState().then(() => {
      setVisible(settings.bubbleEnabled !== false);
    refreshAllPanels();
    refreshAutoBanner();
  });
  });

  let observerTimer = null;
  function watchInbox() {
    if (pageKind() !== "inbox") return;
    const obs = new MutationObserver(() => {
      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        if (settings.autoReplyEnabled && !settings.modeAuto) maybeAutoFill();
        const offer = detectBuyerOffer();
        const offerEl = root?.querySelector("#vca-offer");
        if (offer != null && offerEl && !offerEl.value) {
          offerEl.value = String(offer).replace(".", ",");
          refreshNego();
        }
      }, 400);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  async function init() {
    await loadState();
    buildUI();
    setVisible(settings.bubbleEnabled !== false);
    watchInbox();
  }

  VCA.page = {
    insertText,
    findChatInput,
    insertInto,
    detectContext,
    detectBuyerOffer,
    detectListedPrice,
    currentVars,
    pageKind,
    textOf,
    toast
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
