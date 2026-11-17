# App Home Trainer : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** web app perso (utilisée dans Bluefy sur iPhone) qui enregistre les séances sur Elite Novo Force
à partir d'un capteur de vitesse BLE et d'une ceinture cardio BLE, estime la puissance, garde l'historique
en local et envoie les séances sur Strava.

**Architecture :** site statique Vite + Preact + TypeScript. Toute la logique métier (décodage BLE,
vitesse/distance, puissance, enregistrement, résumés, TCX) vit dans des modules purs sous `src/core/`,
testés avec Vitest. Les modules d'effets (Bluetooth, IndexedDB, Strava, wake lock) sont dans `src/io/`.
L'UI est dans `src/ui/`. Navigation par hash (`#/seance`, etc.) pour fonctionner sur GitHub Pages.

**Tech stack :** Vite, Preact (+ hooks), TypeScript strict, Vitest, `idb`, `fake-indexeddb` (tests), `uplot`.

**Spec :** `docs/superpowers/specs/2026-11-17-home-trainer-app-design.md`

## Global Constraints

- Interface entièrement en français.
- Aucune donnée envoyée nulle part, sauf l'envoi Strava volontaire. Pas d'analytics, pas de CDN au runtime.
- Base Vite : `/Home-trainer/` (GitHub Pages : `https://liamdaniels650.github.io/Home-trainer/`).
- Services BLE : vitesse CSC `0x1816` / `0x2A5B` ; cardio `0x180D` / `0x2A37`.
- CSC : tours de roue cumulés en uint32, temps du dernier événement en uint16 à 1/1024 s (rebouclage à 65536).
- Vitesse à 0 si aucun nouveau tour pendant 3 s.
- Distance calculée à partir des tours bruts × circonférence, jamais à partir d'une vitesse lissée.
- Puissance : `P = calib × m(niveau) × (5·v + 0.306·v²)`, v en km/h, `m(n) = 0.3 + 0.1·(n−1)` pour n ∈ 1..8
  (niveau 8 à 40 km/h ≈ 690 W). Toujours libellée « estimée ».
- Niveau par défaut 3 ; circonférence par défaut 2105 mm (700×25c) ; FC max par défaut 190 ; calib par défaut 1.00.
- Échantillonnage d'1 point par seconde ; sauvegarde de la séance en cours au moins toutes les 5 s.
- Strava : scope `activity:write`, upload `data_type=tcx`, `trainer=1`, `sport_type=VirtualRide`.

## Review Focus

1. **Rebouclage des compteurs CSC** (temps uint16, et tours uint32) : la vitesse et la distance doivent rester
   justes au moment du rebouclage. → tests en Tâche 2.
2. **Notifications CSC répétées sans nouveau tour** (le capteur renvoie la même valeur) : pas de division
   par zéro, la vitesse ne doit pas tomber à 0 avant 3 s. → tests en Tâche 2.
3. **Rechargement de la page ou fermeture de Bluefy en pleine séance** : la séance en cours doit être proposée
   à la reprise au retour. → test en Tâche 5 (brouillon persisté) + écran Accueil en Tâche 7.
4. **Coupure Bluetooth en séance** : l'enregistrement continue (FC/vitesse vides puis 0), reconnexion
   automatique ; la distance ne fait pas de saut au retour du capteur (premier paquet après reconnexion = nouvelle
   référence). → test en Tâche 2 (`reset`), logique en Tâche 6.
5. **Import d'un fichier de sauvegarde invalide ou déjà importé** : refus propre sans rien écraser, pas de
   doublons (dédoublonnage par `id`). → tests en Tâche 5.

Risque connu : impossible de vérifier ici que les endpoints Strava autorisent le CORS depuis un navigateur
(réseau bloqué dans l'environnement de dev). L'export `.tcx` reste le plan B ; l'UI doit afficher l'erreur
réseau de façon claire et proposer l'export.

---

## Structure des fichiers

```
index.html
vite.config.ts            base '/Home-trainer/', test env
.github/workflows/pages.yml
src/main.tsx              montage Preact
src/app.tsx               routeur par hash + état global (contexte)
src/core/types.ts         types partagés
src/core/csc.ts           décodage CSC + WheelTracker
src/core/hr.ts            décodage FC
src/core/power.ts         estimation de puissance + meilleures moyennes
src/core/recorder.ts      enregistrement 1 Hz, pause, résumé
src/core/zones.ts         zones FC
src/core/stats.ts         totaux semaine/mois, records
src/core/tcx.ts           génération TCX
src/io/db.ts              IndexedDB (séances, brouillon, réglages), export/import
src/io/ble.ts             Web Bluetooth : connexion, reconnexion, simulation
src/io/wakelock.ts        garder l'écran allumé
src/io/strava.ts          OAuth + upload
src/ui/*.tsx              écrans
src/ui/styles.css
tests/*.test.ts
README.md                 guide d'installation (Bluefy, Strava)
```

---

### Tâche 1 : squelette du projet + déploiement

**Files :** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`,
`src/app.tsx`, `src/ui/styles.css`, `.github/workflows/pages.yml`, `.gitignore`, `tests/smoke.test.ts`

**Interfaces :**
- Produces : `App` (composant) avec routes `#/` (Accueil), `#/connexion`, `#/seance`, `#/historique`,
  `#/historique/:id`, `#/progression`, `#/parametres` (placeholders pour l'instant) ; `navigate(path: string): void`.

- [ ] Step 1 : `npm init`, installer `preact vite @preact/preset-vite typescript vitest idb uplot fake-indexeddb`.
  Scripts : `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`).
- [ ] Step 2 : test de fumée `tests/smoke.test.ts` : `expect(1+1).toBe(2)` ; `npm test` → PASS.
- [ ] Step 3 : `App` avec barre de navigation en bas (Accueil, Historique, Progression, Réglages), thème sombre,
  meta `viewport` avec `viewport-fit=cover`, `apple-mobile-web-app-capable`.
- [ ] Step 4 : workflow Pages (déclenché sur `main` + `workflow_dispatch`) : `npm ci`, `npm test`, `npm run build`,
  `actions/upload-pages-artifact` sur `dist`, `actions/deploy-pages`.
- [ ] Step 5 : `npm run build` → OK ; commit.

### Tâche 2 : décodage BLE (vitesse et cardio)

**Files :** Create `src/core/types.ts`, `src/core/csc.ts`, `src/core/hr.ts` ; Test `tests/csc.test.ts`, `tests/hr.test.ts`

**Interfaces :**
- Produces :
  - `parseCsc(dv: DataView): { wheelRevs?: number; wheelTime?: number; crankRevs?: number; crankTime?: number }`
    (flags bit0 = roue : uint32 + uint16 ; bit1 = pédalier : uint16 + uint16 ; little-endian)
  - `class WheelTracker { constructor(circumferenceMm: number); update(revs: number, time1024: number, nowMs: number): void; speedKmh(nowMs: number): number; distanceM(): number; reset(): void }`
  - `parseHr(dv: DataView): number` (flags bit0 → uint16, sinon uint8)

- [ ] Step 1 : tests :
  - `parseCsc` sur `[0x01, 0x0A,0,0,0, 0x00,0x04]` → `{ wheelRevs: 10, wheelTime: 1024 }`.
  - `parseHr([0x00, 150])` → 150 ; `parseHr([0x01, 0x2C, 0x01])` → 300.
  - Tracker (2105 mm) : update(0, 0, 0) puis update(4, 1024, 1000) → distance 8.42 m, vitesse ≈ 30.31 km/h (±0.01).
  - Rebouclage temps : update(0, 65024, 0) puis update(4, 512, 1000) (Δ = 1024) → vitesse ≈ 30.31.
  - Rebouclage tours : update(4294967294, 0, 0) puis update(2, 1024, 1000) → distance 8.42 m.
  - Paquet répété identique à t+1500 ms → vitesse inchangée ; même paquet à t+3001 ms après le dernier tour → 0.
  - `reset()` puis update(1000, 5000, 5000) → aucune distance ajoutée (nouvelle référence).
- [ ] Step 2 : lancer `npx vitest run tests/csc.test.ts tests/hr.test.ts` → FAIL.
- [ ] Step 3 : implémenter. Δtours = `(revs − prev) >>> 0` ; Δtemps = `(t − prev + 65536) % 65536` ; ignorer si Δtemps = 0.
  Un Δtours > 100 en un paquet est traité comme un saut aberrant (nouvelle référence).
- [ ] Step 4 : tests → PASS ; commit.

### Tâche 3 : estimation de puissance

**Files :** Create `src/core/power.ts` ; Test `tests/power.test.ts`

**Interfaces :**
- Produces : `estimatePower(speedKmh: number, level: number, calib = 1): number` (arrondi à l'entier, 0 si v ≤ 0,
  niveau borné à 1..8) ; `bestAverage(values: number[], windowSec: number): number | null` (null si trop court).

- [ ] Step 1 : tests : `estimatePower(40, 8)` ∈ [685, 695] ; `estimatePower(30, 3)` = 213 ; `estimatePower(0, 3)` = 0 ;
  `estimatePower(30, 3, 1.1)` = 234 ; `estimatePower(30, 12)` = `estimatePower(30, 8)` ;
  `bestAverage([100,200,300,100], 2)` = 250 ; `bestAverage([1], 5)` = null.
- [ ] Step 2 : FAIL → Step 3 : implémenter (moyenne glissante O(n)) → Step 4 : PASS ; commit.

### Tâche 4 : enregistreur de séance, zones, statistiques

**Files :** Create `src/core/recorder.ts`, `src/core/zones.ts`, `src/core/stats.ts` ; Test `tests/recorder.test.ts`, `tests/stats.test.ts`

**Interfaces :**
- Consumes : `estimatePower`, `bestAverage`.
- Produces (dans `types.ts`) :
  - `Sample { t: number /* s depuis le début, temps actif */; distM: number; speed: number; hr: number | null; power: number; level: number }`
  - `Session { id: string; startedAt: string /* ISO */; samples: Sample[]; summary: Summary; stravaId?: number }`
  - `Summary { durationS; distanceM; avgSpeed; maxSpeed; avgHr: number|null; maxHr: number|null; avgPower; maxPower; best: Record<'5'|'60'|'300'|'1200', number|null>; hrZonesS: number[] /* 5 zones */ }`
  - `class Recorder { constructor(opts: { startedAt: Date; level: number; calib: number; hrMax: number; autoPause: boolean }); tick(input: { distM: number; speed: number; hr: number | null }): void /* appelé 1×/s */; setLevel(n: number): void; pause(): void; resume(): void; get paused(): boolean; get samples(): Sample[]; finish(): Session; static restore(draft: Draft): Recorder; toDraft(): Draft }`
  - `hrZone(hr: number, hrMax: number): 0..4` (bornes 60/70/80/90 % de FC max) ;
  - `summarize(samples: Sample[], hrMax: number): Summary`
  - `weeklyTotals(sessions: Session[], now: Date): { week: Totals; month: Totals }` ; `personalRecords(sessions: Session[]): Record<'5'|'60'|'300'|'1200', { watts: number; sessionId: string } | null>`
- [ ] Step 1 : tests : 10 ticks à 30 km/h niveau 3 → 10 samples, puissance 213, `t` de 1 à 10 ;
  pause puis 3 ticks → aucun sample ajouté ; autoPause actif + vitesse 0 → pas de sample, reprise auto dès vitesse > 0 ;
  `setLevel(5)` → samples suivants avec level 5 ; `toDraft`/`restore` → samples identiques ;
  `hrZone(150, 190)` = 2 ; `summarize` : distance = distM du dernier sample, moyennes correctes ;
  `weeklyTotals` : semaine commençant le lundi ; `personalRecords` choisit le max entre séances.
- [ ] Step 2 : FAIL → Step 3 : implémenter → Step 4 : PASS ; commit.

### Tâche 5 : stockage local + sauvegarde

**Files :** Create `src/io/db.ts` ; Test `tests/db.test.ts` (avec `fake-indexeddb/auto`)

**Interfaces :**
- Produces : `Settings { circumferenceMm: number; defaultLevel: number; hrMax: number; calib: number; autoPause: boolean; strava?: { clientId: string; clientSecret: string; accessToken?: string; refreshToken?: string; expiresAt?: number } ; lastSpeedDeviceId?: string; lastHrDeviceId?: string }`
- `getSettings(): Promise<Settings>` (avec valeurs par défaut) ; `saveSettings(s: Settings)` ;
  `saveSession(s: Session)` ; `listSessions(): Promise<Session[]>` (récentes d'abord) ; `getSession(id)` ; `deleteSession(id)` ;
  `saveDraft(d: Draft)` ; `getDraft(): Promise<Draft | null>` ; `clearDraft()` ;
  `exportAll(): Promise<string>` (JSON `{ app: 'home-trainer', version: 1, sessions, settings }` sans `strava.clientSecret` ni jetons) ;
  `importAll(json: string): Promise<{ added: number; skipped: number }>`.
- [ ] Step 1 : tests : réglages par défaut ; aller-retour d'une séance ; brouillon sauvegardé, relu, effacé ;
  export puis import dans une base vide → `added = n` ; second import → `skipped = n`, `added = 0` ;
  import de `"pas du json"` ou `{ app: 'autre' }` → rejet avec message français, base inchangée.
- [ ] Step 2 : FAIL → Step 3 : implémenter (`idb`, base `home-trainer`, stores `sessions`, `kv`) → Step 4 : PASS ; commit.

### Tâche 6 : Bluetooth, simulation, écran allumé

**Files :** Create `src/io/ble.ts`, `src/io/wakelock.ts`

**Interfaces :**
- Consumes : `parseCsc`, `parseHr`.
- Produces :
  - `type SensorKind = 'speed' | 'hr'` ; `type SensorState = 'deconnecte' | 'connexion' | 'connecte' | 'reconnexion'`
  - `interface Sensors { connect(kind: SensorKind): Promise<void> /* doit venir d'un appui */; disconnect(kind): void; state(kind): SensorState; onCsc(cb: (r: {wheelRevs:number; wheelTime:number}) => void): () => void; onHr(cb: (bpm: number) => void): () => void; onState(cb: (kind, state) => void): () => void }`
  - `createSensors(): Sensors` (Web Bluetooth réel) ; `createSimulatedSensors(): Sensors` (≈ 30 km/h ± bruit, FC 130-150).
  - `isBluetoothAvailable(): boolean` ; `keepAwake(): Promise<() => void>`.
- [ ] Step 1 : implémenter `createSensors` : `requestDevice({ filters: [{ services: [uuid] }] })`, sur `gattserverdisconnected`
  état `reconnexion` et nouvelles tentatives `device.gatt.connect()` toutes les 2 s (pas de nouveau `requestDevice`).
  Le consommateur appelle `WheelTracker.reset()` à chaque passage à l'état `connecte`.
- [ ] Step 2 : `keepAwake` : `navigator.wakeLock.request('screen')` si dispo (et le reprendre sur `visibilitychange`),
  sinon vidéo muette en boucle `playsinline` (petit MP4 encodé en base64 dans le code).
- [ ] Step 3 : simulation activée par `?sim=1` dans l'URL ; `npm run build` OK ; commit.

### Tâche 7 : écrans Accueil, Connexion, Séance

**Files :** Create `src/ui/Home.tsx`, `src/ui/Connect.tsx`, `src/ui/Ride.tsx`, `src/ui/useRide.ts` ; Modify `src/app.tsx`

**Interfaces :**
- Consumes : `Sensors`, `WheelTracker`, `Recorder`, `db`, `keepAwake`.
- Produces : hook `useRide()` qui orchestre : tracker + recorder + `setInterval` 1 s + `saveDraft` toutes les 5 s.

- [ ] Step 1 : Accueil : si `getDraft()` existe → bandeau « Une séance n'a pas été terminée » avec « Reprendre » / « Terminer et enregistrer » / « Supprimer ».
  Bouton « Démarrer une séance », dernière séance, totaux de la semaine. Si `!isBluetoothAvailable()` → message
  « Ouvre cette page dans l'app Bluefy pour connecter tes capteurs ».
- [ ] Step 2 : Connexion : deux cartes (Capteur de vitesse, Ceinture cardio) avec l'état et un bouton ; « Commencer »
  activé dès que la vitesse est connectée (la cardio est facultative).
- [ ] Step 3 : Séance : chrono, vitesse (grand), distance, FC + zone (couleur), puissance « estimée », niveau avec − / +.
  Pause / Reprendre, « Terminer » (confirmation) → `finish()`, `saveSession`, `clearDraft`, aller au détail.
  Indicateur visible si un capteur est en reconnexion. Le chrono de temps actif ne compte pas les pauses.
- [ ] Step 4 : vérification manuelle avec `?sim=1` dans Chromium (Playwright, capture à 390×844) : démarrer,
  rouler 15 s, recharger la page → bandeau de reprise présent ; terminer → séance dans l'historique. Commit.

### Tâche 8 : Historique, détail, Progression

**Files :** Create `src/ui/History.tsx`, `src/ui/SessionDetail.tsx`, `src/ui/Progress.tsx`, `src/ui/Chart.tsx`

- [ ] Step 1 : Historique : liste (date, durée, distance, puissance moyenne, badge « Strava ✓ »).
- [ ] Step 2 : Détail : résumé, courbes vitesse / FC / puissance (uPlot, axe x = temps), barres du temps par zone FC,
  boutons « Envoyer sur Strava », « Exporter .tcx », « Supprimer » (confirmation).
- [ ] Step 3 : Progression : totaux semaine et mois (durée, distance, nombre de séances), records 5 s / 1 min / 5 min / 20 min avec lien vers la séance.
- [ ] Step 4 : vérification `?sim=1` + capture ; commit.

### Tâche 9 : TCX, Strava, Réglages

**Files :** Create `src/core/tcx.ts`, `src/io/strava.ts`, `src/ui/Settings.tsx` ; Test `tests/tcx.test.ts`, `tests/strava.test.ts`

**Interfaces :**
- Produces :
  - `toTcx(s: Session): string` : `<Activity Sport="Biking">`, un `Lap` avec `TotalTimeSeconds`, `DistanceMeters`,
    `Trackpoint` par sample (`Time` = startedAt + t, `DistanceMeters`, `HeartRateBpm` si présent,
    `Extensions/ns3:TPX/ns3:Speed` en m/s et `ns3:Watts`).
  - `stravaAuthUrl(clientId: string, redirectUri: string): string` ; `handleOAuthRedirect(settings): Promise<Settings | null>`
    (lit `?code=`, échange via `POST https://www.strava.com/oauth/token`, nettoie l'URL) ;
    `ensureFreshToken(settings): Promise<Settings>` (rafraîchit si `expiresAt` < maintenant + 60 s) ;
    `uploadSession(s: Session, settings): Promise<{ activityId: number }>` (POST `/api/v3/uploads` multipart,
    `external_id = session.id`, puis interroge `/api/v3/uploads/{id}` toutes les 2 s, 30 essais max ;
    une erreur « duplicate » → message « Déjà présente sur Strava »).
- [ ] Step 1 : tests TCX : XML bien formé (`DOMParser` de jsdom ou analyse par regex), nombre de Trackpoints = samples,
  `DistanceMeters` final = summary.distanceM, pas de `HeartRateBpm` quand hr = null.
- [ ] Step 2 : tests Strava avec `fetch` mocké : URL d'autorisation contient `scope=activity:write` et `approval_prompt=auto` ;
  rafraîchissement appelé seulement si le jeton expire ; upload → polling → `activityId` ; erreur réseau → message français
  proposant l'export `.tcx`.
- [ ] Step 3 : FAIL → implémenter → PASS.
- [ ] Step 4 : Réglages : circonférence (mm, avec aide « 700×25c = 2105, 700×28c = 2136 »), niveau par défaut, FC max,
  calibration, pause automatique, section Strava (guide en 4 étapes, champs Client ID / Secret, « Connecter à Strava »,
  état connecté / déconnecter), export (partage via `navigator.share` avec fichier, sinon téléchargement) et import.
- [ ] Step 5 : commit.

### Tâche 10 : README et finalisation

**Files :** Create `README.md`

- [ ] Step 1 : README en français : installer Bluefy, activer GitHub Pages (Settings → Pages → Source : GitHub Actions),
  ouvrir l'URL dans Bluefy, ajouter à l'écran d'accueil, mesurer la circonférence, configurer Strava
  (domaine de rappel `liamdaniels650.github.io`), sauvegardes régulières.
- [ ] Step 2 : `npm test` et `npm run build` → tout passe ; commit et push.
