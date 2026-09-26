/**
 * Moteur de négociation local (règles, sans API).
 * Optionnellement, un appel OpenAI-compatible est proxifié par le service worker
 * UNIQUEMENT si une clé est enregistrée — jamais simulé.
 */
(function (root) {
  "use strict";

  const VCA = (root.VCA = root.VCA || {});

  /**
   * @param {object} p
   * @param {number} p.listPrice
   * @param {number} p.offer
   * @param {number} [p.costPrice]
   * @param {number} [p.minMarginEur]
   * @param {number} [p.floorPrice]
   * @param {number} [p.maxDropPercent]
   * @param {number} [p.counterStepPercent]
   */
  VCA.computeNego = function computeNego(p) {
    const list = Number(p.listPrice);
    const offer = Number(p.offer);
    if (!Number.isFinite(list) || list <= 0) {
      return { ok: false, error: "Prix affiché invalide" };
    }
    if (!Number.isFinite(offer) || offer < 0) {
      return { ok: false, error: "Offre invalide" };
    }

    const cost = Number(p.costPrice) || 0;
    const minMargin = Number(p.minMarginEur) || 0;
    const floorSetting = Number(p.floorPrice) || 0;
    const maxDrop = Number.isFinite(Number(p.maxDropPercent)) ? Number(p.maxDropPercent) : 15;
    const stepPct = Number.isFinite(Number(p.counterStepPercent)) ? Number(p.counterStepPercent) : 8;

    const dropFloor = list * (1 - Math.max(0, Math.min(90, maxDrop)) / 100);
    const costFloor = cost > 0 ? cost : 0;
    const marginFloor = cost > 0 ? cost + minMargin : 0;
    const floor = VCA.roundEuro(Math.max(floorSetting, dropFloor, costFloor, 0));

    // Sans prix d'achat : objectif = prix affiché (on contre jusqu'au plancher).
    // Avec achat : objectif = achat + marge, jamais sous le plancher effectif.
    let target = cost > 0 ? marginFloor : list;
    target = VCA.roundEuro(Math.max(target, floor));

    const stepAmt = list * (Math.max(0, Math.min(50, stepPct)) / 100);

    if (offer >= target && offer >= floor) {
      return {
        ok: true,
        action: "accept",
        floor,
        target,
        suggested: VCA.roundEuro(offer),
        listPrice: list,
        offer,
        reason: `Offre ≥ objectif (${VCA.formatEuro(target)} €) et ≥ plancher (${VCA.formatEuro(floor)} €).`
      };
    }

    if (offer < floor) {
      return {
        ok: true,
        action: "refuse",
        floor,
        target,
        suggested: null,
        listPrice: list,
        offer,
        reason: `Offre sous le plancher (${VCA.formatEuro(floor)} €). Refus — ne pas descendre plus bas.`
      };
    }

    let suggested = list;
    const maxSteps = 10;
    for (let i = 1; i <= maxSteps; i += 1) {
      const candidate = VCA.roundEuro(list - stepAmt * i);
      if (candidate < floor - 0.001) break;
      suggested = Math.max(floor, candidate);
      if (suggested > offer) break;
    }
    suggested = VCA.roundEuro(Math.max(floor, suggested));
    if (suggested <= offer) {
      suggested = VCA.roundEuro(Math.max(floor, Math.min(list, offer + Math.max(stepAmt, 1))));
    }
    if (suggested <= offer && offer < target) {
      suggested = VCA.roundEuro(Math.max(floor, Math.min(list, (offer + target) / 2)));
    }

    return {
      ok: true,
      action: "counter",
      floor,
      target,
      suggested,
      listPrice: list,
      offer,
      reason: `Contre-offre par paliers (−${stepPct} %). Objectif ${VCA.formatEuro(target)} €, plancher ${VCA.formatEuro(floor)} €.`
    };
  };

  VCA.negoMessageFor = function negoMessageFor(result, templates) {
    const t = templates || VCA.DEFAULT_TEMPLATES;
    const nego = t.nego || [];
    if (result.action === "accept") {
      return nego.find((x) => x.id === "nego-accepte")
        || nego.find((x) => /accepte/i.test(x.label || ""))
        || { text: "Parfait, j'accepte votre offre de {{offre}} € !" };
    }
    if (result.action === "refuse") {
      return nego.find((x) => x.id === "nego-refuse-plancher")
        || { text: "Merci pour votre offre. Je ne peux pas descendre sous {{plancher}} €." };
    }
    return nego.find((x) => x.id === "nego-contre")
      || nego.find((x) => /contre/i.test(x.label || ""))
      || { text: "Merci pour votre offre ! Je peux vous proposer {{contre}} €." };
  };

  VCA.negoVars = function negoVars(result, extra) {
    const e = extra || {};
    return {
      prix: result.listPrice != null ? VCA.formatEuro(result.listPrice) : (e.prix || ""),
      offre: result.offer != null ? VCA.formatEuro(result.offer) : (e.offre || ""),
      contre: result.suggested != null ? VCA.formatEuro(result.suggested) : (e.contre || ""),
      plancher: result.floor != null ? VCA.formatEuro(result.floor) : (e.plancher || ""),
      nom: e.nom || "",
      article: e.article || ""
    };
  };

  VCA.clampAiResult = function clampAiResult(local, aiSuggested) {
    if (!local || !local.ok) return local;
    const n = Number(aiSuggested);
    if (!Number.isFinite(n)) return local;
    const clamped = VCA.roundEuro(Math.max(local.floor, n));
    return {
      ...local,
      suggested: local.action === "refuse" ? null : clamped,
      aiUsed: true,
      aiSuggested: n,
      reason: local.reason + " Suggestion IA bornée au plancher."
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
