# Publication Google Play – FourchetteSûre

Compte de publication : `dev.tlpc@gmail.com`.

## Avant le premier envoi (décisions définitives)
- **Identifiant d'application** : `fr.tomline.fourchettesure` (définitif après le premier envoi). Les APK GitHub antérieurs à la v0.2.0 (`fr.tomline.suivicuisine`) sont une autre appli et ne se mettent pas à jour vers celle-ci.
- **Clé de signature** : `%USERPROFILE%\.tomline-signing\fourchettesure.jks` + `.properties`. Utilisée comme **clé d'envoi** ; activer « Play App Signing » (recommandé) : Google garde la clé de distribution, la perte de la clé d'envoi reste récupérable via le support. **Sauvegardez ces deux fichiers hors de ce PC.**
- **Niveau d'API cible** : 36 (obligatoire depuis le 31/08/2026), déjà réglé.

## Fichier à envoyer
`.\scripts\Release.ps1 -NoPublish` produit `FourchetteSure-v<version>.aab` (bundle signé) à la racine du projet, à envoyer dans la console Play (« Production » ou « Test interne »). Incrémenter `version` dans `package.json` à chaque envoi (le code de version Android en est déduit).

## Fiche de la boutique (français)
- **Nom** (30 car. max) : `FourchetteSûre`
- **Description courte** (80 car. max) : `Traçabilité HACCP pour cantine : plats témoins, réceptions, nettoyage, DLC.`
- **Description complète** :

> FourchetteSûre aide les cuisines collectives (cantines scolaires, restaurants d'entreprise, EHPAD…) à tenir et à prouver leur suivi sanitaire, même sans connexion Internet.
>
> • Rappels journaliers : plats témoins avec photo obligatoire et date d'élimination calculée, relevés de températures, contrôles paramétrables, notifications tant que la tâche n'est pas validée.
> • Traçabilité des produits : photo de l'étiquette, lecture automatique (OCR) avec vérification, lots, fournisseurs, origine des viandes, recherche par lot en cas de rappel sanitaire.
> • Contrôle à réception : photos de la livraison et du bon, contrôles, températures, anomalies avec décision et mesures correctives.
> • Plan de nettoyage et désinfection : zones et fréquences modifiables, suivi vert / orange / rouge, produit, dilution et temps de contact mémorisés.
> • Dates après ouverture : date limite calculée et alertes (ouverture, veille, jour J, dépassement).
> • Réglementation : fiches courtes et modifiables (remise en température, refroidissement, plats témoins, allergènes, TIAC…).
> • Dossier sanitaire en PDF avec photos, historique et journal d'audit, prêt pour un contrôle.
> • Plusieurs profils (administrateur, responsable, agent, consultation) protégés par code PIN.
> • Fonctionne hors connexion ; synchronisation facultative entre appareils avec un compte.
>
> FourchetteSûre est un outil de suivi et de preuve : elle ne remplace pas le plan de maîtrise sanitaire propre à chaque établissement. Les durées et procédures sont à valider par le responsable de la cuisine.

- **Catégorie** : Entreprise (ou Productivité). **Tags** : professionnel, restauration.
- **Coordonnées** : e-mail `dev.tlpc@gmail.com`.
- **URL de la politique de confidentialité** : `https://rimfire03.github.io/FourchetteSure/` (GitHub Pages, dossier `docs` de la branche `main` ; à activer dans Settings → Pages).
- **Visuels** (`store-assets/`) : icône 512×512 (`icon-512.png`), image de présentation 1024×500 (`feature-graphic.png`). **Captures d'écran** : `store-assets/screenshots/` (5 captures 1080×1920 avec données fictives).

## Formulaires de la console
- **Public cible** : adultes uniquement (18+), pas destiné aux enfants (évite le programme « Familles », malgré le mot « cantine scolaire »).
- **Publicités** : aucune.
- **Questionnaire de classification** : aucune violence, contenu sensible ni achat → classification « tous publics ».
- **Sécurité des données** :
  - Collecte : *Adresse e-mail* (compte, facultatif), *Nom* (profils saisis), *Photos* (preuves), *Autres contenus de l'utilisateur* (enregistrements de traçabilité). Collecte facultative tant que le compte serveur n'est pas créé.
  - Partage avec des tiers : **non**.
  - Chiffrement en transit : **oui** (HTTPS).
  - Suppression des données : **oui** — dans l'application (Paramètres → Établissement & sauvegarde → « Supprimer mon compte et mes données serveur ») et via la page `…/#suppression` de la politique de confidentialité.
  - Finalité : fonctionnalités de l'application, gestion du compte. Pas de publicité ni d'analyse.
- **Permissions déclarées** : `INTERNET`, `CAMERA` (photos de preuve ; l'appareil photo n'est pas exigé : `required=false`).
- **Notifications** : l'application n'utilise pas encore les notifications natives (alerte seulement app ouverte) ; aucune permission `POST_NOTIFICATIONS` déclarée.

## Mise en ligne
1. Créer l'application dans la console Play (français, application gratuite).
2. Renseigner les formulaires ci-dessus et la fiche.
3. Envoyer le `.aab` en **Test interne** d'abord et l'installer sur un téléphone avant la production.
4. Comptes développeur **personnels** récents : Google impose un test fermé (environ 12 testeurs pendant 14 jours consécutifs) avant l'accès à la production ; à vérifier dans la console. Les comptes organisation (avec numéro D-U-N-S) en sont dispensés.
5. Les versions suivantes passent par `Release.ps1` : nouveau `.aab` à envoyer dans la console ; l'APK GitHub reste utilisable en parallèle pour une installation hors Play, mais la mise à jour automatique par le popup de l'appli renvoie vers l'APK de GitHub, pas vers le Play Store (à adapter si la version Play devient la seule distribution).
