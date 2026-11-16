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
- Données stockées **sur l'appareil** (IndexedDB). Pas de synchronisation cloud (Supabase) ni de multi-appareils : utiliser la sauvegarde JSON. Chaque enregistrement porte déjà un `etabId` pour préparer le multi-établissements.
- Notifications : fiables quand l'app est ouverte/installée ; pas de push serveur en arrière-plan.
- OCR : tesseract.js, langue `fra` téléchargée au premier usage (Internet requis une fois).
- Les durées après ouverture sont volontairement vides : à renseigner d'après étiquette fabricant / procédure validée.
- Fiches réglementaires = aide-mémoire à faire valider par le responsable (PMS) ; veille mensuelle à faire.

## Versions et mises à jour
- Version unique dans `package.json` (`versionName`/`versionCode` Android en sont déduits : `maj*10000 + min*100 + patch`). À incrémenter à la main avant chaque release.
- Au démarrage, l'appli interroge `releases/latest` du dépôt GitHub `Rimfire03/FourchetteSure` et affiche un popup si une version plus récente existe (bouton « Télécharger » vers l'APK de la release, « Plus tard », « Ignorer cette version »). Aussi disponible dans Paramètres → Établissement & sauvegarde.
- Release : `.\scripts\Release.ps1` (commit + push faits, `ANDROID_HOME` défini) → build, APK signé `FourchetteSure-v<version>.apk`, `gh release create`.
- La clé de signature `%USERPROFILE%\.tomline-signing\fourchettesure.jks` (+ `.properties`) ne doit **jamais** être commitée ni perdue : sans elle, les mises à jour ne s'installent plus par-dessus l'ancienne version.
