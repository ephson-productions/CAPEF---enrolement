---
name: Filtres JSONB dans les tests
description: Limite de pg-mem pour parcourir les tableaux JSONB avec des requêtes SQL.
---

Les tests API utilisent pg-mem 3.0.14, qui ne fournit pas `jsonb_array_elements()`. Pour les champs JSONB dont les valeurs sont contrôlées par l’interface, préférer l’opérateur JSONB `@>`; pour des correspondances plus générales ou insensibles à la casse, valider l’expression sur un vrai PostgreSQL.

**Why:** Une requête de filtre des représentants basée sur `jsonb_array_elements()` a retourné une erreur de fonction manquante dans pg-mem, même si la fonction existe en PostgreSQL.

**How to apply:** Quand un test pg-mem échoue sur une fonction JSONB, vérifier sa prise en charge avant d’attribuer l’échec au code SQL de production. Garder les tests de valeur contrôlée sur `@>` et réserver les expressions PostgreSQL avancées à des tests sur PostgreSQL.
