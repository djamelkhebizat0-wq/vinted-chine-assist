/**
 * Extraction des cartes catalogue Vinted (Radar). HTML fragile, best-effort.
 */
(() => {
  "use strict";

  const VCA = globalThis.VCA;
  if (!VCA) return;

  function isCatalogPage() {
    const u = location.href || "";
    return /\/catalog|search_text=|\/vetements|\/catalog\?/i.test(u);
  }

  function scrapeCatalogCards() {
    const links = [...document.querySelectorAll('a[href*="/items/"]')].filter((a) => {
      if (a.closest("#vca-root")) return false;
      return /\/items\/\d+/.test(a.href || "");
    });
    const seen = new Set();
    const cards = [];
    for (const a of links) {
      const m = (a.href || "").match(/\/items\/(\d+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const card = a.closest('[data-testid*="item"], article, li, [class*="feed-grid"], [class*="new-item-box"], [class*="ItemBox"]')
        || a.parentElement;
      const text = ((card && card.innerText) || a.innerText || "").replace(/\s+/g, " ").trim();
      const img = card?.querySelector?.("img") || a.querySelector("img");
      const title = String(img?.alt || a.getAttribute("title") || a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 180);
      const priceMatch = text.match(/(\d+[.,]\d+|\d+)\s*€/);
      const price = VCA.parseMoney(priceMatch ? priceMatch[1] : "");
      cards.push({
        id: m[1],
        url: a.href.split("?")[0],
        title: title || text.slice(0, 80),
        price,
        raw: text.slice(0, 280),
        sellerNew: /0\s*avis|nouveau|aucun avis|no reviews/i.test(text),
        photoHint: `${img?.alt || ""} ${img?.currentSrc || img?.src || ""}`.slice(0, 160)
      });
    }
    return cards.slice(0, 48);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "VCA_RADAR_SCRAPE") return false;
    sendResponse({
      ok: true,
      catalog: isCatalogPage(),
      href: location.href,
      cards: scrapeCatalogCards()
    });
    return true;
  });

  if (VCA.page) {
    VCA.page.scrapeCatalogCards = scrapeCatalogCards;
    VCA.page.isCatalogPage = isCatalogPage;
  }
})();
