import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptJson, decryptJson } from "../src/crypto.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function waitFor(fn, ms = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        resolve(await fn());
        return;
      } catch (err) {
        if (Date.now() - start > ms) reject(err);
        else setTimeout(tick, 150);
      }
    };
    tick();
  });
}

test("AES-256-GCM session blob", () => {
  process.env.ENCRYPTION_KEY = "test-encryption-key-123";
  const blob = encryptJson({ cookies: [{ name: "a", value: "b" }] });
  assert.ok(blob.iv && blob.tag && blob.data);
  const back = decryptJson(blob);
  assert.equal(back.cookies[0].name, "a");
});

test("API health + dry-run + auth", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vca-cloud-"));
  const port = 18787;
  const token = "test-token-xyz";
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      API_TOKEN: token,
      ENCRYPTION_KEY: "test-encryption-key-123",
      DATA_DIR: dataDir,
      POLL_SECONDS: "3600"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => {
    child.kill("SIGTERM");
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  await waitFor(async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.ok, true);
    return res;
  });

  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.status, "up");
  assert.equal(health.version, "1.3.0");

  const denied = await fetch(`${base}/api/status`);
  assert.equal(denied.status, 401);

  const status = await (await fetch(`${base}/api/status`, {
    headers: { Authorization: `Bearer ${token}` }
  })).json();
  assert.equal(status.ok, true);
  assert.equal(status.officialVintedApi, false);
  assert.equal(status.enabled, false);

  const dry = await (await fetch(`${base}/api/dry-run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ listPrice: 40, offer: 32, conversationId: "sim-inbox" })
  })).json();
  assert.equal(dry.ok, true);
  assert.equal(dry.preview.ok, true);
  assert.ok(["counter", "accept", "refuse"].includes(dry.preview.action));
  assert.ok(dry.log.some((e) => e.type === "dry-run" && e.ok));
});
