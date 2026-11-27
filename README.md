# Popote de la coloc

Appli web (téléphone) pour la coloc : on choisit les repas de la semaine, la liste de courses se calcule toute seule, Claude remplit le panier Leclerc Drive, puis on suit les recettes étape par étape et on coche ce qui a été fait.

Site : https://butoul20.github.io/repas-coloc/

## Fonctionnement
- `data/recettes.json` : le catalogue (ingrédients pour 1 personne, étapes, photo).
- `images/` : photos des plats, Wikimedia Commons (licences libres, auteur et licence affichés sur chaque fiche).
- État partagé (menu, portions, jours, cases cochées, statut du panier) : `data/etat.json` sur la branche **`etat`**. Chaque modification depuis l'appli est un commit sur cette branche (le site, servi depuis `main`, ne se reconstruit pas).
- Lecture publique. Écriture : clé GitHub à droits limités (Contents en écriture sur ce repo seulement), transmise par lien `…/repas-coloc/#cle=…` puis gardée dans le téléphone.

## Parcours
1. **Recettes** : `+` pour ajouter au menu (3 personnes par défaut).
2. **Semaine** : jour, nombre de personnes, ✅ fait.
3. **Courses** : cocher ce qu'on a déjà, puis « Demander le panier Leclerc Drive ».
4. Claude remplit le panier (voir `CLAUDE.md`), passe le statut à « Panier prêt » ; Matthieu paie sur le site Leclerc, puis « C'est commandé ».
