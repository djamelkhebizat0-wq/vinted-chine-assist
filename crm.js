function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  el.className = "toast ok";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2000);
}

let crm = [];
let settings = VCA.clone(VCA.DEFAULT_SETTINGS);

function kpis() {
  const st = VCA.crmStats(crm, settings);
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><b>${VCA.formatEuro(st.caMonth)} €</b><span>CA du mois</span></div>
    <div class="kpi"><b>${VCA.formatEuro(st.profit)} €</b><span>Marge nette</span></div>
    <div class="kpi"><b>${st.soldCount}</b><span>Vendus</span></div>
    <div class="kpi"><b>${st.stock}</b><span>En stock</span></div>`;
}

function render() {
  const tb = document.querySelector("#crmTable tbody");
  tb.innerHTML = "";
  crm.forEach((it, index) => {
    const fees = it.fees === "" || it.fees == null
      ? VCA.estimateFees(it.salePrice, settings)
      : Number(it.fees) || 0;
    const margin = it.status === "sold" ? VCA.netMargin({ ...it, fees }, settings) : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-k="title" value="${VCA.esc(it.title || "")}" /></td>
      <td><input data-k="listingUrl" value="${VCA.esc(it.listingUrl || "")}" /></td>
      <td><input data-k="purchasePrice" type="number" step="0.01" value="${it.purchasePrice ?? 0}" /></td>
      <td><input data-k="salePrice" type="number" step="0.01" value="${it.salePrice ?? ""}" /></td>
      <td><input data-k="fees" type="number" step="0.01" value="${it.fees ?? ""}" /></td>
      <td><input data-k="shippingCost" type="number" step="0.01" value="${it.shippingCost ?? 0}" /></td>
      <td>
        <select data-k="status">
          <option value="stock" ${it.status !== "sold" ? "selected" : ""}>Stock</option>
          <option value="sold" ${it.status === "sold" ? "selected" : ""}>Vendu</option>
        </select>
      </td>
      <td><input data-k="soldAt" type="date" value="${VCA.esc((it.soldAt || "").slice(0, 10))}" /></td>
      <td>${margin === "—" ? "—" : VCA.formatEuro(margin) + " €"}</td>
      <td></td>`;
    const del = document.createElement("button");
    del.className = "btn danger";
    del.type = "button";
    del.textContent = "Suppr.";
    del.addEventListener("click", () => {
      crm.splice(index, 1);
      render();
      kpis();
    });
    tr.lastElementChild.appendChild(del);
    tr.querySelectorAll("[data-k]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const k = inp.dataset.k;
        let v = inp.value;
        if (["purchasePrice", "salePrice", "fees", "shippingCost"].includes(k)) v = v === "" ? "" : Number(v);
        const was = it.status;
        it[k] = v;
        if (k === "status" && v === "sold" && was !== "sold") {
          it.soldAt = it.soldAt || VCA.todayISODate();
          if (it.fees === "" || it.fees == null) it.fees = VCA.estimateFees(it.salePrice, settings);
        }
        render();
        kpis();
      });
    });
    tb.appendChild(tr);
  });
  kpis();
}

async function save() {
  await VCA.storageSet({ [VCA.KEYS.crm]: crm });
  toast("CRM enregistré");
}

document.getElementById("btnAdd").addEventListener("click", () => {
  crm.push({
    id: VCA.uid("crm"),
    title: "Nouvel article",
    listingUrl: "",
    purchasePrice: 0,
    salePrice: "",
    fees: "",
    shippingCost: settings.defaultShippingCost || 0,
    status: "stock",
    soldAt: "",
    notes: ""
  });
  render();
});

document.getElementById("btnExport").addEventListener("click", () => {
  const blob = new Blob([VCA.toCsv(crm)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vca-crm.csv";
  a.click();
});

document.getElementById("imp").addEventListener("change", async (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  crm = crm.concat(VCA.parseCsv(await f.text()));
  render();
  toast("Import OK");
  ev.target.value = "";
});

document.getElementById("btnSave").addEventListener("click", save);

(async () => {
  const all = await VCA.loadAll();
  crm = all.crm;
  settings = all.settings;
  render();
})();
