# Architecture Cloud 24/7 — ce qui existe en 1.3.0

Depuis **1.3.0**, le dépôt contient un **prototype** de worker Node (`cloud/`) + un pont dans l’extension (onglet **Cloud**). Ce n’est **pas** une API officielle Vinted. L’UI ne passe au vert **que** si `GET /health` répond `ok`.

Le **Mode auto local** (1.2.0) reste disponible : Chrome ouvert, sans serveur. Si le Cloud est activé, le Mode auto local **n’envoie plus** (XOR, doubles envois).

## Implémenté maintenant

| Bloc | Détail |
|------|--------|
| Worker 24/7 | Boucle `runTick` : file dry-run, inbox (HTTP cookies puis Playwright), file repost, file post-vente |
| Règles | `cloud/shared/rules.mjs` — même plancher / marge / paliers / caps que `lib/nego.js` + `lib/guard.js` |
| Garde-fous | Master enable, délai mini, plafonds messages/reposts, cooldown conversation, journal, kill switch |
| Auth vendeur | `API_TOKEN` Bearer — **pas** le mot de passe Vinted |
| Session | Blob cookies chiffré AES-256-GCM (`ENCRYPTION_KEY`), poussé depuis l’extension uniquement |
| Envoi | POST `/api/v2/conversations/…` (non officiel) puis Playwright (image Docker) |
| Persist | Fichier `data/state.json` (volume Docker / Fly) |
| REST | `GET /health` (public) ; Bearer : `/api/status`, `/api/log`, `/api/config`, `/api/session`, `/api/enable`, `/api/kill`, `/api/dry-run` |
| Extension | Onglet Cloud : URL + jeton, Tester, sync règles / session, dry-run, STOP, statut honnête |
| Déploiement | `docker compose up` ; chemin primaire documenté : **Fly.io** (`cloud/fly.toml`) |

## Toujours manquant

- **App native iOS / Android** (stores, APNs / FCM)
- **Isolation multi-comptes** côté serveur (un token = un vendeur MVP)
- **Webhooks d’impression** / file d’étiquettes hors navigateur
- Parsing inbox **garanti** : le HTML et `/api/v2` changent ; Playwright est le filet
- Session **éternelle** : si Vinted invalide les cookies, il faut rouvrir Chrome et « Synchroniser la session »

## Hors ligne vs Chrome

| Sans Chrome | Chrome requis |
|-------------|---------------|
| Health, status, dry-run, règles, plafonds, kill | Premier upload de session + refresh cookies |
| Worker + Playwright **après** session sync | Mot de passe Vinted : jamais (uniquement cookies) |

## Local XOR Cloud

- Cloud ON → `modeAuto` local forcé OFF
- Les deux actifs en même temps **ne doivent pas** envoyer
- Recommandé : choisir **soit** Chrome ouvert (1.2), **soit** le VPS (1.3)

## Risque CGU

Automatiser messagerie / republication peut violer les CGU Vinted et valoir un ban. Prototype personnel, aucune garantie.
