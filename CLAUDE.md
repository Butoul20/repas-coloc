# Popote de la coloc : consignes pour Claude

## Remplir le panier Leclerc Drive
Quand Matthieu le demande (ou que `courses.statut` vaut `panier_demande` sur la branche `etat`) :
1. `git fetch origin etat && git show origin/etat:data/etat.json` et `data/recettes.json`.
2. Liste = somme sur `repas` de `ingredient.q × portions`, regroupée par nom + unité. Ignorer les clés cochées dans `courses.coches` (déjà à l'appart). Les ingrédients `placard: true` ne sont achetés que s'ils ne sont pas cochés ET que Matthieu le confirme.
3. MCP Leclerc Drive (magasin Voltaire Paris 997371) : `get_cart` d'abord (ne pas doubler), puis `search_product` / `add_to_cart`. Choisir le format le plus proche de la quantité (arrondi au-dessus), marque distributeur par défaut.
4. Écrire dans `etat.json` (branche `etat`) : `courses.statut = "panier_pret"` et `courses.note` = total + articles introuvables ou remplacés. Commit : `Claude : panier prêt`.
5. Ne jamais payer : Matthieu valide et paie lui-même sur le site.

## Ajouter une recette
Ajouter une entrée dans `data/recettes.json` (quantités pour 1 personne, unités : g, ml, pièce, c.à.s, c.à.c, gousse, tranche, cube, bouquet, pincée) et une photo libre de droits dans `images/<id>.jpg` avec son crédit.
