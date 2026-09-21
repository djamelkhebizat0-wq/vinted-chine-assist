/**
 * Valeurs par défaut partagées (popup / options / content via chrome.storage).
 * Ce fichier n'est pas injecté ; les mêmes constantes sont dupliquées de façon
 * minimale dans chaque script MV3 (pas de bundler). Gardé ici comme référence.
 */
const DEFAULT_TEMPLATES = {
  favoris: [
    {
      id: "fav-urgence",
      label: "Favori — urgence",
      text: "Bonjour ! 👋 Je vois que vous aimez mon article. Il y a déjà plusieurs personnes intéressées — si vous le souhaitez, je peux vous le réserver rapidement. Dites-moi !"
    },
    {
      id: "fav-offre",
      label: "Favori — petite offre",
      text: "Bonjour ! Merci pour le ❤️ sur mon article. Je peux vous faire une petite réduction si vous achetez rapidement — faites-moi une offre ou dites-moi ce qui vous ferait plaisir 🙂"
    },
    {
      id: "fav-bundle",
      label: "Favori — lot",
      text: "Bonjour ! Vous avez mis plusieurs de mes articles en favoris. Je peux vous préparer un lot avec une réduction + frais groupés. Intéressé(e) ?"
    }
  ],
  reponsesRapides: [
    {
      id: "rr-dispo",
      label: "Toujours dispo",
      text: "Oui, l'article est toujours disponible ! 🙂"
    },
    {
      id: "rr-mesure",
      label: "Mesures",
      text: "Bien sûr, je peux vous envoyer les mesures précises. Que souhaitez-vous exactement (longueur, largeur, etc.) ?"
    },
    {
      id: "rr-etat",
      label: "État / défauts",
      text: "L'article est en bon état, comme sur les photos. Si un détail vous inquiète, dites-moi et je regarde de plus près !"
    },
    {
      id: "rr-envoi",
      label: "Envoi rapide",
      text: "Dès l'achat validé, j'expédie sous 24–48 h avec suivi. Merci pour votre confiance !"
    },
    {
      id: "rr-contre",
      label: "Contre-offre polie",
      text: "Merci pour votre offre ! Je ne peux pas descendre autant, mais je peux vous proposer {{contre}} € — ça vous irait ?"
    },
    {
      id: "rr-accepte",
      label: "Accepter offre",
      text: "Parfait, j'accepte votre offre ! Vous pouvez finaliser l'achat quand vous voulez. Merci 🙂"
    }
  ]
};

const DEFAULT_SETTINGS = {
  negotiationFloorPercent: 15,
  suggestCounterPercent: 8,
  bubbleEnabled: true,
  templates: DEFAULT_TEMPLATES
};
