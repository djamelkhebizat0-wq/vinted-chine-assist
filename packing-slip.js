document.getElementById("btnPrint").addEventListener("click", () => window.print());

(async () => {
  const all = await VCA.loadAll();
  const params = new URLSearchParams(location.search);
  const only = params.get("id");
  let items = (all.crm || []).filter((i) => i.status === "sold");
  if (only) {
    const one = all.crm.find((i) => i.id === only);
    items = one ? [one] : [];
  }
  const packing = all.packing || [];
  const root = document.getElementById("slips");
  if (!items.length) {
    root.innerHTML = "<p>Aucun article vendu dans le CRM. Marquez un article « Vendu » puis réouvrez cette page.</p>";
    return;
  }
  root.innerHTML = items.map((it) => {
    const fees = it.fees === "" || it.fees == null
      ? VCA.estimateFees(it.salePrice, all.settings)
      : it.fees;
    const net = VCA.netMargin({ ...it, fees }, all.settings);
    const checks = packing.map((p) =>
      `<li>${p.done ? "☑" : "☐"} ${VCA.esc(p.label)}</li>`
    ).join("");
    return `<article class="slip">
      <h2>${VCA.esc(it.title || "Article")}</h2>
      <p class="muted">${VCA.esc(it.listingUrl || "")}</p>
      <table>
        <tr><th>Achat</th><td>${VCA.formatEuro(it.purchasePrice)} €</td></tr>
        <tr><th>Vente</th><td>${VCA.formatEuro(it.salePrice)} €</td></tr>
        <tr><th>Frais estimés</th><td>${VCA.formatEuro(fees)} €</td></tr>
        <tr><th>Port</th><td>${VCA.formatEuro(it.shippingCost)} €</td></tr>
        <tr><th>Marge nette</th><td>${VCA.formatEuro(net)} €</td></tr>
        <tr><th>Vendu le</th><td>${VCA.esc(it.soldAt || "—")}</td></tr>
      </table>
      <h3>Checklist colis</h3>
      <ul>${checks}</ul>
    </article>`;
  }).join("");
})();
