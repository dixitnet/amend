# Revue de clôture de l'étape 9, « Publication et back-office » (2026-11-19)

- Relecteur : **Claude** (grille du § 6 des règles). Même appui que l'étape 7 : audit complet du 16/11/2026 et ses lots, audits partiels avant chaque fusion.
- Statut : revue écrite ; **à arbitrer par Sylvain**, qui clôt l'étape. Aucun critère de sortie n'est fixé pour cette étape (§ 8).

## Périmètre, après les décisions de Sylvain

- **Page publiée : abandonnée** (renoncement n° 27, 19/11/2026).
- **Back-office** : les rubriques de la v1 autres que Système et IA (personnes, invitations en attente, retours, journaux, consommation de l'IA) sont au registre depuis le 11/11/2026 (renoncement n° 20).

## Ce que l'étape a livré

Administrateurs désignés hors de l'application (`V2_ADMINS`) ; rubriques Synthèse et Système (version, mémoire, comptes, documents, relevés) ; Apparence de l'instance ; IA (modèle de Margo) ; Modèles de mise en page de l'instance ; Polices ; Images (analyse des images orphelines) ; Connecteur Claude. Exploitation : veille par courriel, sauvegarde nocturne et essai de restauration, déploiement automatique.

## Grille

1. **Couches et droits** : chaque route d'administration répond 401 sans session et 403 hors administrateur ; une adresse d'essai n'est jamais administratrice.
2. **Correction** : états d'erreur des rubriques (lot D de l'audit), analyse des images par lots et bornée dans le temps.
3. **Exploitation** : déploiement interrompu signalé, service de collaboration surveillé, mémoire à 500 Mo (lot E).
4. **Traductions** : textes du back-office dans les catalogues ; pages publiques du site en catalogue depuis le 19/11.

## Ce qui reste hors de l'étape

- La consommation de Margo en signes (renoncement n° 20) : à rouvrir si des limites sont posées (règle 6 de `CLAUDE.md` : les seuils se fixent sur les journaux réels, qui n'existent pas dans la v2).
- Les tests de `veiller.sh` (non faits, noté au journal).

## Conséquence

Avec les étapes 7 et 9 closes, il ne reste devant la bascule que ses conditions (point H du plan de la suite) : à fixer avec Sylvain.
