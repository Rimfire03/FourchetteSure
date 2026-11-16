# FourchetteSûre

PWA de traçabilité sanitaire pour cantine scolaire (React + Vite + Dexie/IndexedDB). Hors-ligne, installable sur Android/tablette/PC.

```bash
npm install
npm run dev      # développement
npm run build    # production (dist/), à servir en HTTPS pour l'installation PWA
npm test         # logique métier (dates, nettoyage, plats témoins, OCR parsing)
```

## Contenu
Rappels journaliers (plats témoins, photo obligatoire) · Traçabilité produits (OCR étiquette, viandes, recherche par lot) · Contrôle réception (photos obligatoires, anomalies) · Plan de nettoyage (vert/orange/rouge) · Dates après ouverture · Réglementation (fiches modifiables) · Export PDF · Paramètres (rôles, rappels, plan, sauvegarde JSON, journal d'audit).

## Limites connues
- Données stockées **sur l'appareil** (IndexedDB) ; synchronisation optionnelle avec l'API globale `api-tlpc` (voir ci-dessous).
- Notifications : fiables quand l'app est ouverte/installée ; pas de push serveur en arrière-plan.
- OCR : tesseract.js, langue `fra` téléchargée au premier usage (Internet requis une fois).
- Les durées après ouverture sont volontairement vides : à renseigner d'après étiquette fabricant / procédure validée.
- Fiches réglementaires = aide-mémoire à faire valider par le responsable (PMS) ; veille mensuelle à faire.

## Versions et mises à jour
- Version unique dans `package.json` (`versionName`/`versionCode` Android en sont déduits : `maj*10000 + min*100 + patch`). À incrémenter à la main avant chaque release.
- Au démarrage, l'appli interroge `releases/latest` du dépôt GitHub `Rimfire03/FourchetteSure` et affiche un popup si une version plus récente existe (bouton « Télécharger » vers l'APK de la release, « Plus tard », « Ignorer cette version »). Aussi disponible dans Paramètres → Établissement & sauvegarde.
- Release : `.\scripts\Release.ps1` (commit + push faits, `ANDROID_HOME` défini) → build, APK signé `FourchetteSure-v<version>.apk`, `gh release create`.
- La clé de signature `%USERPROFILE%\.tomline-signing\fourchettesure.jks` (+ `.properties`) ne doit **jamais** être commitée ni perdue : sans elle, les mises à jour ne s'installent plus par-dessus l'ancienne version.

## Synchronisation (hors-ligne d'abord)
- Serveur : `api-tlpc` (dépôt privé `Rimfire03/api-tlpc`, Dokploy, base Postgres Mobile), appli enregistrée sous `https://api.tlpc.fr/fourchettesure` (`POST /_admin/apps` avec le `ADMIN_TOKEN`).
- Un compte serveur (e-mail + mot de passe) = un établissement, partagé par ses appareils. Panneau « Serveur » dans Paramètres, ou « Se connecter au serveur » à l'écran de démarrage.
- Toute l'appli lit/écrit en local. Les modifications sont mises en file (`outbox`, hooks Dexie) et envoyées au retour du réseau ; dernier écrit gagne (`_u` par document) ; suppressions = pierres tombales ; photos en base64 (corps API limité à 1 Mo, photos réduites à 1024 px).
- Première connexion : serveur vide -> les données locales sont envoyées ; serveur déjà rempli -> les données locales sont remplacées (confirmation).
- Limites : nom de l'établissement non synchronisé ; inscription ouverte côté `api-tlpc` ; pas encore de connexion Google.
