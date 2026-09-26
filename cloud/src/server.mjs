import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, mutate, log } from "./store.mjs";
import { encryptJson } from "./crypto.mjs";
import { runTick, runDryQueueOnce } from "./worker.mjs";
import { computeNego } from "../shared/rules.mjs";

const PORT = Number(process.env.PORT) || 8787;
const TOKEN = process.env.API_TOKEN || "";
const POLL = Math.max(15, Number(process.env.POLL_SECONDS) || 45);

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(body);
}

function unauthorized(res) {
  json(res, 401, { ok: false, error: "unauthorized" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function checkAuth(req) {
  if (!TOKEN) return false;
  const h = req.headers.authorization || "";
  return h === `Bearer ${TOKEN}`;
}

function publicStatus() {
  const s = loadState();
  const sess = s.session?.uploadedAt ? { uploadedAt: s.session.uploadedAt, origin: s.session.origin } : null;
  return {
    ok: true,
    version: "1.3.0",
    cloud: true,
    officialVintedApi: false,
    enabled: !!(s.enabled && !s.killed),
    killed: !!s.killed,
    lastTick: s.lastTick,
    lastError: s.lastError || "",
    hasSession: !!sess,
    session: sess,
    caps: {
      messagesSent: s.guardState?.messagesSent || 0,
      repostsDone: s.guardState?.repostsDone || 0,
      day: s.guardState?.day || "",
      autoDailyMessageCap: s.config?.settings?.autoDailyMessageCap ?? 40,
      autoDailyRepostCap: s.config?.settings?.autoDailyRepostCap ?? 20,
      autoMinDelaySeconds: s.config?.settings?.autoMinDelaySeconds ?? 60
    },
    log: (s.log || []).slice(0, 15)
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      status: "up",
      version: "1.3.0",
      time: new Date().toISOString()
    });
    return;
  }

  if (!checkAuth(req)) {
    unauthorized(res);
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      json(res, 200, publicStatus());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/log") {
      json(res, 200, { ok: true, log: loadState().log || [] });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = await readBody(req);
      mutate((s) => {
        s.config = {
          settings: body.settings || s.config.settings,
          templates: body.templates || s.config.templates,
          repost: Array.isArray(body.repost) ? body.repost : s.config.repost,
          postsale: Array.isArray(body.postsale) ? body.postsale : s.config.postsale
        };
        log(s, { type: "config", ok: true, detail: "Règles synchronisées depuis l’extension" });
        return s;
      });
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/session") {
      const body = await readBody(req);
      if (!Array.isArray(body.cookies) || !body.cookies.length) {
        json(res, 400, { ok: false, error: "cookies requis" });
        return;
      }
      const blob = encryptJson({
        cookies: body.cookies,
        origin: body.origin || "https://www.vinted.fr",
        userAgent: body.userAgent || ""
      });
      mutate((s) => {
        s.session = {
          blob,
          uploadedAt: new Date().toISOString(),
          origin: body.origin || "https://www.vinted.fr"
        };
        log(s, { type: "session", ok: true, detail: `${body.cookies.length} cookies chiffrés` });
        return s;
      });
      json(res, 200, { ok: true, uploadedAt: loadState().session.uploadedAt });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/enable") {
      const body = await readBody(req);
      mutate((s) => {
        s.enabled = body.enabled !== false;
        if (s.enabled) s.killed = false;
        log(s, { type: "system", ok: true, detail: s.enabled ? "Worker cloud activé" : "Worker cloud désactivé" });
        return s;
      });
      json(res, 200, { ok: true, enabled: loadState().enabled });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/kill") {
      mutate((s) => {
        s.killed = true;
        s.enabled = false;
        log(s, { type: "system", ok: true, detail: "STOP distant" });
        return s;
      });
      json(res, 200, { ok: true, killed: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/dry-run") {
      const body = await readBody(req);
      const job = {
        listPrice: Number(body.listPrice) || 40,
        offer: Number(body.offer) || 32,
        conversationId: body.conversationId || "sim-inbox",
        nom: body.nom || "Ada",
        article: body.article || "Robe test",
        force: true,
        dryRun: true
      };
      mutate((s) => {
        s.dryRunQueue.push(job);
        return s;
      });
      const after = runDryQueueOnce();
      const preview = computeNego({
        listPrice: job.listPrice,
        offer: job.offer,
        ...(after.config?.settings || {})
      });
      json(res, 200, { ok: true, job, preview, log: after.log.slice(0, 5) });
      return;
    }
    json(res, 404, { ok: false, error: "not-found" });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
});

export { server, PORT };

export function listen() {
  return new Promise((resolve) => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`[vca-cloud] écoute :${PORT}  poll=${POLL}s`);
      if (!TOKEN) console.warn("[vca-cloud] API_TOKEN vide — refuse toutes les routes /api");
      resolve(server);
    });
  });
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  listen();
  setInterval(() => {
    runTick().catch((err) => console.error("[vca-cloud] tick", err));
  }, POLL * 1000);
  setTimeout(() => {
    runTick().catch(() => {});
  }, 1500);
}
