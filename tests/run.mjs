import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console, globalThis: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/shared.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/nego.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/guard.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/radar.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "lib/radar-chat.js"), "utf8"), ctx);
const { VCA } = ctx;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok ", msg);
  }
}

const refuse = VCA.computeNego({
  listPrice: 40, offer: 20, costPrice: 12, minMarginEur: 5, floorPrice: 28, maxDropPercent: 15, counterStepPercent: 8
});
assert(refuse.action === "refuse", "refuse under floor");
assert(refuse.suggested == null, "no suggested price on refuse");

const accept = VCA.computeNego({
  listPrice: 40, offer: 38, costPrice: 12, minMarginEur: 5, floorPrice: 20, maxDropPercent: 15, counterStepPercent: 8
});
assert(accept.action === "accept", "accept at/above target");

const counter = VCA.computeNego({
  listPrice: 40, offer: 35, costPrice: 0, minMarginEur: 5, floorPrice: 10, maxDropPercent: 20, counterStepPercent: 8
});
assert(counter.action === "counter", "counter between floor and list target");
assert(counter.suggested >= counter.floor, "counter never below floor");
assert(counter.suggested > 35, "counter above offer");

const counterCost = VCA.computeNego({
  listPrice: 50, offer: 21, costPrice: 10, minMarginEur: 12, floorPrice: 18, maxDropPercent: 70, counterStepPercent: 10
});
assert(counterCost.action === "counter", "counter when offer is under cost+margin but above floor");
assert(counterCost.suggested >= counterCost.floor, "cost-based counter respects floor");

const clamped = VCA.clampAiResult(counter, 5);
assert(clamped.suggested >= counter.floor, "AI suggestion clamped to floor");

const vars = VCA.applyVars("Hello {{nom}} {{prix}} {{article}}", { nom: "Ada", prix: "12,00", article: "Robe" });
assert(vars === "Hello Ada 12,00 Robe", "template vars");

const price = VCA.evalPriceFormula("achat + marge", { achat: 10, marge: 5 });
assert(price === 15, "price formula add");
const price2 = VCA.evalPriceFormula("achat * 1.4", { achat: 10, marge: 0 });
assert(price2 === 14, "price formula mul");

const items = [
  { status: "sold", salePrice: 40, purchasePrice: 10, fees: 2, shippingCost: 3, soldAt: new Date().toISOString().slice(0, 10) },
  { status: "stock", salePrice: "", purchasePrice: 8 }
];
const stats = VCA.crmStats(items, { feePercent: 0, feeFixed: 0 });
assert(stats.soldCount === 1 && stats.stock === 1, "crm counts");
assert(stats.caMonth === 40, "ca month");
assert(stats.profit === 25, "profit 40-10-2-3");

const csv = VCA.toCsv([{ id: "a", title: 'Robe, "soie"', listingUrl: "", purchasePrice: 1, salePrice: 2, fees: 0, shippingCost: 0, status: "stock", soldAt: "", notes: "x" }]);
const parsed = VCA.parseCsv(csv);
assert(parsed.length === 1 && parsed[0].title.includes("Robe"), "csv roundtrip");

const migrated = VCA.migrateTemplates({
  favoris: [{ id: "f", label: "F", text: "t" }],
  reponsesRapides: [{ id: "nego-contre", label: "Contre", text: "c {{contre}}" }]
});
assert(migrated.nego.length >= 1, "migrate old reponsesRapides into nego");

const settings = VCA.migrateSettings({ negotiationFloorPercent: 12, suggestCounterPercent: 6 });
assert(settings.maxDropPercent === 12 && settings.counterStepPercent === 6, "migrate old % settings");
assert(settings.modeAuto === false, "mode auto default off");
assert(settings.cloudEnabled === false, "cloud default off");
assert(VCA.VERSION === "1.5.1", "version 1.5.1");
assert(VCA.localAutoActive({ modeAuto: true, cloudEnabled: false }) === true, "local auto when no cloud");
assert(VCA.localAutoActive({ modeAuto: true, cloudEnabled: true }) === false, "XOR: cloud blocks local auto");

const gOff = VCA.guardCheck({ modeAuto: false, autoMinDelaySeconds: 60, autoDailyMessageCap: 40 }, VCA.emptyAutoState(), "message", "c1");
assert(gOff.ok === false && gOff.reason === "mode-off", "guard blocks when off");

const gOk = VCA.guardCheck({ modeAuto: true, autoMinDelaySeconds: 60, autoDailyMessageCap: 40, autoDailyRepostCap: 20, autoConversationCooldownMinutes: 90 }, VCA.emptyAutoState(), "message", "c1");
assert(gOk.ok === true, "guard allows first message");

let st = VCA.guardRecord(gOk.state, "message", "c1");
const gDelay = VCA.guardCheck({ modeAuto: true, autoMinDelaySeconds: 60, autoDailyMessageCap: 40, autoConversationCooldownMinutes: 90 }, st, "message", "c2");
assert(gDelay.ok === false && gDelay.reason === "delay", "min delay between outbound");

st.lastOutboundAt = Date.now() - 120000;
const gCool = VCA.guardCheck({ modeAuto: true, autoMinDelaySeconds: 60, autoDailyMessageCap: 40, autoConversationCooldownMinutes: 90 }, st, "message", "c1");
assert(gCool.ok === false && gCool.reason === "cooldown", "per-conversation cooldown");

st.lastByConversation = {};
st.messagesSent = 40;
const gCap = VCA.guardCheck({ modeAuto: true, autoMinDelaySeconds: 60, autoDailyMessageCap: 40, autoConversationCooldownMinutes: 90 }, st, "message", "c9");
assert(gCap.ok === false && gCap.reason === "cap-msg", "daily message cap");

st.messagesSent = 0;
st.repostsDone = 20;
const gRep = VCA.guardCheck({ modeAuto: true, autoMinDelaySeconds: 60, autoDailyMessageCap: 40, autoDailyRepostCap: 20, autoConversationCooldownMinutes: 90 }, st, "repost", "");
assert(gRep.ok === false && gRep.reason === "cap-repost", "daily repost cap");

assert(VCA.offerBelowMinMargin(16, { costPrice: 12, minMarginEur: 5 }) === true, "below min margin");
assert(VCA.offerBelowMinMargin(18, { costPrice: 12, minMarginEur: 5 }) === false, "at min margin");
assert(VCA.templateReady({ text: "ok" }) === false, "short template rejected");
assert(VCA.templateReady({ text: "Merci pour votre offre de {{offre}} € !" }) === true, "template ready");

const hawas = VCA.scoreRadarDeal({
  id: "h1", title: "Hawas Rasasi 100ml", price: 18, url: "https://www.vinted.fr/items/1"
}, VCA.DEFAULT_RADAR_QUERIES, { radarMinMarginEur: 10 });
assert(hawas.ok && hawas.score === "A", "radar Hawas A");

const tester = VCA.scoreRadarDeal({
  id: "t1", title: "Sauvage tester", price: 28, raw: "tester 100ml"
}, VCA.DEFAULT_RADAR_QUERIES, {});
assert(tester.ok && tester.score !== "A", "radar tester not A");

const seen = {};
assert(VCA.radarShouldAlert(seen, { id: "9", price: 20 }, { score: "A", id: "9", price: 20 }) === true, "radar first A alerts");
VCA.radarMarkSeen(seen, { id: "9", price: 20 }, { score: "A", id: "9" }, true);
assert(VCA.radarShouldAlert(seen, { id: "9", price: 20 }, { score: "A", id: "9", price: 20 }) === false, "radar same price no re-alert");
assert(VCA.radarShouldAlert(seen, { id: "9", price: 14 }, { score: "A", id: "9", price: 14 }) === true, "radar drop 6€ re-alert");

const chatQ = VCA.clone(VCA.DEFAULT_RADAR_QUERIES);
const chatBase = { queries: chatQ, inbox: [], seen: {}, pending: null, settings: { radarMinMarginEur: 10 } };
const lacoste = VCA.radarChatTurn("mets Lacoste à 15", chatBase);
assert(lacoste.mutated && lacoste.queries.find((q) => q.id === "lacoste").buyMax === 15, "chat buyMax Lacoste 15");
assert(VCA.DEFAULT_RADAR_QUERIES.find((q) => q.id === "lacoste").buyMax === 24, "chat does not mutate defaults");
const reloaded = VCA.migrateRadarQueries(JSON.parse(JSON.stringify(lacoste.queries)));
assert(reloaded.find((q) => q.id === "lacoste").buyMax === 15, "chat buyMax survives options reload");

const nike = VCA.radarChatTurn("revente Nike 40", { ...chatBase, queries: lacoste.queries });
assert(nike.queries.find((q) => q.id === "nike").resale === 40, "chat resale Nike 40");

const hawasOff = VCA.radarChatTurn("désactive Hawas", { ...chatBase, queries: nike.queries });
assert(hawasOff.queries.find((q) => q.id === "hawas").enabled === false, "chat disable Hawas");

const scoreA = VCA.radarChatTurn("c'est quoi un score A", chatBase);
assert(/marge|drapeau|pastille/i.test(scoreA.reply) && !scoreA.mutated, "chat explains score A");

const unclear = VCA.radarChatTurn("asdf qwerty", chatBase);
assert(/[?]/.test(unclear.reply) && !unclear.mutated, "chat asks when unclear");

const livePx = VCA.radarChatTurn("combien coûte Hawas sur Vinted", chatBase);
assert(/invente|scanner/i.test(livePx.reply) && !/\b26\s*€/.test(livePx.reply), "chat never invents live prices");

const auth = VCA.radarChatTurn("c'est authentique ?", chatBase);
assert(/authentique/i.test(auth.reply) && /jamais|ne certifie/i.test(auth.reply), "chat never claims authentic");

const scanCmd = VCA.radarChatTurn("scanner", chatBase);
assert(scanCmd.wantScan === true, "chat scanner flags wantScan");

const deals = VCA.radarChatTurn("derniers deals", {
  ...chatBase,
  inbox: [{ score: "A", title: "Hawas Rasasi", price: 18, id: "h1" }]
});
assert(/Hawas/.test(deals.reply), "chat lists radar inbox");

const pendingAmt = VCA.radarChatTurn("mets à 15", chatBase);
assert(pendingAmt.pending && pendingAmt.pending.amount === 15, "chat pending brand for buyMax");
const pendingDone = VCA.radarChatTurn("Lacoste", { ...chatBase, pending: pendingAmt.pending });
assert(pendingDone.mutated && pendingDone.queries.find((q) => q.id === "lacoste").buyMax === 15, "chat pending completes Lacoste 15");

const listed = VCA.radarChatTurn("liste", { ...chatBase, queries: hawasOff.queries });
assert(/Hawas OFF/.test(listed.reply) && /Lacoste ON/.test(listed.reply), "chat lists queries with flags");

const skipOver = VCA.radarChatTurn("pourquoi skip Lacoste à 40 €", { ...chatBase, queries: lacoste.queries });
assert(/achat max|Skip/i.test(skipOver.reply), "chat explains over buyMax skip");

const added = VCA.radarChatTurn("ajoute Polo achat 18 revente 40", chatBase);
assert(added.mutated && added.queries.some((q) => /polo/i.test(q.query) && q.buyMax === 18 && q.resale === 40), "chat add Polo");

const cosm = VCA.radarChatTurn("je peux vendre un tester ?", chatBase);
assert(/tester/i.test(cosm.reply) && /contrefa/i.test(cosm.reply), "chat cosmetics rules");

const hist = VCA.radarChatAppend([], "hi", "ok");
assert(hist.length === 2, "chat append pair");
const cap = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: String(i) }));
const capped = VCA.radarChatAppend(cap, "last", "reply");
assert(capped.length === 40, "chat cap 40");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
