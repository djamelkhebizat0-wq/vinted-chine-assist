import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RADAR_QUERIES,
  scoreRadarDeal,
  radarShouldAlert,
  radarMarkSeen,
  radarMergeInbox,
  collectRadarFlags
} from "../shared/radar.mjs";

const queries = DEFAULT_RADAR_QUERIES;

test("Hawas 18 € → score A", () => {
  const s = scoreRadarDeal({
    id: "1",
    title: "Hawas Rasasi 100ml",
    price: 18,
    url: "https://www.vinted.fr/items/1"
  }, queries, { radarMinMarginEur: 10 });
  assert.equal(s.ok, true);
  assert.equal(s.score, "A");
  assert.ok(s.net >= 15);
});

test("tester jamais A", () => {
  const s = scoreRadarDeal({
    id: "2",
    title: "Dior Sauvage tester 100ml",
    price: 30,
    raw: "tester"
  }, queries, {});
  assert.equal(s.ok, true);
  assert.notEqual(s.score, "A");
  assert.ok(s.flags.some((f) => f.id === "tester"));
});

test("Sauvage 5 € trop bas → flag hard", () => {
  const flags = collectRadarFlags(
    { title: "Dior Sauvage", price: 5 },
    queries.find((q) => q.id === "sauvage")
  );
  assert.ok(flags.some((f) => f.id === "too-cheap" && f.hard));
  const s = scoreRadarDeal({ id: "3", title: "Dior Sauvage", price: 5 }, queries, {});
  assert.equal(s.score, "C");
});

test("dédoublonnage + baisse ≥ 5 €", () => {
  const seen = {};
  const listing = { id: "9", price: 20, title: "Hawas" };
  const scored = { score: "A", id: "9", price: 20 };
  assert.equal(radarShouldAlert(seen, listing, scored), true);
  radarMarkSeen(seen, listing, scored, true);
  assert.equal(radarShouldAlert(seen, listing, scored), false);
  assert.equal(radarShouldAlert(seen, { id: "9", price: 16 }, scored), false);
  assert.equal(radarShouldAlert(seen, { id: "9", price: 14 }, scored), true);
});

test("inbox max 50 + merge", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: String(i), title: "x", score: "B", price: 10, net: 12
  }));
  const inbox = radarMergeInbox([], many);
  assert.equal(inbox.length, 50);
});
