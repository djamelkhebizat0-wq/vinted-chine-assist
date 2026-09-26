# Vinted Chine Assist 1.3.0

Extension Chrome **Manifest V3** pour **vinted.fr** (et vinted.com) : aide vendeur **locale**, usage **personnel**, plus un **prototype Cloud 24/7** optionnel (`cloud/`).

Code original, inspiré des *idées* d’outils type Bleam — **sans copie de code tiers**, **sans API officielle Vinted**, sans application mobile native.

Les fichiers d’extension sont **à la racine** (`manifest.json` ici). Le dossier `cloud/` n’est **pas** requis pour « Charger l’extension non empaquetée ».

## Avertissement (CGU Vinted / ban)

Automatiser des messages, des contre-offres ou des republications **peut violer les CGU Vinted** et entraîner une **suspension**. Outil personnel, à vos risques. L’auteur décline toute responsabilité.

**Ne collez jamais votre mot de passe Vinted** dans le chat, l’extension ou le serveur. La session cloud = cookies de *votre* Chrome, que vous poussez vous-même.

## Installation (Load unpacked)

1. Téléchargez le ZIP GitHub ou clonez
2. Le dossier ouvert doit contenir **`manifest.json` à la racine**
3. Chrome → `chrome://extensions` → **mode développeur**
4. **Charger l’extension non empaquetée** → ce dossier

`cloud/` peut rester à côté : Chrome l’ignore.

## Mode auto local (1.2 — Chrome ouvert)

**Par défaut OFF.** STOP immédiat coupe tout.

Garde-fous : délai 60 s, 40 messages/jour, 20 reposts/jour, cooldown 90 min/conversation, pas d’achat auto, pas d’acceptation sous achat + marge, modèle vide = pas d’envoi.

Si le **Cloud** est activé, ce Mode auto local **n’envoie plus** (XOR).

## Cloud 24/7 (prototype 1.3)

Le worker Node continue négo / repost / post-vente **PC éteint**, une fois déployé + session sync.

### 1. Lancer le worker (Docker Compose)

```bash
cd cloud
cp .env.example .env
# Remplacez API_TOKEN et ENCRYPTION_KEY par de longues chaînes aléatoires
docker compose up --build
```

Vérifier (sans jeton) :

```bash
curl -s http://127.0.0.1:8787/health
# {"ok":true,"status":"up","version":"1.3.0",...}
```

Dry-run (simule une offre inbox, **sans** Vinted) :

```bash
curl -s -X POST http://127.0.0.1:8787/api/dry-run \
  -H "Authorization: Bearer VOTRE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"listPrice":40,"offer":32,"conversationId":"sim-inbox"}'
```

Le JSON doit contenir `preview.action` et une ligne de journal `dry-run` ok. C’est le critère de succès hors-ligne.

### 2. Connecter l’extension

1. Paramètres → **Cloud & mobile**
2. URL : `http://127.0.0.1:8787` (ou l’URL HTTPS Fly)
3. Jeton = `API_TOKEN` du `.env` (**pas** le mot de passe Vinted)
4. **Connecter / Tester** — le pastille passe **Connecté** seulement si `/health` répond
5. **Synchroniser les règles**
6. Ouvrez vinted.fr **connecté** → **Synchroniser la session**
7. Cochez **Activer le worker cloud** (le Mode auto local se coupe)
8. Optionnel : **Dry-run inbox** depuis l’onglet

Si le serveur est down : **Déconnecté** ou **Erreur**, jamais vert.

### 3. Déploiement primaire : Fly.io

```bash
cd cloud
fly auth login
fly launch --no-deploy --copy-config   # ajustez le nom d’app dans fly.toml
fly volumes create vca_data --size 1 --region cdg
fly secrets set API_TOKEN="…" ENCRYPTION_KEY="…"
fly deploy
```

Puis dans l’extension : URL `https://VOTRE-APP.fly.dev`.

VPS générique : même `docker compose`, ouvrez le port 8787 (ou un reverse-proxy HTTPS). Railway : Dockerfile + les mêmes secrets.

`auto_stop_machines = false` et `min_machines_running = 1` dans `fly.toml` pour rester allumé.

### 4. Rotation de session

Si le journal cloud affiche `session-invalide` / `no-session` :

1. Ouvrez Chrome, allez sur vinted.fr (reconnectez-vous si besoin)
2. Paramètres → Cloud → **Synchroniser la session**
3. Relancez un dry-run ou attendez le prochain tick (~45 s)

Les cookies expirent. Le worker **ne stocke pas** le mot de passe.

### 5. Test réel Vinted (à faire vous-même)

Le dépôt ne peut pas se connecter à votre compte. Chez vous :

1. Compose ou Fly UP, `/health` ok
2. Extension pointée + jeton + **session sync** + worker ON
3. Envoyez-vous une **offre test** depuis un second compte / un proche
4. Vérifiez le journal cloud (`/api/log` ou l’onglet) : inbox ok puis `nego` ok/échec
5. Si HTTP `/api/v2` refuse : Playwright (inclus dans Docker) tente l’inbox / l’envoi dans un Chromium headless — plus lent, plus fragile si le HTML change

## Ce qui marche hors-ligne vs Chrome

| Sans Chrome | Chrome encore utile |
|-------------|---------------------|
| Health, dry-run, règles, plafonds, kill | Uploader / rafraîchir les cookies |
| Worker + Playwright après sync | Premier login Vinted |

## Fonctionnalités

| # | Module | Local (Chrome) | Cloud proto |
|---|--------|----------------|-------------|
| 1 | Négo | Mode auto + insertion | Worker inbox + règles |
| 2 | Repost | Alarme / onglet | Playwright republier / save |
| 3 | CRM | Local seulement | — |
| 4 | Colis | Local seulement | Pas de webhooks print |
| 5–6 | Messages / templates | Local | Sync des modèles négo/SAV |
| 7 | Post-vente | Alarmes + envoi | File syncée + Playwright |
| 8 | Planif | Local | — |
| 9 | Cloud 24/7 | Pont honnête | Worker Docker / Fly |
| 10 | Mobile natif | Non | Non |

## Tests

```bash
node tests/run.mjs
cd cloud && npm install && npm test
```

## Fichiers

- `manifest.json` — MV3 (racine, Load unpacked)
- `lib/shared.js` `lib/nego.js` `lib/guard.js` `lib/cloud.js`
- `background.js` `content.js` `content-auto.js`
- `options.*` `popup.*` `crm.*` `packing-slip.*`
- `cloud/` — worker, Docker, Fly, tests
- `docs/ARCHITECTURE-CLOUD.md`

## Licence

Usage personnel. Aucune garantie.
