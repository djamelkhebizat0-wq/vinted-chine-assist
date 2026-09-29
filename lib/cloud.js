/**
 * Client HTTP du worker cloud 1.3.0.
 * Ne marque jamais « connecté » si /health échoue.
 */
(function (root) {
  "use strict";

  const VCA = (root.VCA = root.VCA || {});

  function normalizeUrl(url) {
    return String(url || "").trim().replace(/\/$/, "");
  }

  VCA.cloudNormalizeUrl = normalizeUrl;

  VCA.cloudHealth = async function cloudHealth(url) {
    const base = normalizeUrl(url);
    if (!base) {
      return { ok: false, status: "disconnected", error: "URL cloud vide" };
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${base}/health`, { method: "GET", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        return { ok: false, status: "error", error: `HTTP ${res.status}` };
      }
      const data = await res.json();
      if (!data || data.ok !== true) {
        return { ok: false, status: "error", error: "Réponse health invalide" };
      }
      return { ok: true, status: "connected", data };
    } catch (err) {
      return { ok: false, status: "disconnected", error: String(err?.message || err) };
    }
  };

  VCA.cloudRequest = async function cloudRequest(url, token, path, opts) {
    const base = normalizeUrl(url);
    const health = await VCA.cloudHealth(base);
    if (!health.ok) return health;
    try {
      const res = await fetch(`${base}${path}`, {
        method: opts?.method || "GET",
        headers: {
          Authorization: `Bearer ${token || ""}`,
          "Content-Type": "application/json"
        },
        body: opts?.body != null ? JSON.stringify(opts.body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        return { ok: false, status: "error", error: "Jeton API refusé" };
      }
      if (!res.ok || data.ok === false) {
        return { ok: false, status: "error", error: data.error || `HTTP ${res.status}` };
      }
      return { ok: true, status: "connected", data };
    } catch (err) {
      return { ok: false, status: "error", error: String(err?.message || err) };
    }
  };

  VCA.cloudOriginPattern = function cloudOriginPattern(url) {
    try {
      const u = new URL(normalizeUrl(url));
      return `${u.protocol}//${u.host}/*`;
    } catch {
      return "";
    }
  };

  VCA.cloudNeedsOptionalHost = function cloudNeedsOptionalHost(url) {
    try {
      const u = new URL(normalizeUrl(url));
      if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  VCA.collectVintedCookies = async function collectVintedCookies() {
    if (typeof chrome === "undefined" || !chrome.cookies?.getAll) {
      return [];
    }
    const domains = [".vinted.fr", "www.vinted.fr", ".vinted.com", "www.vinted.com"];
    const seen = new Set();
    const out = [];
    for (const domain of domains) {
      const list = await chrome.cookies.getAll({ domain });
      for (const c of list || []) {
        const key = `${c.domain}|${c.path}|${c.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          httpOnly: !!c.httpOnly,
          secure: !!c.secure,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate
        });
      }
    }
    return out;
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
