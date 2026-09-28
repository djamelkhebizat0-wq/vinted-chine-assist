/**
 * Accès Vinted côté serveur : HTTP session (cookies) puis Playwright si l’API refuse.
 * Ce n’est PAS une API officielle Vinted.
 */

function cookieHeader(cookies) {
  return (cookies || []).map((c) => `${c.name}=${c.value}`).join("; ");
}

function originOf(session) {
  return session?.origin || process.env.VINTED_ORIGIN || "https://www.vinted.fr";
}

export async function httpInbox(session) {
  const origin = originOf(session);
  const ua = session.userAgent || "Mozilla/5.0";
  const res = await fetch(`${origin}/api/v2/inbox?page=1&per_page=20`, {
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader(session.cookies),
      "User-Agent": ua,
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
}

export async function httpReply(session, conversationId, body) {
  const origin = originOf(session);
  const ua = session.userAgent || "Mozilla/5.0";
  const paths = [
    { path: `/api/v2/conversations/${conversationId}/replies`, json: { reply: { body, photo_ids: [] } } },
    { path: `/api/v2/conversations/${conversationId}/reply`, json: { body } },
    { path: `/api/v2/conversations/${conversationId}/messages`, json: { body } }
  ];
  for (const p of paths) {
    const res = await fetch(origin + p.path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookieHeader(session.cookies),
        "User-Agent": ua,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(p.json)
    });
    if (res.ok) return { ok: true, status: res.status, mode: "http" };
  }
  return { ok: false, error: "http-reply-fail" };
}

export function parseMoneyLoose(v) {
  if (v == null || v === "") return null;
  if (typeof v === "object") v = v.amount ?? v.value ?? v.numeric ?? v.price;
  const n = Number(String(v).replace(/\s/g, "").replace("€", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function extractOfferFromText(text) {
  const s = String(text || "");
  const patterns = [
    /offre[^\d]{0,24}(\d+(?:[.,]\d{1,2})?)/i,
    /propose[^\d]{0,24}(\d+(?:[.,]\d{1,2})?)/i,
    /(\d+(?:[.,]\d{1,2})?)\s*€/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n < 100000) return n;
  }
  return null;
}

export function parseInboxConversations(data) {
  const list = data?.conversations || data?.inbox_items || data?.items || data?.data || [];
  if (!Array.isArray(list)) return [];
  return list.map((c) => {
    const id = String(c.id || c.conversation_id || c.thread_id || "");
    const last = c.last_message || c.lastMessage || c.message || {};
    const fromMe = !!(last.is_from_current_user || last.is_sent_by_current_user || last.outgoing);
    const body = last.body || last.content || last.text || c.preview || "";
    const item = c.item || c.item_data || {};
    const listPrice = parseMoneyLoose(item.price) ?? parseMoneyLoose(item.price_numeric) ?? parseMoneyLoose(c.item_price);
    const offer = parseMoneyLoose(c.offer || c.offer_price || last.offer || last.price) ?? extractOfferFromText(body);
    const unread = c.unread === true || c.read_by_current_user === false;
    return {
      conversationId: id,
      fromMe,
      unread,
      body: String(body).slice(0, 400),
      offer,
      listPrice,
      nom: c.opposite_user?.login || c.opposite_user?.name || c.user?.login || "",
      article: item.title || c.title || "",
      href: c.url || (id ? `/inbox/${id}` : "")
    };
  }).filter((x) => x.conversationId);
}

export function parseScrapedInbox(rows) {
  return (rows || []).map((row) => {
    const href = String(row.href || "");
    const m = href.match(/\/inbox\/(\d+)/);
    const text = String(row.text || "");
    const prices = [...text.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*€/g)].map((x) => Number(x[1].replace(",", ".")));
    const listPrice = prices.length ? prices[0] : null;
    const offer = extractOfferFromText(text) || (prices.length > 1 ? prices[1] : null);
    return {
      conversationId: m ? m[1] : "",
      fromMe: /vous :|you:/i.test(text.slice(0, 80)),
      unread: /non[- ]lu|unread|nouveau/i.test(text),
      body: text.slice(0, 400),
      offer,
      listPrice,
      nom: "",
      article: text.split("\n")[0] || "",
      href
    };
  }).filter((x) => x.conversationId);
}

function toPlaywrightCookies(session) {
  const origin = originOf(session);
  const domain = origin.includes("vinted.com") ? ".vinted.com" : ".vinted.fr";
  return (session.cookies || []).map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || domain,
    path: c.path || "/",
    httpOnly: !!c.httpOnly,
    secure: c.secure !== false,
    sameSite: c.sameSite === "no_restriction" ? "None" : (c.sameSite || "Lax")
  }));
}

export async function playwrightAction(session, fn) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    return { ok: false, error: "playwright-missing", detail: String(err.message || err) };
  }
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({
      userAgent: session.userAgent || undefined,
      locale: "fr-FR"
    });
    await context.addCookies(toPlaywrightCookies(session));
    const page = await context.newPage();
    return await fn(page, originOf(session));
  } finally {
    await browser.close();
  }
}

export async function playwrightInbox(session) {
  return playwrightAction(session, async (page, origin) => {
    await page.goto(`${origin}/inbox`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const body = await page.locator("body").innerText();
    const loggedOut = /se connecter|log in|e-mail/i.test(body.slice(0, 800));
    let rows = [];
    try {
      rows = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a[href*="/inbox/"]')];
        const seen = new Set();
        const out = [];
        for (const a of links) {
          if (!/\/inbox\/\d+/.test(a.href) || seen.has(a.href)) continue;
          seen.add(a.href);
          const row = a.closest("li, article, [role='listitem']") || a;
          out.push({ href: a.href, text: (row.innerText || "").slice(0, 500) });
        }
        return out.slice(0, 20);
      });
    } catch { /* ignore */ }
    return {
      ok: !loggedOut,
      status: loggedOut ? 401 : 200,
      mode: "playwright",
      snippet: body.slice(0, 160),
      conversations: parseScrapedInbox(rows)
    };
  });
}

export async function playwrightReply(session, conversationId, text) {
  return playwrightAction(session, async (page, origin) => {
    await page.goto(`${origin}/inbox/${conversationId}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const box = page.locator("textarea, [contenteditable='true']").first();
    await box.waitFor({ timeout: 15000 });
    await box.fill(text);
    const send = page.locator("button[type='submit'], button[aria-label*='envoyer' i]").first();
    if (await send.count()) await send.click();
    else await box.press("Enter");
    return { ok: true, mode: "playwright" };
  });
}

export async function playwrightRepost(session, itemUrl) {
  return playwrightAction(session, async (page) => {
    await page.goto(itemUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const republish = page.getByRole("button", { name: /remettre en ligne|republier/i });
    if (await republish.count()) {
      await republish.first().click();
      return { ok: true, mode: "republish" };
    }
    const edit = page.locator('a[href*="/edit"]').first();
    if (await edit.count()) {
      await edit.click();
      await page.waitForTimeout(1200);
      const save = page.getByRole("button", { name: /enregistrer|sauvegarder|save/i });
      if (await save.count()) await save.first().click();
      return { ok: true, mode: "save" };
    }
    return { ok: false, error: "no-repost-control" };
  });
}

export async function httpCatalog(session, searchText) {
  const origin = originOf(session);
  const ua = session.userAgent || "Mozilla/5.0";
  const url = `${origin}/api/v2/catalog/items?search_text=${encodeURIComponent(searchText || "")}&per_page=24&order=newest_first`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader(session.cookies),
      "User-Agent": ua,
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  const items = data?.items || data?.catalog_items || [];
  const cards = (Array.isArray(items) ? items : []).map((it) => ({
    id: String(it.id || it.item_id || ""),
    url: it.url || (it.id ? `${origin}/items/${it.id}` : ""),
    title: it.title || it.name || "",
    price: parseMoneyLoose(it.price) ?? parseMoneyLoose(it.price_numeric),
    raw: `${it.title || ""} ${it.description || ""}`.slice(0, 280),
    sellerNew: Number(it.user?.feedback_count || it.user?.positive_feedback_count) === 0
  })).filter((c) => c.id);
  return { ok: res.ok, status: res.status, mode: "http", cards };
}

export async function playwrightCatalog(session, searchUrl) {
  return playwrightAction(session, async (page) => {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const loggedOut = /se connecter|log in/i.test((await page.locator("body").innerText()).slice(0, 400));
    if (loggedOut) return { ok: false, status: 401, mode: "playwright", cards: [] };
    const cards = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/items/"]')];
      const seen = new Set();
      const out = [];
      for (const a of links) {
        const m = (a.href || "").match(/\/items\/(\d+)/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const card = a.closest("article, li, [data-testid*='item']") || a.parentElement;
        const text = ((card && card.innerText) || "").replace(/\s+/g, " ").slice(0, 280);
        const img = card && card.querySelector && card.querySelector("img");
        const pm = text.match(/(\d+[.,]\d+|\d+)\s*€/);
        out.push({
          id: m[1],
          url: a.href.split("?")[0],
          title: String((img && img.alt) || a.innerText || "").slice(0, 180),
          price: pm ? pm[1] : null,
          raw: text,
          sellerNew: /0 avis|nouveau/i.test(text)
        });
      }
      return out.slice(0, 40);
    });
    return { ok: true, mode: "playwright", cards };
  });
}
