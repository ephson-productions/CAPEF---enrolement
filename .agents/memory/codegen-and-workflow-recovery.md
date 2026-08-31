---
name: Codegen et workflows
description: Contraintes de reprise après modification du contrat OpenAPI dans ce monorepo.
---

Les sorties générées par l’OpenAPI et les liens de dépendances du workspace doivent être présents avant de redémarrer les artefacts. Un workflow peut rester techniquement lancé tout en servant une version cassée si le codegen a nettoyé ses sorties ou si l’installation pnpm n’a pas réconcilié un paquet déjà déclaré.

**Why:** Le redémarrage du serveur a déjà révélé des erreurs de résolution qui n’étaient pas visibles dans le typecheck des bibliothèques.

**How to apply:** Après toute évolution du contrat, exécuter le codegen, le typecheck des paquets concernés, les builds avec `PORT`/`BASE_PATH`, puis redémarrer les workflows et contrôler leurs logs ainsi qu’un endpoint de santé.