# Vinted Chine Assist 1.1.0

Extension Chrome **Manifest V3** pour **vinted.fr** (et vinted.com) : aide vendeur **locale**, usage **personnel**.

Code original, inspiré des *idées* d’outils type Bleam — **sans copie de code tiers**, sans cloud fictif, sans application mobile native.

Les fichiers de l’extension sont **à la racine de ce dépôt** (`manifest.json` ici). Un zip GitHub se charge directement.

## Installation

1. Téléchargez le dépôt (Code → Download ZIP) ou clonez-le
2. Ouvrez Chrome → `chrome://extensions`
3. Activez le **mode développeur**
4. **Charger l’extension non empaquetée**
5. Sélectionnez **le dossier qui contient `manifest.json`** (racine du zip / du clone)

L’icône teal « V » apparaît dans la barre d’extensions.

Sur Vinted, une **bulle flottante** en bas à droite ouvre les onglets : Messages, Négo, Repost, CRM, Colis, SAV, Planif, Cloud.

## Fonctionnalités (toutes locales)

| # | Module | Ce qui marche après install |
|---|--------|-----------------------------|
| 1 | **Négo auto** | Prix d’achat, marge mini, plancher, % max baisse, paliers. Détection d’offre dans le DOM (quand le HTML le permet). Suggestion + Insérer / Copier. Pré-remplissage optionnel **sans envoi**. Clé OpenAI-compatible **uniquement si vous en mettez une**. |
| 2 | **Repost auto** | File d’articles, intervalle via `chrome.alarms` (notification, ouverture optionnelle). Bouton « Repost suivant ». Pas de boucle infinie (min. 15 min, 1 notif / intervalle). |
| 3 | **CRM vendeur** | `crm.html` + onglet Paramètres : achat, URL, vendu, frais estimés, marge nette. CA du mois, profit, stock. CSV import/export. |
| 4 | **Étiquettes + emballage** | Collecte des liens visibles sur la page commandes, file d’impression (max 5 onglets). Checklist + bon de livraison depuis le CRM. |
| 5 | **Messages favoris** | Catégories favoris / négo / post-vente / relance. Variables `{{prix}}` `{{nom}}` `{{article}}` `{{contre}}` `{{offre}}`. Insertion dans la zone message. |
| 6 | **Templates articles** | Titre, description, formule de prix (`achat + marge`). Remplissage de `/items/new` si les champs existent. |
| 7 | **Post-vente** | Modèles merci / avis ; alarmes après « marqué vendu » ; un clic depuis la bulle. |
| 8 | **Multi-comptes + planif** | Profils **locaux** (étiquette de données). Rappels date/heure → notification + ouverture d’URL. |
| 9 | **Cloud 24/7** | **Non fourni.** Onglet d’explication + [docs/ARCHITECTURE-CLOUD.md](docs/ARCHITECTURE-CLOUD.md). |
| 10 | **App mobile** | Options **responsive**. Notes PWA ci-dessous. **Pas d’app iOS/Android.** |

## Comparaison rapide (Bleam-like vs cette extension)

| Besoin | Outil « cloud / app » du marché | Vinted Chine Assist 1.1.0 |
|--------|----------------------------------|---------------------------|
| Négo / réponses | Souvent serveur + envoi auto | Règles **dans le navigateur**, insertion manuelle |
| Repost 24/7 | Bot distant | File + alarmes **tant que Chrome tourne** |
| CRM | Compte SaaS | `chrome.storage.local` + CSV |
| Multi-comptes | Sessions / proxies (risqué CGU) | Profils locaux ; vrais comptes = **profils Chrome** |
| Appli téléphone | Native | Page options responsive / Kiwi ; pas de store |
| Cloud | Toujours allumé | **Non implémenté** (volontairement) |

## Limites importantes

- Chrome **fermé** = plus d’alarmes, plus de notifications, plus de « auto ».
- Pas d’API privée Vinted, pas d’envoi automatique de messages, pas de spam.
- La détection d’offres / champs chat / `/items/new` dépend du HTML Vinted (peut casser après une MAJ du site).
- Une extension **ne peut pas** isoler les cookies : un second compte Vinted = un **profil Chrome** (ou une autre session), pas le sélecteur interne.
- Clé IA : appel HTTPS optionnel ; si la clé est absente, **uniquement** le moteur de règles. Rien n’est « simulé ».
- **Pas** un outil d’évasion de ban, de proxies ou de contournement de suspension.

## Mobile / PWA

- Les pages `options.html`, `crm.html` et `packing-slip.html` sont utilisables sur **petit écran**.
- **Chrome Android officiel n’installe pas les extensions MV3.**
- Pistes réelles : [Kiwi Browser](https://kiwibrowser.com/) (Android, extensions) ; ou ouvrir les pages de l’extension depuis un ordinateur.
- Un « PWA magique » qui ferait tourner l’extension sur iPhone **n’existe pas**. Bookmark / ajout à l’écran d’accueil d’une page `chrome-extension://` n’est pas un substitut d’app native.

## Avertissement (CGU Vinted)

Utilisez l’outil de façon **raisonnable et manuelle**. Spam, harcèlement commercial ou contournement des règles peut entraîner un **ban**. L’auteur décline toute responsabilité en cas d’usage contraire aux conditions Vinted.

## Fichiers

- `manifest.json` — MV3
- `background.js` — alarmes, notifications, proxy IA optionnel
- `lib/shared.js` / `lib/nego.js` — stockage, CRM, moteur de négo
- `content.js` / `content.css` — bulle
- `options.*` — réglages (responsive)
- `crm.html` / `crm.js` — tableau CRM
- `packing-slip.html` / `packing-slip.js` — bons d’emballage
- `popup.*` — statut rapide
- `docs/ARCHITECTURE-CLOUD.md` — ce qu’il faudrait pour un vrai 24/7
- `tests/run.mjs` — tests du moteur (Node)

## Licence

Usage personnel. Aucune garantie.
