# App Home Trainer perso : design

Date : 2026-11-17
Statut : en attente de validation finale

## Intention

Une app personnelle, pour un seul utilisateur, qui enregistre les séances sur un home trainer
**Elite Novo Force** (home trainer classique à résistance magnétique, 8 niveaux réglés au guidon, sans
électronique). Elle doit fonctionner « comme Strava », mais uniquement en local.

**Pourquoi :** les données de Strava ne sont pas fiables en intérieur sur ce home trainer. La raison
d'être de l'app est d'avoir des **données justes et cohérentes** d'une séance à l'autre.

## Matériel et plateforme

- iPhone 16e, sans Mac. L'app est donc une **application web** utilisée dans **Bluefy**
  (navigateur iOS compatible Web Bluetooth). Approche choisie par l'utilisateur.
- Capteurs déjà possédés : **capteur de vitesse Bluetooth** (roue arrière) et **ceinture cardiaque
  Bluetooth**.
- Profils BLE standard utilisés :
  - Vitesse : Cycling Speed and Cadence (service `0x1816`, caractéristique `0x2A5B`)
  - Cardio : Heart Rate (service `0x180D`, caractéristique `0x2A37`)

## Objectifs (v1)

1. Se connecter aux deux capteurs depuis Bluefy, avec reconnexion automatique en cas de coupure en séance.
2. Écran de séance : chrono, vitesse, distance, fréquence cardiaque, puissance estimée, niveau de résistance.
   Gros chiffres lisibles à 1 m, l'écran reste allumé.
3. Calcul de la distance et de la vitesse à partir des tours de roue et de la **circonférence de roue
   configurée** (réglée une fois, en mm).
4. **Puissance estimée** à partir de la vitesse et du niveau de résistance du Novo Force (voir plus bas).
5. Enregistrement de la séance (un point par seconde) et sauvegarde locale (IndexedDB).
6. Historique : liste des séances, détail avec courbes (vitesse, FC, puissance) et résumé
   (durée, distance, moyennes et max, temps dans les zones cardio).
7. Progression : totaux par semaine et par mois, records (meilleure puissance moyenne sur 5 s, 1 min, 5 min, 20 min).
8. Sauvegarde : export et import de tout l'historique (fichier JSON), pour ne jamais rien perdre.
9. **Envoi vers Strava** (voir la section dédiée) : bouton « Envoyer sur Strava » à la fin de la
   séance et dans l'historique. En secours, export d'un fichier `.tcx`.

## Non-objectifs (v1)

- Pas de compte, pas de serveur, pas de partage. Les données ne quittent jamais l'iPhone,
  sauf si l'utilisateur exporte un fichier ou envoie volontairement une séance sur Strava.
- Pas de séances guidées ou fractionnées (possible en v2).
- Pas de monde virtuel ni de carte.
- Pas de pilotage de la résistance : c'est impossible sur un home trainer classique.

## Anti-objectifs (échec même si « ça marche »)

- Des données incohérentes d'une séance à l'autre, par exemple une distance qui dépend du lissage
  ou une puissance qui saute.
- Une séance perdue à cause d'une coupure Bluetooth, d'un rechargement de page ou d'une mise en veille.
  L'enregistrement en cours est sauvegardé en continu et proposé à la reprise.
- Présenter la puissance estimée comme une mesure. Elle est toujours affichée comme une estimation.

## Contraintes

- Web Bluetooth via Bluefy : la connexion doit être lancée par un appui de l'utilisateur. Aucune
  connexion en arrière-plan si Bluefy est fermé.
- Stockage local de Bluefy (IndexedDB) : il peut être effacé si l'app est supprimée, d'où l'export JSON.
- Hébergement statique uniquement (GitHub Pages), pour que Bluefy charge la page. Aucune donnée n'y est envoyée.
- Garder l'écran allumé : Screen Wake Lock API si Bluefy la supporte, sinon une vidéo muette en boucle
  (technique NoSleep).

## Approches envisagées

| Approche | Avantages | Inconvénients | Décision |
|---|---|---|---|
| **A. Web app dans Bluefy** | Aucun Mac, rien à compiler, mises à jour instantanées | Dépend d'une app tierce, stockage navigateur | **Choisie** |
| B. App iOS native (Swift) | La plus robuste, accès à Apple Santé | Mac + Xcode obligatoires, réinstallation tous les 7 jours ou 99 €/an | Écartée (pas de Mac) |
| C. Flutter / React Native | Multi-plateforme | Mac nécessaire aussi pour iOS, aucun gain ici | Écartée |

## Modèle de puissance (estimation)

Elite ne publie pas de courbe puissance/vitesse officielle pour le Novo Force 8 niveaux. Les retours
d'utilisateurs (forums Zwift) indiquent un maximum annoncé d'environ 680-690 W vers 40 km/h au
niveau max, et un comportement variable selon le serrage du galet.

Modèle retenu : P(v) = a·v + c·v², avec v en km/h, avec un jeu de coefficients (a, c) par niveau
(1 à 8). C'est la forme habituelle des courbes de home trainers magnétiques, la composante quadratique
venant des courants de Foucault et du volant d'inertie.

- Coefficients par défaut : courbe plausible calée sur ~690 W à 40 km/h au niveau 8, avec une
  progression régulière entre les niveaux (choix du builder, documenté dans le code).
- Un **facteur de calibration** global (par défaut 1.00), réglable dans les paramètres, permet d'ajuster.
- Ce qui compte pour l'utilisateur, c'est la **cohérence** d'une séance à l'autre : même vitesse et même
  niveau donnent toujours la même puissance.
- Le niveau de résistance peut être changé en cours de séance d'un appui (boutons − / +). Il est
  enregistré avec chaque point. **Niveau par défaut : 3** (celui que l'utilisateur utilise le plus),
  réglable dans les paramètres.

## Calcul vitesse et distance

- La caractéristique CSC envoie un compteur cumulé de tours de roue et le temps du dernier événement
  (unité 1/1024 s, sur 16 bits, qui reboucle). Gérer le rebouclage des deux compteurs.
- Distance = tours × circonférence. Vitesse = Δtours × circonférence / Δtemps.
- Si aucun nouveau tour n'arrive pendant 3 s, la vitesse tombe à 0.
- La distance totale est calculée sur les tours bruts, jamais sur une vitesse lissée.
- Le capteur de l'utilisateur ne donne **que la vitesse** : pas de cadence en v1. Si un capteur
  envoie quand même la cadence, l'afficher, sinon masquer ce champ.

## Envoi vers Strava

Fonctionnement direct via l'API officielle de Strava, sans aucun serveur intermédiaire :

- L'utilisateur crée une fois sa propre « application API » gratuite sur strava.com/settings/api
  (domaine de rappel : celui de GitHub Pages) et saisit son Client ID et son Client Secret dans les
  paramètres de l'app. Ces identifiants restent sur l'iPhone et ne sont jamais publiés dans le code.
- Connexion OAuth (scope `activity:write`), puis stockage local des jetons et rafraîchissement
  automatique du jeton d'accès.
- Envoi : génération d'un fichier TCX (temps, distance cumulée, vitesse, FC, puissance estimée en
  extension `Watts`), puis `POST /api/v3/uploads` avec `data_type=tcx`, `trainer=1` et
  `sport_type=VirtualRide` ou `Ride` (choix du builder). On interroge ensuite l'état de l'envoi
  jusqu'à obtenir l'ID de l'activité, et on affiche un lien vers l'activité Strava.
- La distance du fichier est celle calculée par l'app : Strava ne la recalcule pas pour un fichier home trainer.
- La séance est marquée « envoyée » dans l'historique pour éviter les doublons. Strava refuse aussi les doublons.
- Secours : bouton « Exporter .tcx » (partage iOS) pour un import manuel sur strava.com.

## Écrans

1. **Accueil** : bouton « Démarrer une séance », dernière séance, totaux de la semaine.
2. **Connexion** : deux boutons (Capteur de vitesse, Ceinture cardio) avec leur état. Le dernier
   appareil est mémorisé pour la reconnexion.
3. **Séance** : grands chiffres, sélecteur de niveau, boutons Pause / Fin. Pause automatique si la
   vitesse est à 0 (option).
4. **Historique** : liste, puis détail avec graphiques.
5. **Progression** : semaine et mois, records.
6. **Paramètres** : circonférence de roue, FC max (pour les zones), niveau par défaut,
   facteur de calibration, connexion Strava, export et import.

## Pile technique (choix du builder)

- Vite + TypeScript, sans framework lourd (ou Preact si besoin). Le site est statique et léger.
- Graphiques : une librairie légère (par ex. uPlot) ou du SVG à la main.
- Stockage : IndexedDB, via un petit wrapper (par ex. `idb`).
- Logique métier (décodage BLE, rebouclage, puissance, records) dans des modules purs, testés avec Vitest.
- Déploiement : GitHub Pages via GitHub Actions.

## Laissé au builder

- Style visuel (sombre par défaut pour la lisibilité en séance), organisation exacte des écrans.
- Valeurs précises des coefficients par défaut, à documenter.
- Mode simulation (faux capteurs) pour développer et tester sans matériel.

## Décisions de l'utilisateur

- Approche A (web app dans Bluefy), pas de Mac.
- Niveau habituel : 3. Changement manuel du niveau dans l'app : accepté.
- Capteur de vitesse seul (pas de cadence).
- Envoi vers Strava souhaité.
