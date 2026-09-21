# Vinted Chine Assist

Extension Chrome (Manifest V3) pour **aider à rédiger** des messages sur Vinted : modèles « favoris », réponses rapides, conseils de négociation et checklist de republication.

Code **original** — inspiré des idées d’assistants type Bleam, sans copie de code tiers.

## Installation

1. Ouvrez Chrome et allez sur `chrome://extensions`
2. Activez le **mode développeur** (interrupteur en haut à droite)
3. Cliquez sur **Charger l’extension non empaquetée**
4. Sélectionnez le dossier `vinted-chine-assist` (celui qui contient `manifest.json`)

L’icône « V » / teal apparaît dans la barre d’extensions.

## Utilisation

1. Ouvrez [vinted.fr](https://www.vinted.fr) ou [vinted.com](https://www.vinted.com)
2. Une **bulle flottante** apparaît en bas à droite
3. Onglets :
   - **Messages** — cliquer un modèle pour l’insérer dans le champ de discussion (sinon copie presse-papiers + toast « copié »)
   - **Négociation** — saisir prix + offre pour un conseil (accepter / contre-offre selon vos seuils %)
   - **Repost** — checklist avant de republication un article
4. Cliquez l’icône de l’extension → **Paramètres** pour éditer les textes et les pourcentages

Les réglages sont stockés dans `chrome.storage.local` (local à votre navigateur).

## Modèles par défaut

- Favoris : urgence, petite offre, proposition de lot
- Réponses : dispo, mesures, état, envoi, contre-offre (`{{contre}}`), acceptation

## Limitations

- Ne lit **pas** l’API privée Vinted, n’automatise pas l’envoi de messages
- La détection du champ chat dépend du HTML Vinted (peut évoluer)
- Pas de multi-comptes, proxies, ni contournement de ban
- Fonctionne uniquement sur les domaines autorisés dans le manifeste

## Avertissement (CGU Vinted)

Utilisez cet outil de façon **raisonnable et manuelle**. Le spam, le harcèlement commercial ou toute tentative de contourner une suspension / les règles Vinted peut entraîner un **ban**. Cette extension n’est **pas** un outil d’évasion de ban. L’auteur décline toute responsabilité en cas d’usage contraire aux conditions d’utilisation de Vinted.

## Fichiers

- `manifest.json` — MV3
- `background.js` — service worker
- `content.js` / `content.css` — bulle sur les pages Vinted
- `popup.*` — statut rapide
- `options.*` — édition des modèles
- `icons/` — icônes PNG 16 / 48 / 128
- `defaults.js` — référence des modèles (non injecté)

## Licence

Usage personnel. Aucune garantie.
