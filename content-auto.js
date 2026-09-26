/**
 * Mode auto — envoi DOM / API session, repost, post-vente.
 * Ne fait rien si settings.modeAuto === false.
 */
(() => {
  "use strict";

  const VCA = globalThis.VCA;
  if (!VCA) return;

  let abortAuto = false;
  let tickBusy = false;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function page() {
    return VCA.page || {};
  }

  function conversationId() {
    const m = location.pathname.match(/\/inbox\/([^/?#]+)/i);
    return m ? m[1] : "";
  }

  function itemIdFromUrl(url) {
    const m = String(url || location.href).match(/\/items\/(\d+)/);
    return m ? m[1] : "";
  }

  function findSendButton() {
    const selectors = [
      'button[data-testid*="send" i]',
      'button[data-testid*="submit" i]',
      'button[type="submit"]',
      'button[aria-label*="envoyer" i]',
      'button[aria-label*="send" i]',
      '[data-testid="inbox-reply-submit"]',
      '[data-testid="inbox-message-form"] button[type="submit"]',
      "form button[type='submit']"
    ];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      for (const el of nodes) {
        if (!el || el.closest("#vca-root")) continue;
        if (el.disabled) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 12 || rect.height < 12) continue;
        return el;
      }
    }
    const labeled = [...document.querySelectorAll("button")].filter((el) => {
      if (el.closest("#vca-root")) return false;
      const t = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""}`;
      return /envoyer|send/i.test(t) && !/acheter|buy|payer/i.test(t);
    });
    return labeled[0] || null;
  }

  function findLabeledButton(re) {
    const nodes = [...document.querySelectorAll("button, a, [role='button']")];
    for (const el of nodes) {
      if (el.closest("#vca-root")) continue;
      const t = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`;
      if (re.test(t) && !/acheter|buy now|passer commande|checkout/i.test(t)) {
        return el;
      }
    }
    return null;
  }

  function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")
      || document.querySelector('meta[name="csrf_token"]')?.getAttribute("content")
      || "";
  }

  async function vintedFetch(path, opts) {
    const headers = Object.assign({
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest"
    }, opts?.headers || {});
    const csrf = csrfToken();
    if (csrf) headers["X-CSRF-Token"] = csrf;
    if (opts?.json) headers["Content-Type"] = "application/json";
    const res = await fetch(path, {
      method: opts?.method || "GET",
      credentials: "include",
      headers,
      body: opts?.json ? JSON.stringify(opts.json) : opts?.body
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }
    return { ok: res.ok, status: res.status, data, text: text.slice(0, 240) };
  }

  async function tryApiReply(text) {
    const id = conversationId();
    if (!id || !/^\d+$/.test(id)) return { ok: false, error: "no-conv" };
    const payloads = [
      { path: `/api/v2/conversations/${id}/replies`, json: { reply: { body: text, photo_ids: [] } } },
      { path: `/api/v2/conversations/${id}/reply`, json: { body: text } },
      { path: `/api/v2/conversations/${id}/messages`, json: { body: text } }
    ];
    for (const p of payloads) {
      try {
        const res = await vintedFetch(p.path, { method: "POST", json: p.json });
        if (res.ok) return { ok: true, mode: "api", status: res.status };
      } catch (_) { /* try next */ }
    }
    return { ok: false, error: "api-fail" };
  }

  async function sendChatMessage(text) {
    const p = page();
    const trimmed = String(text || "").trim();
    if (!trimmed) return { ok: false, error: "empty" };
    const ins = p.insertText ? p.insertText(trimmed) : { ok: false };
    if (ins.ok) {
      await sleep(350);
      const btn = findSendButton();
      if (btn) {
        btn.click();
        await sleep(400);
        return { ok: true, mode: "dom-send" };
      }
      const el = p.findChatInput ? p.findChatInput() : null;
      if (el) {
        el.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
        }));
        await sleep(300);
      }
    }
    const api = await tryApiReply(trimmed);
    if (api.ok) return api;
    return { ok: false, error: ins.ok ? "no-send-btn" : "no-input" };
  }

  function detectSaleOnPage() {
    const blob = (document.body?.innerText || "").slice(0, 8000);
    return /(a acheté|article vendu|paiement reçu|you sold|bought your|commande confirmée)/i.test(blob);
  }

  function inboxListUnreadHrefs() {
    const links = [...document.querySelectorAll('a[href*="/inbox/"]')].filter((a) => !a.closest("#vca-root"));
    const hrefs = [];
    const seen = new Set();
    links.forEach((a) => {
      const href = a.href || "";
      if (!/\/inbox\/\d+/.test(href) || seen.has(href)) return;
      const row = a.closest("li, article, [role='listitem'], [class*='thread'], [class*='conversation']") || a;
      const hay = `${row.className} ${row.getAttribute("data-testid") || ""} ${row.textContent || ""}`;
      const unread = /unread|non[- ]lu|nouveau/i.test(hay) || row.querySelector("[class*='unread'], [data-testid*='unread']");
      if (unread) {
        seen.add(href);
        hrefs.push(href);
      }
    });
    if (!hrefs.length) {
      links.forEach((a) => {
        if (/\/inbox\/\d+/.test(a.href) && !seen.has(a.href)) {
          seen.add(a.href);
          hrefs.push(a.href);
        }
      });
    }
    return hrefs.slice(0, 5);
  }

  async function report(type, payload) {
    try {
      return await chrome.runtime.sendMessage(Object.assign({ type }, payload));
    } catch (_) {
      return { ok: false };
    }
  }

  function toastAuto(msg) {
    if (page().toast) page().toast(msg);
  }

  async function autoNegoSend() {
    const p = page();
    if (!p.pageKind || p.pageKind() !== "inbox") return { skipped: "not-inbox" };
    if (!conversationId()) {
      const hrefs = inboxListUnreadHrefs();
      return { skipped: "inbox-list", unread: hrefs };
    }
    const settings = (await VCA.loadAll()).settings;
    if (!settings.modeAuto || !settings.autoNegoSend) return { skipped: "nego-off" };

    const offer = p.detectBuyerOffer ? p.detectBuyerOffer() : null;
    const listPrice = p.detectListedPrice ? p.detectListedPrice() : null;
    if (offer == null || !listPrice) {
      return { skipped: "no-offer" };
    }
    if (detectSaleOnPage()) {
      return autoPostSaleSend("merci");
    }

    const conv = conversationId();
    const key = `nego:${conv}:${offer}:${listPrice}`;
    const g0 = await VCA.loadGuard();
    if (VCA.wasProcessed(g0.state, key)) return { skipped: "already" };

    const input = {
      listPrice,
      offer,
      costPrice: settings.costPrice,
      minMarginEur: settings.minMarginEur,
      floorPrice: settings.floorPrice,
      maxDropPercent: settings.maxDropPercent,
      counterStepPercent: settings.counterStepPercent
    };
    let result = VCA.computeNego(input);
    if (!result?.ok) return { skipped: "nego-invalid" };

    if (result.action === "accept" && VCA.offerBelowMinMargin(offer, settings)) {
      result = { ...result, action: "refuse", suggested: null, reason: "Marge mini : acceptation auto bloquée." };
    }

    const all = await VCA.loadAll();
    const tpl = VCA.negoMessageFor(result, all.templates);
    if (!VCA.templateReady(tpl)) {
      await report("VCA_AUTO_LOG", { type: "nego", target: conv, ok: false, error: "no-template" });
      return { ok: false, error: "no-template" };
    }

    const ctx = p.detectContext ? p.detectContext() : {};
    let text = VCA.applyVars(tpl.text, p.currentVars
      ? p.currentVars(VCA.negoVars(result, ctx))
      : VCA.negoVars(result, ctx));

    if (settings.openaiApiKey) {
      try {
        const ai = await chrome.runtime.sendMessage({
          type: "VCA_AI_NEGO",
          input,
          article: ctx.article,
          nom: ctx.nom
        });
        if (ai?.message && String(ai.message).trim()) {
          const merged = ai.local || result;
          if (merged.action !== "accept" || !VCA.offerBelowMinMargin(offer, settings)) {
            text = String(ai.message).trim();
            result = merged;
          }
        }
      } catch (_) { /* règles locales */ }
    }

    const gate = await report("VCA_GUARD_RESERVE", { kind: "message", conversationId: conv, processKey: key });
    if (!gate?.ok) {
      return { skipped: gate?.reason || "guard" };
    }

    const sent = await sendChatMessage(text);
    await report("VCA_AUTO_LOG", {
      type: "nego",
      target: conv,
      ok: sent.ok,
      error: sent.error || "",
      detail: `${result.action} ${offer}€ / ${listPrice}€ ${sent.mode || ""}`
    });

    if (sent.ok && result.action === "accept" && !VCA.offerBelowMinMargin(offer, settings)) {
      const acceptBtn = findLabeledButton(/accepter l['’]offre|accept offer|^accepter$/i);
      if (acceptBtn) acceptBtn.click();
    }
    if (sent.ok) toastAuto("Mode auto : message envoyé");
    return sent;
  }

  async function autoPostSaleSend(kind) {
    const settings = (await VCA.loadAll()).settings;
    if (!settings.modeAuto || !settings.autoPostSaleSend) return { skipped: "sav-off" };
    const all = await VCA.loadAll();
    const want = kind === "avis" ? "sav-avis" : "sav-merci";
    const tpl = (all.templates.postVente || []).find((t) => t.id === want)
      || (all.templates.postVente || [])[0];
    if (!VCA.templateReady(tpl)) {
      await report("VCA_AUTO_LOG", { type: "postsale", target: conversationId(), ok: false, error: "no-template" });
      return { ok: false, error: "no-template" };
    }
    const conv = conversationId() || "sav";
    const key = `sav:${conv}:${want}`;
    const g0 = await VCA.loadGuard();
    if (VCA.wasProcessed(g0.state, key)) return { skipped: "already" };
    const p = page();
    const text = VCA.applyVars(tpl.text, p.currentVars ? p.currentVars() : {});
    const gate = await report("VCA_GUARD_RESERVE", { kind: "message", conversationId: conv, processKey: key });
    if (!gate?.ok) return { skipped: gate?.reason || "guard" };
    const sent = await sendChatMessage(text);
    await report("VCA_AUTO_LOG", {
      type: "postsale",
      target: conv,
      ok: sent.ok,
      error: sent.error || "",
      detail: want
    });
    if (sent.ok) toastAuto("Mode auto : post-vente envoyé");
    return sent;
  }

  async function autoRepostHere() {
    const settings = (await VCA.loadAll()).settings;
    if (!settings.modeAuto || !settings.autoRepostDo) return { skipped: "repost-off" };
    const p = page();
    const kind = p.pageKind ? p.pageKind() : "";
    const id = itemIdFromUrl();

    const republish = findLabeledButton(/remettre en ligne|republier|reposter|mettre en ligne à nouveau/i);
    if (republish) {
      republish.click();
      await sleep(600);
      return { ok: true, mode: "republish", itemId: id };
    }

    if (kind === "item") {
      const edit = document.querySelector('a[href*="/edit"]')
        || findLabeledButton(/modifier|éditer|edit listing/i);
      if (edit) {
        sessionStorage.setItem("vca_repost_save", id || "1");
        edit.click();
        return { ok: true, mode: "goto-edit", itemId: id };
      }
      return { ok: false, error: "no-edit" };
    }

    if (kind === "item-form" || sessionStorage.getItem("vca_repost_save")) {
      const save = findLabeledButton(/enregistrer|sauvegarder|save|valider/i)
        || document.querySelector('form button[type="submit"], button[type="submit"]');
      if (save && !/acheter|supprimer|delete/i.test(save.textContent || "")) {
        save.click();
        sessionStorage.removeItem("vca_repost_save");
        await sleep(500);
        return { ok: true, mode: "save", itemId: id };
      }
      return { ok: false, error: "no-save" };
    }
    return { skipped: "not-item" };
  }

  async function runTick() {
    if (abortAuto || tickBusy) return { skipped: "busy" };
    const settings = (await VCA.loadAll()).settings;
    if (!settings.modeAuto) return { skipped: "off" };
    tickBusy = true;
    try {
      const p = page();
      const kind = p.pageKind ? p.pageKind() : "";
      if (kind === "inbox") {
        if (detectSaleOnPage() && settings.autoPostSaleSend) {
          const sav = await autoPostSaleSend("merci");
          if (sav?.ok) return sav;
        }
        return await autoNegoSend();
      }
      if ((kind === "item" || kind === "item-form") && sessionStorage.getItem("vca_repost_save")) {
        return await autoRepostHere();
      }
      return { skipped: kind };
    } finally {
      tickBusy = false;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[VCA.KEYS.settings]) return;
    abortAuto = !changes[VCA.KEYS.settings].newValue?.modeAuto;
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const type = msg?.type;
    if (type === "VCA_AUTO_TICK") {
      runTick().then(sendResponse);
      return true;
    }
    if (type === "VCA_AUTO_REPOST_THIS") {
      autoRepostHere().then(sendResponse);
      return true;
    }
    if (type === "VCA_AUTO_SEND_SAV") {
      autoPostSaleSend(msg.kind || "merci").then(sendResponse);
      return true;
    }
    if (type === "VCA_AUTO_SEND_NEGO") {
      autoNegoSend().then(sendResponse);
      return true;
    }
    if (type === "VCA_AUTO_KILL") {
      abortAuto = true;
      sendResponse({ ok: true });
      return true;
    }
    if (type === "VCA_AUTO_RESUME") {
      abortAuto = false;
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  const origWatch = true;
  if (origWatch) {
    let t = null;
    const obs = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        VCA.loadAll().then((all) => {
          if (all.settings.modeAuto) runTick();
        });
      }, 1200);
    });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
})();
