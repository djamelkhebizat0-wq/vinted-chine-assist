import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyAutoState, appendAutoLog } from "../shared/rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const file = path.join(dataDir, "state.json");

function empty() {
  return {
    killed: false,
    enabled: false,
    config: {
      settings: {},
      templates: {
        favoris: [],
        nego: [
          { id: "nego-contre", label: "Contre-offre polie", text: "Merci pour votre offre de {{offre}} € sur {{article}} ! Je ne peux pas descendre autant, mais je peux vous proposer {{contre}} € — ça vous irait ?" },
          { id: "nego-accepte", label: "Accepter offre", text: "Parfait {{nom}}, j'accepte votre offre de {{offre}} € pour {{article}} ! Vous pouvez finaliser l'achat quand vous voulez. Merci 🙂" },
          { id: "nego-refuse-plancher", label: "Refus sous plancher", text: "Merci pour votre offre de {{offre}} €. Pour {{article}} je ne peux malheureusement pas descendre en dessous de {{plancher}} €." }
        ],
        postVente: [
          { id: "sav-merci", label: "Remerciement", text: "Merci pour votre achat de {{article}} {{nom}} ! Je prépare le colis avec soin." },
          { id: "sav-avis", label: "Demande d'avis", text: "Bonjour {{nom}}, j'espère que {{article}} vous plaît ! Un petit avis ⭐ me ferait très plaisir." }
        ],
        relance: []
      },
      repost: [],
      postsale: []
    },
    session: null,
    guardState: emptyAutoState(),
    log: [],
    dryRunQueue: [],
    lastTick: null,
    lastError: ""
  };
}

export function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function loadState() {
  ensureDataDir();
  if (!fs.existsSync(file)) return empty();
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return empty();
  }
}

export function saveState(state) {
  ensureDataDir();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

export function mutate(fn) {
  const state = loadState();
  const next = fn(state) || state;
  saveState(next);
  return next;
}

export function log(state, entry) {
  state.log = appendAutoLog(state.log, entry);
  return state;
}

export { dataDir };
