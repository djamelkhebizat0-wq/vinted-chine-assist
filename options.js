/* global VCA */
const TITLES = {
  dash: "Tableau de bord",
  crm: "CRM vendeur",
  nego: "Négo auto",
  msg: "Messages favoris",
  items: "Templates articles",
  repost: "Repost auto",
  colis: "Étiquettes & colis",
  sav: "Post-vente",
  planif: "Comptes & planif",
  cloud: "Cloud & mobile"
};

let state = null;

function showToast(msg, ok = true) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  el.className = "toast" + (ok ? " ok" : "");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

function showTab(id) {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  document.querySelectorAll(".tab").forEach((p) => p.classList.toggle("active", p.dataset.tab === id));
  document.getElementById("pageTitle").textContent = TITLES[id] || id;
  const url = new URL(location.href);
  url.searchParams.set("tab", id);
  history.replaceState(null, "", url);
}

function num(id) {
  return Number(document.getElementById(id).value);
}

function readSettingsFromForm() {
  const s = state.settings;
  s.costPrice = num("costPrice") || 0;
  s.minMarginEur = num("minMarginEur") || 0;
  s.floorPrice = num("floorPrice") || 0;
  s.maxDropPercent = num("maxDropPercent");
  s.counterStepPercent = num("counterStepPercent");
  s.negotiationFloorPercent = s.maxDropPercent;
  s.suggestCounterPercent = s.counterStepPercent;
  s.feePercent = num("feePercent") || 0;
  s.feeFixed = num("feeFixed") || 0;
  s.defaultShippingCost = num("defaultShippingCost") || 0;
  s.autoReplyEnabled = document.getElementById("autoReplyEnabled").checked;
  s.bubbleEnabled = document.getElementById("bubbleEnabled").checked;
  s.openaiApiKey = document.getElementById("openaiApiKey").value.trim();
  s.openaiBaseUrl = document.getElementById("openaiBaseUrl").value.trim() || VCA.DEFAULT_SETTINGS.openaiBaseUrl;
  s.openaiModel = document.getElementById("openaiModel").value.trim() || "gpt-4o-mini";
  s.repostIntervalMinutes = Math.max(15, num("repostIntervalMinutes") || 60);
  s.repostAutoOpen = document.getElementById("repostAutoOpen").checked;
  s.postSaleThankYouHours = Math.max(0, num("postSaleThankYouHours") || 0);
  s.postSaleReviewHours = Math.max(1, num("postSaleReviewHours") || 48);
  s.activeProfileId = state.activeProfileId;
}

function fillSettingsForm() {
  const s = state.settings;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };
  set("costPrice", s.costPrice);
  set("minMarginEur", s.minMarginEur);
  set("floorPrice", s.floorPrice);
  set("maxDropPercent", s.maxDropPercent);
  set("counterStepPercent", s.counterStepPercent);
  set("feePercent", s.feePercent);
  set("feeFixed", s.feeFixed);
  set("defaultShippingCost", s.defaultShippingCost);
  document.getElementById("autoReplyEnabled").checked = !!s.autoReplyEnabled;
  document.getElementById("bubbleEnabled").checked = s.bubbleEnabled !== false;
  set("openaiApiKey", s.openaiApiKey);
  set("openaiBaseUrl", s.openaiBaseUrl);
  set("openaiModel", s.openaiModel);
  set("repostIntervalMinutes", s.repostIntervalMinutes);
  document.getElementById("repostAutoOpen").checked = !!s.repostAutoOpen;
  set("postSaleThankYouHours", s.postSaleThankYouHours);
  set("postSaleReviewHours", s.postSaleReviewHours);
}

function renderKpis() {
  const st = VCA.crmStats(state.crm, state.settings);
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><b>${VCA.formatEuro(st.caMonth)} €</b><span>CA du mois</span></div>
    <div class="kpi"><b>${VCA.formatEuro(st.profit)} €</b><span>Marge nette</span></div>
    <div class="kpi"><b>${st.soldCount}</b><span>Vendus</span></div>
    <div class="kpi"><b>${st.stock}</b><span>En stock</span></div>`;
  const p = state.profiles.find((x) => x.id === state.activeProfileId);
  document.getElementById("dashProfile").textContent = p ? p.name : state.activeProfileId;
}

function renderCrm() {
  const tb = document.querySelector("#crmTable tbody");
  tb.innerHTML = "";
  state.crm.forEach((it, index) => {
    const fees = it.fees === "" || it.fees == null
      ? VCA.estimateFees(it.salePrice, state.settings)
      : Number(it.fees) || 0;
    const margin = it.status === "sold" ? VCA.netMargin({ ...it, fees }, state.settings) : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-k="title" value="${VCA.esc(it.title || "")}" /></td>
      <td><input data-k="listingUrl" value="${VCA.esc(it.listingUrl || "")}" /></td>
      <td><input data-k="purchasePrice" type="number" step="0.01" value="${it.purchasePrice ?? 0}" /></td>
      <td><input data-k="salePrice" type="number" step="0.01" value="${it.salePrice ?? ""}" /></td>
      <td><input data-k="fees" type="number" step="0.01" value="${it.fees ?? ""}" placeholder="${fees}" /></td>
      <td><input data-k="shippingCost" type="number" step="0.01" value="${it.shippingCost ?? 0}" /></td>
      <td>
        <select data-k="status">
          <option value="stock" ${it.status !== "sold" ? "selected" : ""}>Stock</option>
          <option value="sold" ${it.status === "sold" ? "selected" : ""}>Vendu</option>
        </select>
      </td>
      <td>${margin === "—" ? "—" : VCA.formatEuro(margin) + " €"}</td>
      <td></td>`;
    const del = document.createElement("button");
    del.className = "btn danger";
    del.type = "button";
    del.textContent = "Suppr.";
    del.addEventListener("click", () => {
      state.crm.splice(index, 1);
      renderCrm();
      renderKpis();
    });
    tr.lastElementChild.appendChild(del);
    tr.querySelectorAll("[data-k]").forEach((inp) => {
      inp.addEventListener("change", async () => {
        const k = inp.dataset.k;
        let v = inp.value;
        if (["purchasePrice", "salePrice", "fees", "shippingCost"].includes(k)) {
          v = v === "" ? "" : Number(v);
        }
        const was = it.status;
        it[k] = v;
        if (k === "status" && v === "sold" && was !== "sold") {
          it.soldAt = VCA.todayISODate();
          if (it.salePrice === "" || it.salePrice == null) {
            /* keep empty */
          }
          if (it.fees === "" || it.fees == null) it.fees = VCA.estimateFees(it.salePrice, state.settings);
          await schedulePostsale(it);
        }
        renderCrm();
        renderKpis();
      });
    });
    tb.appendChild(tr);
  });
  if (!state.crm.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="9" class="desc">Aucun article. Ajoutez-en un ou importez un CSV.</td>';
    tb.appendChild(tr);
  }
}

async function schedulePostsale(item) {
  const thank = Date.now() + (Number(state.settings.postSaleThankYouHours) || 0) * 3600 * 1000;
  const review = Date.now() + (Number(state.settings.postSaleReviewHours) || 48) * 3600 * 1000;
  state.postsale.push({
    id: VCA.uid("sav"),
    crmItemId: item.id,
    title: item.title,
    url: item.listingUrl || "",
    thankYouAt: new Date(thank).toISOString(),
    reviewAt: new Date(review).toISOString(),
    thankYouDone: false,
    reviewDone: false
  });
  await persist();
  chrome.runtime.sendMessage({ type: "VCA_SYNC_ALARMS" });
  showToast("Rappels post-vente planifiés");
}

function renderMsgCats() {
  const root = document.getElementById("msgCats");
  root.innerHTML = "";
  VCA.MSG_CATEGORIES.forEach((cat) => {
    const wrap = document.createElement("div");
    wrap.className = "mt";
    const hd = document.createElement("div");
    hd.className = "panel-hd";
    hd.innerHTML = `<h3>${VCA.esc(cat.label)}</h3>`;
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn sm";
    add.textContent = "+ Ajouter";
    add.addEventListener("click", () => {
      state.templates[cat.id].push({ id: VCA.uid(cat.id), label: "Nouveau", text: "" });
      renderMsgCats();
    });
    hd.appendChild(add);
    wrap.appendChild(hd);
    const list = document.createElement("div");
    list.className = "tpl-list";
    (state.templates[cat.id] || []).forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "tpl-card";
      const row = document.createElement("div");
      row.className = "row1";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = item.label || "";
      inp.addEventListener("input", () => { item.label = inp.value; });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn danger";
      del.textContent = "Supprimer";
      del.addEventListener("click", () => {
        state.templates[cat.id].splice(index, 1);
        renderMsgCats();
      });
      row.appendChild(inp);
      row.appendChild(del);
      const ta = document.createElement("textarea");
      ta.value = item.text || "";
      ta.addEventListener("input", () => { item.text = ta.value; });
      card.appendChild(row);
      card.appendChild(ta);
      list.appendChild(card);
    });
    wrap.appendChild(list);
    root.appendChild(wrap);
  });
}

function renderItemTpls() {
  const root = document.getElementById("itemTplList");
  root.innerHTML = "";
  state.itemTemplates.forEach((tpl, index) => {
    const card = document.createElement("div");
    card.className = "tpl-card";
    card.innerHTML = `<div class="row1"></div>`;
    const row = card.querySelector(".row1");
    const name = document.createElement("input");
    name.value = tpl.name || "";
    name.placeholder = "Nom du modèle";
    name.addEventListener("input", () => { tpl.name = name.value; });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "Supprimer";
    del.addEventListener("click", () => {
      state.itemTemplates.splice(index, 1);
      renderItemTpls();
    });
    row.appendChild(name);
    row.appendChild(del);
    const title = document.createElement("input");
    title.value = tpl.title || "";
    title.placeholder = "Titre ({{marque}} {{taille}} …)";
    title.addEventListener("input", () => { tpl.title = title.value; });
    const desc = document.createElement("textarea");
    desc.value = tpl.description || "";
    desc.placeholder = "Description";
    desc.addEventListener("input", () => { tpl.description = desc.value; });
    const formula = document.createElement("input");
    formula.value = tpl.priceFormula || "achat + marge";
    formula.placeholder = "Formule prix";
    formula.addEventListener("input", () => { tpl.priceFormula = formula.value; });
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(formula);
    root.appendChild(card);
  });
}

function renderSimpleList(id, items, fields, onDel) {
  const root = document.getElementById(id);
  root.innerHTML = "";
  if (!items.length) {
    root.innerHTML = '<p class="desc">Liste vide.</p>';
    return;
  }
  items.forEach((it, index) => {
    const row = document.createElement("div");
    row.className = "card-row";
    fields.forEach((f) => {
      const span = document.createElement("span");
      span.style.flex = "1";
      span.textContent = typeof f === "function" ? f(it) : (it[f] || "");
      row.appendChild(span);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "Retirer";
    del.addEventListener("click", () => onDel(index));
    row.appendChild(del);
    root.appendChild(row);
  });
}

function renderRepost() {
  renderSimpleList("repostList", state.repost, [(it) => it.title || it.url, (it) => it.url], (i) => {
    state.repost.splice(i, 1);
    renderRepost();
  });
}

function renderOrders() {
  renderSimpleList("ordersList", state.orders, [(it) => it.title, (it) => it.labelUrl || it.url], (i) => {
    state.orders.splice(i, 1);
    renderOrders();
  });
}

function renderPacking() {
  const root = document.getElementById("packingList");
  root.innerHTML = "";
  state.packing.forEach((p) => {
    const row = document.createElement("label");
    row.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!p.done;
    cb.addEventListener("change", () => { p.done = cb.checked; });
    row.appendChild(cb);
    const span = document.createElement("span");
    span.textContent = p.label;
    row.appendChild(span);
    root.appendChild(row);
  });
}

function renderSav() {
  renderSimpleList("savList", state.postsale, [
    (it) => it.title || it.id,
    (it) => (it.thankYouDone ? "merci ✓" : "merci " + (it.thankYouAt || "")),
    (it) => (it.reviewDone ? "avis ✓" : "avis " + (it.reviewAt || ""))
  ], (i) => {
    state.postsale.splice(i, 1);
    renderSav();
  });
}

function renderProfiles() {
  const root = document.getElementById("profilesList");
  root.innerHTML = "";
  state.profiles.forEach((p, index) => {
    const row = document.createElement("div");
    row.className = "card-row";
    const name = document.createElement("input");
    name.value = p.name;
    name.addEventListener("input", () => { p.name = name.value; });
    const notes = document.createElement("input");
    notes.value = p.notes || "";
    notes.placeholder = "Note";
    notes.addEventListener("input", () => { p.notes = notes.value; });
    const use = document.createElement("button");
    use.type = "button";
    use.className = "btn sm";
    use.textContent = p.id === state.activeProfileId ? "Actif" : "Activer";
    use.addEventListener("click", () => {
      state.activeProfileId = p.id;
      renderProfiles();
      renderKpis();
    });
    row.appendChild(name);
    row.appendChild(notes);
    row.appendChild(use);
    if (state.profiles.length > 1) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn danger";
      del.textContent = "×";
      del.addEventListener("click", () => {
        state.profiles.splice(index, 1);
        if (state.activeProfileId === p.id) state.activeProfileId = state.profiles[0].id;
        renderProfiles();
      });
      row.appendChild(del);
    }
    root.appendChild(row);
  });
}

function renderSched() {
  renderSimpleList("schedList", state.schedule, [
    (it) => it.title,
    (it) => it.when,
    (it) => (it.enabled === false ? "off" : "planifié")
  ], (i) => {
    state.schedule.splice(i, 1);
    renderSched();
  });
}

function renderAll() {
  fillSettingsForm();
  renderKpis();
  renderCrm();
  renderMsgCats();
  renderItemTpls();
  renderRepost();
  renderOrders();
  renderPacking();
  renderSav();
  renderProfiles();
  renderSched();
}

async function persist() {
  readSettingsFromForm();
  await VCA.storageSet({
    [VCA.KEYS.settings]: state.settings,
    [VCA.KEYS.templates]: state.templates,
    [VCA.KEYS.crm]: state.crm,
    [VCA.KEYS.repost]: state.repost,
    [VCA.KEYS.orders]: state.orders,
    [VCA.KEYS.packing]: state.packing,
    [VCA.KEYS.itemTemplates]: state.itemTemplates,
    [VCA.KEYS.profiles]: state.profiles,
    [VCA.KEYS.activeProfile]: state.activeProfileId,
    [VCA.KEYS.schedule]: state.schedule,
    [VCA.KEYS.postsale]: state.postsale
  });
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

document.getElementById("btnSave").addEventListener("click", async () => {
  await persist();
  chrome.runtime.sendMessage({ type: "VCA_SYNC_ALARMS" });
  showToast("Enregistré");
  renderKpis();
});

document.getElementById("btnReset").addEventListener("click", async () => {
  if (!confirm("Réinitialiser les modèles de messages et d’articles ?")) return;
  state.templates = VCA.clone(VCA.DEFAULT_TEMPLATES);
  state.itemTemplates = VCA.clone(VCA.DEFAULT_ITEM_TEMPLATES);
  await persist();
  renderAll();
  showToast("Modèles restaurés");
});

document.getElementById("btnCrmAdd").addEventListener("click", () => {
  state.crm.push({
    id: VCA.uid("crm"),
    title: "Nouvel article",
    listingUrl: "",
    purchasePrice: state.settings.costPrice || 0,
    salePrice: "",
    fees: "",
    shippingCost: state.settings.defaultShippingCost || 0,
    status: "stock",
    soldAt: "",
    notes: ""
  });
  renderCrm();
});

document.getElementById("btnCrmExport").addEventListener("click", () => {
  const csv = VCA.toCsv(state.crm);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vca-crm.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("crmImport").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = VCA.parseCsv(text);
  state.crm = state.crm.concat(rows);
  renderCrm();
  renderKpis();
  showToast(`${rows.length} ligne(s) importée(s)`);
  ev.target.value = "";
});

document.getElementById("btnItemAdd").addEventListener("click", () => {
  state.itemTemplates.push({
    id: VCA.uid("it"),
    name: "Nouveau modèle",
    title: "{{marque}} {{modele}}",
    description: "{{details}}",
    priceFormula: "achat + marge"
  });
  renderItemTpls();
});

document.getElementById("btnProfileAdd").addEventListener("click", () => {
  state.profiles.push({
    id: VCA.uid("prf"),
    name: "Nouveau profil",
    notes: ""
  });
  renderProfiles();
});

document.getElementById("btnSchedAdd").addEventListener("click", async () => {
  const title = document.getElementById("schedTitle").value.trim();
  const url = document.getElementById("schedUrl").value.trim();
  const when = document.getElementById("schedWhen").value;
  if (!title || !when) {
    showToast("Titre et date requis", false);
    return;
  }
  const iso = new Date(when).toISOString();
  if (Date.parse(iso) <= Date.now()) {
    showToast("Choisissez une date future", false);
    return;
  }
  state.schedule.push({
    id: VCA.uid("sch"),
    title,
    url,
    when: iso,
    enabled: true
  });
  await persist();
  chrome.runtime.sendMessage({ type: "VCA_SYNC_ALARMS" });
  renderSched();
  showToast("Rappel planifié");
});

document.getElementById("btnAiPerm").addEventListener("click", () => {
  chrome.permissions.request({ origins: ["https://*/*"] }, (granted) => {
    showToast(granted ? "Permission HTTPS accordée" : "Permission refusée", !!granted);
  });
});

async function init() {
  state = await VCA.loadAll();
  const tab = new URLSearchParams(location.search).get("tab");
  if (tab && TITLES[tab]) showTab(tab);
  renderAll();
}

init();
