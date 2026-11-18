# Home Trainer v3 : rouler sur une route (GPX)

Date : 2026-11-18. Statut : en attente de validation.

## Intention

L'utilisateur veut « ajouter une route » : rouler virtuellement sur une vraie route importée depuis un **fichier GPX**
(export Strava, Komoot, Garmin…), sur son Elite Novo Force (home trainer classique, résistance réglée à la manette).

## Décisions de l'utilisateur

- Source des routes : **fichiers GPX**.
- Affichage : **option A**, profil d'altitude + tracé simple dessiné en SVG, **sans fond de carte** (fonctionne hors ligne).

## Décisions de Claude (annoncées, non contestées)

- **Progression réaliste** : la vitesse sur la route vient de la puissance estimée, du poids et de la pente
  (modèle physique avec inertie). Nouveau réglage **poids total (cycliste + vélo)**, 80 kg par défaut.
- Fin de la route : l'enregistrement continue en roue libre jusqu'à « Terminer ».
- Strava : envoi avec le tracé GPS, puis passage du type d'activité en **« Vélo virtuel »** (`VirtualRide`), pour ne pas
  fausser les classements de segments réels.

## Objectifs

1. **Import GPX** : `<trkpt>` (sinon `<rtept>`), lat/lon/ele. Distance cumulée (haversine), dénivelé positif.
   Points rapprochés à moins de 5 m fusionnés, 5 000 points max. Fichier sans altitude accepté (route plate) avec un avertissement.
   Fichier invalide ou avec moins de 2 points : message clair, rien n'est enregistré. Nom pris dans `<name>`, modifiable.
2. **Bibliothèque de routes** : dans l'onglet Séances, section « Routes » : importer, liste (nom, distance, D+,
   mini-profil), détail (profil, tracé, pente max), supprimer, lancer.
3. **Pendant la séance** (panneau en haut de l'écran Séance) :
   - profil d'altitude avec la position, tracé SVG avec la position ;
   - pente actuelle (moyenne sur les 100 m à venir), altitude, km parcourus / restants, D+ restant ;
   - **niveau conseillé** = niveau par défaut sur le plat, +1 par tranche de 2 % de montée, −1 en descente
     au-delà de −2 %, borné à 1..8. Quand il diffère du niveau saisi : « Passe au niveau X » bien visible ;
   - vitesse virtuelle (sur la route) affichée à côté de la vitesse roue.
4. **Modèle physique** (`src/core/physics.ts`, pur et testé) : chaque seconde, l'énergie cinétique évolue selon
   P·(1 − 2 %) − (Crr·m·g·cosθ + m·g·sinθ + ½·ρ·CdA·v²)·v, avec Crr = 0,004, CdA = 0,32 m², ρ = 1,2 kg/m³,
   et 4 sous-pas par seconde. Vitesse bornée à 0..90 km/h. Roue arrêtée en montée : la vitesse retombe à 0.
5. **Enregistrement** : chaque échantillon d'une séance « route » porte `routeDistM`, `vSpeed`, `lat`, `lon`, `ele`.
   La séance garde `route: { id, name, distanceM, gainM, completed }`. Le brouillon garde la route
   (reprise après fermeture). Le résumé garde la distance roue et ajoute distance route et D+ réalisé.
6. **Export** : le TCX d'une séance route contient `Position` et `AltitudeMeters`. Sa distance et sa vitesse sont celles
   de la route, pour que la carte Strava soit cohérente. Après l'envoi, `PUT /activities/{id}` avec `sport_type=VirtualRide`.
   Si ce changement échoue, la séance reste envoyée et un message invite à changer le type sur Strava.
7. **Sauvegarde** : routes incluses dans l'export et l'import (base IndexedDB v3, migration sans perte).

## Non-objectifs

- Pas de fond de carte (option B possible plus tard), pas d'import direct depuis l'API Strava.
- Pas de combinaison route + séance guidée dans la même séance (l'une ou l'autre).
- Pas de pilotage de la résistance (impossible sur le Novo Force).

## Anti-objectifs

- Une distance « roue » faussée par la route : la distance réelle mesurée reste intacte dans l'historique.
- Une activité « route » présentée sur Strava comme une sortie extérieure.
- Une séance perdue parce que la route n'existe plus (supprimée entre-temps) : la séance garde ce qu'il faut pour s'afficher.

## Approches considérées

| Approche | Avantages | Inconvénients | Décision |
|---|---|---|---|
| A. Profil + tracé SVG | Hors ligne, léger | Pas de fond de carte | **Choisie** |
| B. Carte OpenStreetMap (Leaflet) + profil | Repères visuels | Réseau en séance, plus lourd, un tiers reçoit les zones affichées | Écartée pour l'instant |

Pour la progression, un modèle « distance roue = distance route » serait plus simple, mais il ignore la pente.
Un modèle physique sans inertie donnerait une vitesse qui saute à chaque changement de pente. Le modèle à énergie
cinétique est retenu.
