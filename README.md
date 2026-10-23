# MediLink TN — Pack patient + médecin

## Contenu
- `patient-site/` : site web patient HTML/CSS/JS, déployable sur Vercel.
- `doctor-software/` : logiciel bureau médecin en Python + pywebview.
- `supabase/` : schéma SQL, RLS, stockage privé et création d'un médecin.

## Important
Ce pack est un **MVP technique utilisant des données fictives**. Ne mettez aucune donnée médicale réelle en production avant audit sécurité, analyse juridique, politique de confidentialité, gestion du consentement, sauvegarde et contrat d'hébergement adapté.

## 1. Créer la base
Il est fortement recommandé de créer un NOUVEAU projet Supabase distinct. Dans SQL Editor, exécutez `supabase/01_schema_and_security.sql` en entier.

## 2. Configurer les deux interfaces
Dans Supabase : Project Settings > API, copiez la clé publique `anon`/`publishable`.
Remplacez `REMPLACER_PAR_VOTRE_CLE_ANON` dans :
- `patient-site/config.json`
- `doctor-software/web/config.json`
Ne placez jamais la clé `service_role` dans ces fichiers.

## 3. Tester le site patient
Depuis le dossier `patient-site` :
`python -m http.server 8080`
Puis ouvrez `http://localhost:8080`.

## 4. Déployer sur Vercel
Créez un nouveau projet Vercel, choisissez `patient-site` comme Root Directory, sans commande de build, puis déployez.
Ajoutez l'URL Vercel dans Supabase > Authentication > URL Configuration > Site URL et Redirect URLs.

## 5. Créer un compte médecin
Créez le compte dans Supabase Authentication > Users. Copiez son UUID réel, puis adaptez et exécutez `supabase/02_create_doctor_profile.sql`. Ne passez le statut à `verified` qu'après vérification réelle.

## 6. Tester et construire le logiciel Windows
Sur un PC Windows personnel disposant de Python 3.11/3.12 :
- double-cliquez `doctor-software/TESTER_LOGICIEL.bat` pour tester ;
- double-cliquez `doctor-software/build_windows.bat` pour produire l'EXE ;
- résultat : `doctor-software/dist/MediLink-Medecin.exe`.

Le fichier EXE doit être construit sous Windows. Le présent ZIP contient le code complet et le script automatique, mais pas un binaire Windows précompilé, car le pack a été généré dans un environnement Linux et un EXE doit être produit/testé sous Windows.

## Sécurité fonctionnelle
- L'identifiant patient ne suffit jamais à ouvrir un dossier.
- Le patient accorde un accès limité à 7 jours et peut le révoquer.
- Les politiques RLS bloquent l'accès non autorisé.
- Les documents sont stockés dans un bucket privé avec URL temporaire.
