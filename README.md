# Home Trainer : app perso pour Elite Novo Force

Application web personnelle pour enregistrer les séances sur home trainer **Elite Novo Force**,
avec un **capteur de vitesse Bluetooth** et une **ceinture cardio Bluetooth**, sur **iPhone (via Bluefy)**.

- Distance et vitesse calculées à partir des tours de roue réels et de ta circonférence de roue
- Puissance **estimée** (vitesse + niveau de résistance 1 à 8), cohérente d'une séance à l'autre
- Historique, graphiques, zones cardio, progression, records
- Envoi direct vers **Strava**, ou export `.tcx`
- Données stockées **uniquement sur ton iPhone** (pas de compte, pas de serveur)

## 1. Mettre l'app en ligne (une seule fois)

L'app est un site statique hébergé gratuitement sur GitHub Pages. Seul le code y est publié, jamais tes données.

1. Fusionne cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow « Déploiement GitHub Pages » publie l'app à l'adresse
   **https://liamdaniels650.github.io/Home-trainer/**.

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

## 5. Connecter Strava (une seule fois)

1. Sur un navigateur connecté à Strava, va sur **https://www.strava.com/settings/api** et crée une application :
   - Nom : `Home Trainer` · Catégorie : `Training`
   - Site web : `https://liamdaniels650.github.io`
   - **Authorization Callback Domain** : `liamdaniels650.github.io`
2. Dans l'app (Réglages → Strava), colle le **Client ID** et le **Client Secret**.
3. Touche **Connecter à Strava** et accepte « Importer des activités ».
4. Ensuite, dans chaque séance : **Envoyer sur Strava**.

Si l'envoi échoue, utilise **Exporter .tcx** puis importe le fichier sur strava.com (menu « + » → Importer une activité).

## Limites connues

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
