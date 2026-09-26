# Vinted Chine Assist 1.2.0

Extension Chrome **Manifest V3** pour **vinted.fr** (et vinted.com) : aide vendeur **locale**, usage **personnel**.

Code original, inspiré des *idées* d’outils type Bleam — **sans copie de code tiers**, sans cloud fictif, sans application mobile native.

Les fichiers sont **à la racine** (`manifest.json` ici). Zip GitHub = dossier plat chargeable.

## Installation (Load unpacked)

1. Téléchargez le ZIP GitHub (Code → Download ZIP) ou clonez
2. Dézippez : le dossier ouvert doit contenir **`manifest.json` à la racine** (pas un sous-dossier vide)
3. Chrome → `chrome://extensions` → **mode développeur**
4. **Charger l’extension non empaquetée** → sélectionnez **ce dossier-là**

Si le zip a un unique sous-dossier `vinted-chine-assist-main/`, chargez **ce** sous-dossier (il contient `manifest.json`).

## Mode auto (envoi réel, opt-in)

**Par défaut OFF.** Tant que c’est OFF, comportement 1.1 : insertion / copie, pas d’envoi seul.

### Activer

1. Connectez-vous sur Vinted dans Chrome
2. Cliquez l’icône de l’extension
3. **Activer Mode auto** (confirmation)
4. Laissez **Chrome ouvert** (et de préférence un onglet Vinted)

**STOP immédiat** (bouton rouge) coupe tout envoi auto tout de suite.

Réglages fins : Paramètres → **Mode auto** (délai, plafonds, journal).

### Ce qui part tout seul (Chrome ouvert + Mode auto ON)

| Action | Comportement |
|--------|----------------|
| **Négo** | Offre acheteur détectée sur une conversation ouverte (ou onglet inbox ouvert par le poll) → calcul des règles → **envoi** du modèle (Insérer + bouton Envoyer, sinon POST session). Pas de bouton confirmer. |
| **Repost** | Alarme file (≥ 15 min) → ouvre l’article et clique **Republier** / **Modifier puis Enregistrer**. |
| **Post-vente** | Alarme après « vendu » ou texte de vente détecté → **envoi** merci / avis. |

### Garde-fous anti-ban

- Master **OFF** par défaut + **STOP**
- Délai mini entre envois (défaut **60 s**, 15–600)
- Plafond messages / jour (défaut **40**)
- Plafond reposts / jour (défaut **20**)
- Cooldown **par conversation** (défaut **90 min**)
- Journal horodaté (type, cible, succès/échec)
- Jamais d’**achat** auto
- Jamais d’**acceptation** d’offre sous **achat + marge mini**
- Rien n’est envoyé si le **modèle est vide**

Le popup affiche ON/OFF, compteurs du jour, dernières actions.

## Fonctionnalités

| # | Module | Auto (si Mode auto ON) | Manuel (toujours) |
|---|--------|------------------------|-------------------|
| 1 | Négo | Envoi de la réponse | Suggestion, Insérer, Copier, pré-remplissage |
| 2 | Repost | Exécute file (edit/save ou republier) | File, intervalle, bouton suivant |
| 3 | CRM | — | Stock, vendu, CSV, marge |
| 4 | Colis | — | Étiquettes, checklist, bon |
| 5 | Messages | — | Catégories + variables, insertion |
| 6 | Templates articles | — | Titre / desc / formule |
| 7 | Post-vente | Envoi merci / avis | Modèles + alarmes notification |
| 8 | Planif | — | Rappels URL |
| 9 | Cloud 24/7 | **Non** | Doc + onglet limites |
| 10 | Mobile | — | Options responsive / notes PWA |

## Limites

- Chrome **fermé** = plus d’auto, plus d’alarmes.
- Pas de serveur 24/7 dans cette version (prépare le local ; le cloud viendra plus tard).
- Détection / bouton Envoyer / republier **dépendent du HTML Vinted** (peut casser).
- Le « repost » n’est **pas** une recréation complète avec photos (trop fragile sans API photos) : republication ou ré-enregistrement de l’annonce.
- Session Vinted requise dans **ce** profil Chrome.
- Usage abusif = risque de **ban**. Outil personnel, pas d’évasion de suspension.

## Avertissement (CGU Vinted)

Respectez les CGU. Le Mode auto envoie de vrais messages depuis votre session. L’auteur décline toute responsabilité.

## Fichiers

- `manifest.json` — MV3 (racine)
- `background.js` — alarmes, poll inbox, garde-fous
- `lib/shared.js` `lib/nego.js` `lib/guard.js`
- `content.js` `content-auto.js` `content.css`
- `options.*` `popup.*` `crm.*` `packing-slip.*`
- `docs/ARCHITECTURE-CLOUD.md`
- `tests/run.mjs`

## Licence

Usage personnel. Aucune garantie.
