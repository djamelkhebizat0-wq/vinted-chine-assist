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
    if (settings.cloudEnabled) return { skipped: "cloud" };
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
    if (settings.cloudEnabled) return { skipped: "cloud" };
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

  const FAV_RE = /favori|favourite|favorite/i;
  const FAV_SYS_RE = /(ajouté.{0,48}favoris?|mis en favori|added.{0,48}favourites?|a mis cet article en favori|nouveau favori|new favourite|added to (their )?favourites?)/i;

  function pageBlob(limit) {
    const main = document.querySelector("main, [role='main']") || document.body;
    const text = (main?.innerText || document.body?.innerText || "").slice(0, limit || 14000);
    return text;
  }

  function conversationLooksFavorite() {
    const blob = pageBlob();
    return FAV_SYS_RE.test(blob);
  }

  function sellerAlreadyRepliedInThread() {
    const nodes = [...document.querySelectorAll('[data-testid*="message"], [class*="message"], [class*="Message"]')]
      .filter((el) => !el.closest("#vca-root"));
    return nodes.some((el) => {
      const own = `${el.getAttribute("data-own") || ""} ${el.getAttribute("data-from-current-user") || ""}`;
      if (own === "true" || own === "1" || /true/.test(own)) return true;
      const t = `${el.className} ${el.getAttribute("data-testid") || ""}`;
      return /own-message|outgoing|current-user|from-me|is-mine/i.test(t);
    });
  }

  function collectFavTarget() {
    const p = page();
    const ctx = p.detectContext ? p.detectContext() : {};
    const conv = conversationId();
    const itemA = document.querySelector('a[href*="/items/"]:not(#vca-root a)');
    const itemId = itemIdFromUrl(itemA?.href || location.href);
    const memberA = [...document.querySelectorAll('a[href*="/member/"]:not(#vca-root a)')]
      .find((a) => /\/member\/\d+/.test(a.href || ""));
    const userId = ((memberA?.href || "").match(/\/member\/(\d+)/) || [])[1] || "";
    return {
      conversationId: conv,
      itemId,
      userId,
      nom: ctx.nom || "",
      article: ctx.article || textOfSafe(itemA),
      prix: ctx.prix || ""
    };
  }

  function textOfSafe(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function inboxFavoriteHrefs() {
    const links = [...document.querySelectorAll('a[href*="/inbox/"]')].filter((a) => !a.closest("#vca-root"));
    const hrefs = [];
    const seen = new Set();
    links.forEach((a) => {
      const href = a.href || "";
      if (!/\/inbox\/\d+/.test(href) || seen.has(href)) return;
      const row = a.closest("li, article, [role='listitem'], [class*='thread'], [class*='conversation'], [class*='notification']") || a;
      const hay = `${row.textContent || ""} ${a.textContent || ""} ${a.getAttribute("aria-label") || ""}`;
      if (FAV_RE.test(hay)) {
        seen.add(href);
        hrefs.push(href);
      }
    });
    return hrefs.slice(0, 8);
  }

  function scrapeFavoriteHrefs() {
    const hrefs = inboxFavoriteHrefs();
    const seen = new Set(hrefs);
    const add = (href) => {
      if (!href || seen.has(href)) return;
      seen.add(href);
      hrefs.push(href);
    };
    [...document.querySelectorAll("a[href]")].forEach((a) => {
      if (a.closest("#vca-root")) return;
      const href = a.href || "";
      const row = a.closest("li, article, [role='listitem'], [class*='notification']") || a;
      const hay = `${row.textContent || ""} ${a.textContent || ""}`;
      if (!FAV_RE.test(hay) && !FAV_SYS_RE.test(hay)) return;
      if (/\/inbox\/\d+/.test(href)) add(href);
      else if (/inbox\/new|receiver_id|opposite_user/i.test(href)) add(href);
    });
    return hrefs.slice(0, 8);
  }

  function isOwnItemPage() {
    const blob = (document.body?.innerText || "").slice(0, 6000);
    return /ont ajouté.{0,24}favoris|added this to their favourites|statistiques de l['’]article/i.test(blob)
      || !!findLabeledButton(/modifier|éditer|remettre en ligne|statistiques/i);
  }

  async function apiFavoriteHrefs() {
    const hrefs = [];
    try {
      const res = await vintedFetch("/api/v2/notifications?page=1&per_page=30", { method: "GET" });
      const list = res?.data?.notifications || res?.data?.items || res?.data?.entries || [];
      (Array.isArray(list) ? list : []).forEach((n) => {
        const t = `${n.type || ""} ${n.entry_type || n.subtype || ""} ${n.body || n.title || n.text || ""}`;
        if (!FAV_RE.test(t)) return;
        const id = n.conversation_id || n.thread_id || n.entity_id;
        let href = n.click_url || n.url || n.link || (id ? `/inbox/${id}` : "");
        if (!href) return;
        if (!/^https?:/i.test(href)) href = location.origin + href;
        hrefs.push(href);
      });
    } catch (_) { /* DOM fallback */ }
    return hrefs;
  }

  async function logFav(entry) {
    await report("VCA_AUTO_LOG", Object.assign({ type: "favoris" }, entry));
  }

  async function autoFavSend() {
    const settings = (await VCA.loadAll()).settings;
    if (settings.cloudEnabled) return { skipped: "cloud" };
    if (!settings.modeAuto) return { skipped: "off" };
    if (!settings.autoFavSend) return { skipped: "fav-off" };
    if (!VCA.localAutoActive(settings)) return { skipped: "cloud" };

    const p = page();
    const kind = p.pageKind ? p.pageKind() : "";

    if (kind === "inbox" && !conversationId()) {
      const favHrefs = scrapeFavoriteHrefs();
      const extra = await apiFavoriteHrefs();
      const all = [...new Set(favHrefs.concat(extra))];
      return { skipped: "inbox-list", favHrefs: all };
    }

    if (kind === "favorites" || (kind === "item" && isOwnItemPage()) || kind === "other") {
      if (kind !== "inbox") {
        const favHrefs = scrapeFavoriteHrefs().concat(await apiFavoriteHrefs());
        const unique = [...new Set(favHrefs)];
        if (!conversationId()) return { skipped: unique.length ? "open-fav" : "no-fav", favHrefs: unique };
      }
    }

    if (kind === "inbox" && conversationId()) {
      const offer = p.detectBuyerOffer ? p.detectBuyerOffer() : null;
      if (offer != null) return { skipped: "has-offer" };
      if (!conversationLooksFavorite()) return { skipped: "not-fav" };
    } else if (!conversationId()) {
      return { skipped: "not-inbox" };
    }

    const target = collectFavTarget();
    const key = VCA.favDedupeKey(target);
    if (!key) return { skipped: "no-id" };

    const all = await VCA.loadAll();
    if (VCA.wasFavSent(all.favSent, key)) return { skipped: "already" };

    const blob = `${target.article || ""} ${target.nom || ""} ${pageBlob(4000)}`;
    const blocked = VCA.favoriteAutoBlocked(blob);
    if (blocked) {
      await report("VCA_FAV_SENT", {
        key,
        ok: false,
        error: blocked,
        target: key,
        detail: VCA.guardReasonLabel(blocked)
      });
      return { skipped: blocked };
    }

    if (sellerAlreadyRepliedInThread()) {
      await report("VCA_FAV_SENT", {
        key,
        ok: false,
        error: "already",
        target: key,
        detail: "Déjà un message dans ce fil"
      });
      return { skipped: "already" };
    }

    const tpl = VCA.pickFavorisTemplate(all.templates, settings);
    if (!tpl || !VCA.templateReady(tpl)) {
      await logFav({ target: key, ok: false, error: "no-template", detail: VCA.guardReasonLabel("no-template") });
      return { ok: false, error: "no-template" };
    }

    const text = VCA.applyVars(tpl.text, p.currentVars
      ? p.currentVars({ nom: target.nom, article: target.article, prix: target.prix })
      : { nom: target.nom, article: target.article, prix: target.prix });
    if (!String(text || "").replace(/\{\{[^}]+\}\}/g, "").trim()) {
      await logFav({ target: key, ok: false, error: "empty", detail: VCA.guardReasonLabel("empty") });
      return { ok: false, error: "empty" };
    }

    const conv = target.conversationId || key;
    const gate = await report("VCA_GUARD_RESERVE", { kind: "message", conversationId: conv, processKey: key });
    if (!gate?.ok) {
      return { skipped: gate?.reason || "guard" };
    }

    const sent = await sendChatMessage(text);
    if (sent.ok) {
      await report("VCA_FAV_SENT", {
        key,
        ok: true,
        target: key,
        detail: `${tpl.label || "favoris"} ${sent.mode || ""}`
      });
      toastAuto("Mode auto : favori contacté");
    } else {
      await logFav({
        target: key,
        ok: false,
        error: sent.error || "échec",
        detail: sent.mode || ""
      });
    }
    return sent;
  }

  async function autoRepostHere() {
    const settings = (await VCA.loadAll()).settings;
    if (settings.cloudEnabled) return { skipped: "cloud" };
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
    if (settings.cloudEnabled) return { skipped: "cloud" };
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
        if (conversationId()) {
          if (settings.autoNegoSend) {
            const nego = await autoNegoSend();
            if (nego?.ok) return nego;
          }
          if (settings.autoFavSend) return await autoFavSend();
          return { skipped: "inbox-conv" };
        }
        const unread = inboxListUnreadHrefs();
        const fav = settings.autoFavSend ? await autoFavSend() : { favHrefs: [] };
        return {
          skipped: "inbox-list",
          unread,
          favHrefs: fav?.favHrefs || []
        };
      }
      if (settings.autoFavSend && (kind === "favorites" || kind === "item")) {
        const fav = await autoFavSend();
        if (fav?.ok || (fav?.favHrefs && fav.favHrefs.length)) return fav;
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
    abortAuto = !VCA.localAutoActive(changes[VCA.KEYS.settings].newValue);
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
    if (type === "VCA_AUTO_SEND_FAV") {
      autoFavSend().then(sendResponse);
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
          if (VCA.localAutoActive(all.settings)) runTick();
        });
      }, 1200);
    });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
})();
