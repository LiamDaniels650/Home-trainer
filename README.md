# Home Trainer : app perso pour Elite Novo Force

Application web personnelle pour enregistrer les séances sur home trainer **Elite Novo Force**,
avec un **capteur de vitesse Bluetooth** et une **ceinture cardio Bluetooth**, sur **iPhone (via Bluefy)**.

- Distance et vitesse calculées à partir des tours de roue réels et de ta circonférence de roue
- Puissance **estimée** (vitesse + niveau de résistance 1 à 8), cohérente d'une séance à l'autre
- **Séances guidées** (fractionné) : cible en watts et **vitesse à tenir** à ton niveau de résistance, compte à rebours, bips
- Historique, graphiques, zones cardio, progression, records
- Envoi direct vers **Strava**, ou export `.tcx`
- Données stockées **uniquement sur ton iPhone** (pas de compte, pas de serveur)

## 1. Mise en ligne

L'app est un site statique hébergé gratuitement sur GitHub Pages. Seul le code y est publié, jamais tes données.

- GitHub Pages est réglé sur **Settings → Pages → Source : Deploy from a branch → `gh-pages` / `(root)`**.
- Pour publier une nouvelle version : `npm run deploy`. Le script lance les tests, construit l'app et l'envoie sur `gh-pages`.
- Adresse : **https://liamdaniels650.github.io/Home-trainer/**
- À chaque envoi sur `main`, le workflow « Tests » vérifie que les tests passent et que l'app se construit.

## 2. Installer sur l'iPhone

1. Installe **Bluefy – Web BLE Browser** depuis l'App Store (gratuit).
   Safari ne sait pas se connecter aux capteurs Bluetooth, Bluefy oui.
2. Dans Bluefy, ouvre `https://liamdaniels650.github.io/Home-trainer/` et ajoute-la aux favoris.
3. Autorise le Bluetooth quand Bluefy le demande.

## 3. Premiers réglages (onglet Réglages)

- **Circonférence de roue** : 2105 mm pour un pneu 700×25c. Pour être précis, marque le pneu,
  fais un tour de roue au sol et mesure la distance.
- **Niveau par défaut** : 3.
- **FC max** : pour les zones cardio.
- **Sauvegarde** : exporte régulièrement ton historique (Fichiers ou iCloud Drive).

## 4. Une séance

1. **Démarrer une séance** → **Connecter** le capteur de vitesse (fais tourner la roue pour le réveiller),
   puis la ceinture.
2. **Commencer**. L'écran reste allumé.
3. Si tu bouges la manette de résistance, change aussi le niveau avec **− / +** dans l'app.
4. **Terminer** : la séance est enregistrée. Si Bluefy se ferme en pleine séance, l'accueil propose de la reprendre.

## 5. Séances guidées

1. Dans **Réglages → Séances guidées**, renseigne ta **FTP**. L'app propose 95 % de ton record sur 20 minutes.
2. Onglet **Séances** : choisis une séance prête à l'emploi, ou crée la tienne (étapes, blocs répétés).
3. **Lancer cette séance** → capteurs → **Commencer**. Pour chaque étape, l'app affiche :
   - la puissance cible et la vitesse à tenir à ton niveau actuel ;
   - en couleur, si tu es dans la cible (vert), en dessous (orange) ou au-dessus (rouge).

   Des bips annoncent les changements d'étape (garde le son de l'iPhone activé).
4. Sur Strava, chaque étape devient un tour.

## 6. Connecter Strava (une seule fois)

1. Sur un navigateur connecté à Strava, va sur **https://www.strava.com/settings/api** et crée une application :
   - Nom : `Home Trainer` · Catégorie : `Training`
   - Site web : `https://liamdaniels650.github.io`
   - **Authorization Callback Domain** : `liamdaniels650.github.io`
2. Dans l'app (Réglages → Strava), colle le **Client ID** et le **Client Secret**.
3. Touche **Connecter à Strava** et accepte « Importer des activités ».
4. Ensuite, dans chaque séance : **Envoyer sur Strava**.

Si l'envoi échoue, utilise **Exporter .tcx** puis importe le fichier sur strava.com (menu « + » → Importer une activité).

## Limites connues

- Si la ceinture cardio cesse d'envoyer des données pendant 8 s, l'app relance la connexion toute seule.
  L'écran Capteurs affiche le nombre de coupures.
- À chaque séance, choisis le capteur dans la liste Bluetooth : Bluefy ne permet pas de le reconnecter
  sans un appui. En cours de séance, la reconnexion est automatique.
- L'envoi direct vers Strava n'a pas pu être testé avant ta première utilisation. S'il échoue, l'export `.tcx`
  marche toujours.

## À propos de la puissance

Elite ne publie pas de courbe officielle pour le Novo Force 8 niveaux. L'app utilise
`P = m(niveau) × (5·v + 0,306·v²)` (v en km/h, m = 0,3 au niveau 1 → 1,0 au niveau 8),
calée sur environ 690 W à 40 km/h au niveau 8. Le réglage **Calibration** permet d'ajuster ces valeurs.
C'est une estimation : elle sert surtout à comparer tes séances entre elles.

## Développement

```bash
npm install
npm run dev        # puis ouvrir http://localhost:5173/Home-trainer/?sim=1 (capteurs simulés)
npm test           # tests unitaires (Vitest)
npm run build
```
