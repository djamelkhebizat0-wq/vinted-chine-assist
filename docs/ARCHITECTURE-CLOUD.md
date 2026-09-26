# Architecture : un vrai « Cloud 24/7 » (non implémenté)

Cette extension **n’inclut pas** de backend. Depuis **1.2.0**, un **Mode auto local** peut envoyer des messages / exécuter des reposts **tant que Chrome est ouvert**. Ce n’est toujours **pas** un cloud 24/7 : fermer le navigateur arrête tout.

Les alarmes et notifications **s’arrêtent** lorsque Chrome est fermé, mis en veille profonde, ou lorsque le service worker est inactif trop longtemps sans événement. Ce n’est **pas** un robot 24/7.

## Ce que ferait un service distante (hors scope)

Pour coller à un produit type Bleam « toujours allumé », il faudrait notamment :

1. **Un serveur** (VM / container) qui tourne en continu, avec file d’attente (repost, relances, négo).
2. **Une session Vinted authentifiée** côté serveur — cookies, tokens, risque élevé vis-à-vis des **CGU** et de la sécurité du compte.
3. **Un worker de scraping / API non publique** — fragile, souvent interdit, à ne pas déguiser en « sync officielle ».
4. **Auth utilisateur** (compte extension ≠ compte Vinted), chiffrement des secrets, journal d’audit.
5. **File d’impression / webhooks** pour étiquettes, hors navigateur.
6. **Clients mobiles natifs** (iOS / Android) avec push APNs / FCM — autre codebase, stores, review.

Aucun de ces blocs n’est fourni ici, **même en mode démo**. L’UI ne prétend pas être connectée à un cloud.

## Équivalent local (ce qui existe en 1.1.0)

| Besoin 24/7 | Équivalent local |
|-------------|------------------|
| Réveil périodique | `chrome.alarms` (Chrome ouvert, intervalle ≥ 15 min) |
| Données vendeur | CRM + CSV dans `chrome.storage.local` |
| Négo | Moteur de règles (+ IA seulement si clé saisie) |
| Multi-postes | Export CSV ; pas de sync temps réel |
| Mobile | Pages options/CRM responsive ; pas d’app store |

## Recommandation

Gardez l’ordinateur allumé + Chrome ouvert si vous voulez des rappels. Pour deux comptes, utilisez **deux profils Chrome**. N’externalisez pas vos cookies Vinted vers un SaaS amateur.

Si vous construisez un backend un jour : isolez-le dans un autre dépôt, documentez le risque CGU, et ne simulez jamais un statut « connecté au cloud » depuis cette extension.
