import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeNego,
  guardCheck,
  guardRecord,
  emptyAutoState,
  offerBelowMinMargin,
  templateReady,
  applyVars
} from "../shared/rules.mjs";
import { extractOfferFromText, parseInboxConversations } from "../src/vinted.mjs";
import { processNegoJob } from "../src/worker.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ctx = { console, globalThis: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/shared.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/nego.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/guard.js"), "utf8"), ctx);
const { VCA } = ctx;

const cases = [
  { listPrice: 40, offer: 20, costPrice: 12, minMarginEur: 5, floorPrice: 28, maxDropPercent: 15, counterStepPercent: 8 },
  { listPrice: 40, offer: 38, costPrice: 12, minMarginEur: 5, floorPrice: 20, maxDropPercent: 15, counterStepPercent: 8 },
  { listPrice: 40, offer: 35, costPrice: 0, minMarginEur: 5, floorPrice: 10, maxDropPercent: 20, counterStepPercent: 8 },
  { listPrice: 50, offer: 21, costPrice: 10, minMarginEur: 12, floorPrice: 18, maxDropPercent: 70, counterStepPercent: 10 }
];

test("computeNego parité extension / cloud", () => {
  for (const input of cases) {
    const ext = VCA.computeNego(input);
    const cloud = computeNego(input);
    assert.equal(cloud.ok, ext.ok);
    assert.equal(cloud.action, ext.action);
    assert.equal(cloud.floor, ext.floor);
    assert.equal(cloud.target, ext.target);
    assert.equal(cloud.suggested, ext.suggested);
  }
});

test("garde-fous : off, délai, cap, cooldown", () => {
  const off = guardCheck({ modeAuto: false }, emptyAutoState(), "message", "c1");
  assert.equal(off.ok, false);
  assert.equal(off.reason, "mode-off");

  const settings = {
    modeAuto: true,
    autoMinDelaySeconds: 60,
    autoDailyMessageCap: 40,
    autoDailyRepostCap: 20,
    autoConversationCooldownMinutes: 90
  };
  const ok = guardCheck(settings, emptyAutoState(), "message", "c1");
  assert.equal(ok.ok, true);

  let st = guardRecord(ok.state, "message", "c1");
  const delay = guardCheck(settings, st, "message", "c2");
  assert.equal(delay.reason, "delay");

  st.lastOutboundAt = Date.now() - 120000;
  const cool = guardCheck(settings, st, "message", "c1");
  assert.equal(cool.reason, "cooldown");

  st.lastByConversation = {};
  st.messagesSent = 40;
  assert.equal(guardCheck(settings, st, "message", "c9").reason, "cap-msg");

  st.messagesSent = 0;
  st.repostsDone = 20;
  assert.equal(guardCheck(settings, st, "repost", "").reason, "cap-repost");
});

test("marge mini + modèle", () => {
  assert.equal(offerBelowMinMargin(16, { costPrice: 12, minMarginEur: 5 }), true);
  assert.equal(offerBelowMinMargin(18, { costPrice: 12, minMarginEur: 5 }), false);
  assert.equal(templateReady({ text: "ok" }), false);
  assert.equal(templateReady({ text: "Merci pour votre offre de {{offre}} € !" }), true);
  assert.equal(applyVars("Hello {{nom}}", { nom: "Ada" }), "Hello Ada");
});

test("extractOffer + inbox parse", () => {
  assert.equal(extractOfferFromText("Je propose 32 €"), 32);
  const conv = parseInboxConversations({
    conversations: [{
      id: 99,
      opposite_user: { login: "Ada" },
      item: { title: "Robe", price: { amount: "40.0" } },
      last_message: { body: "offre 32€", is_from_current_user: false }
    }]
  });
  assert.equal(conv[0].conversationId, "99");
  assert.equal(conv[0].offer, 32);
  assert.equal(conv[0].listPrice, 40);
});

test("processNegoJob dry-run journalise", () => {
  const state = {
    enabled: false,
    killed: false,
    config: { settings: {}, templates: { nego: [] } },
    guardState: emptyAutoState(),
    log: []
  };
  const res = processNegoJob(state, {
    listPrice: 40, offer: 32, conversationId: "sim", dryRun: true, nom: "Ada", article: "Robe"
  });
  assert.equal(res.ok, true);
  assert.equal(state.log[0].type, "dry-run");
});

test("parité guardCheck vs extension", () => {
  const settings = { modeAuto: true, autoMinDelaySeconds: 60, autoDailyMessageCap: 40, autoDailyRepostCap: 20, autoConversationCooldownMinutes: 90 };
  const raw = emptyAutoState();
  assert.equal(guardCheck(settings, raw, "message", "x").ok, VCA.guardCheck(settings, raw, "message", "x").ok);
  assert.equal(guardCheck({ modeAuto: false }, raw, "message", "x").reason, VCA.guardCheck({ modeAuto: false }, raw, "message", "x").reason);
});
