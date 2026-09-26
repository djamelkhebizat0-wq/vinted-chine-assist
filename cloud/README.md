# Cloud 24/7 — prototype personnel

Worker Node qui continue négo / repost / post-vente quand Chrome est fermé.

**Ce n’est pas une API officielle Vinted.** Automatiser un compte peut violer les CGU et valoir un ban. Usage personnel, à vos risques.

## Lancer en local (Docker Compose)

```bash
cd cloud
cp .env.example .env
# Éditez API_TOKEN et ENCRYPTION_KEY (longs, aléatoires)
docker compose up --build
```

Santé : `curl http://127.0.0.1:8787/health` → `{"ok":true,"status":"up",...}`

Dry-run (sans session Vinted) :

```bash
curl -s -X POST http://127.0.0.1:8787/api/dry-run \
  -H "Authorization: Bearer VOTRE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"listPrice":40,"offer":32}'
```

Le journal doit contenir une entrée `dry-run` ok.

## Déploiement primaire : Fly.io

Voir le README racine, section « Cloud 24/7 ». Fichiers : `Dockerfile`, `fly.toml`.

## Hors ligne vs Chrome

| Ça marche sans Chrome | Il faut rouvrir Chrome |
|-----------------------|------------------------|
| Health, status, dry-run, règles, plafonds | Rafraîchir les cookies si Vinted invalide la session |
| Worker + Playwright une fois la session sync | Premier envoi de session (`Synchroniser la session`) |
| Kill switch distant | Mot de passe Vinted : **jamais** — uniquement cookies depuis l’extension |

Playwright est inclus dans l’image Docker : l’HTTP `/api/v2` non officiel échoue souvent sans navigateur.
