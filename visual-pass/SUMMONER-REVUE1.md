# Summoner — Revue 1 (silhouettes) : ÉCHEC

Capture : `captures/passe1-revue1-silhouettes.png` — les dix unités alignées,
sans couleur, à la taille réelle du jeu (caméra de jeu par défaut), dans l'ordre
mini1, mini2, blub1, blub2, blub3, hungry, cyber, mecha, mecha2, superb.

Les trois questions de la revue, répondues honnêtement.

## 1. Chaque unité est-elle identifiable sans couleur ? — NON

| unité | verdict |
|---|---|
| mini1 | ✗ un caillou gris |
| mini2 | ✗ un caillou gris, le galet de tête ne se lit pas |
| blub1 | ✗ un caillou gris |
| blub2 | ~ la croûte dorsale se devine |
| blub3 | ✓ les épaulières se lisent |
| **hungry** | ✗✗ **ne lit pas du tout comme une mâchoire sur pattes** — c'est une masse |
| cyber | ~ lit comme un blob avec des excroissances |
| mecha | ✓ lit comme une machine |
| mecha2 | ~ lit comme une machine, mais voir 2. |
| superb | ✓ colosse, lisible |

## 2. Deux silhouettes se confondent-elles ? — OUI, deux groupes

- **mini1 / mini2 / blub1** sont interchangeables à cette taille. C'est le
  défaut le plus grave : ce sont trois unités distinctes du §7 et rien ne les
  sépare. Le §17 exige explicitement de « distinguer un Mini Blub d'un Blub III
  par la silhouette seule » — ici on ne distingue même pas un Mini d'un Blub I.
- **mecha / mecha2** partagent le même profil trapu à deux canons. Seule la
  taille les sépare, ce qui n'est pas une silhouette.

## 3. Les rapports de taille sont-ils exacts ? — OUI

Les rayons au sol mesurés à la construction sont exactement ceux du §7 :
10, 10, 10, 13, 20, 25, 25, 30, 40, 50 px. Le SuperBlub occupe bien vingt-cinq
fois la surface d'un Mini Blub. C'est le seul point de la revue qui passe.

## Cause racine

`drop()` produit une forme **trop écrasée** : les corps sont plus larges que
hauts et lisent comme des galets, pas comme des gouttes gélatineuses. Toute la
famille A en souffre, et c'est ce qui rend les petites unités interchangeables —
à 20 px de large et 16 px de haut il ne reste aucune place pour une silhouette.

Le Hungry Blub échoue pour une autre raison : sa mâchoire est modélisée comme
deux frusta empilés de rayon proche, donc la « gueule » ne s'ouvre pas assez
pour se lire. Le brief demande « une mâchoire sur pattes, corps réduit » — la
proportion actuelle est l'inverse.

## Corrections à appliquer avant d'avancer (refaire la passe 1)

1. **Élancer `drop()`** : hauteur ≥ 1.9 × rayon pour blub1/2/3, base plus
   étroite, ventre plus marqué. Une goutte, pas un galet.
2. **Séparer les trois petites** :
   - mini1 : presque entièrement bouche — la gueule doit faire plus de la moitié
     de la hauteur, corps quasi absent, profil « bouche sur pattes courtes ».
   - mini2 : même gueule mais le galet de tête devient un vrai bloc anguleux
     posé de travers, visible en ombre chinoise.
   - blub1 : goutte lisse, haute, sans aucun appendice — c'est sa définition.
3. **Hungry Blub** : ouvrir la mâchoire à ~45°, réduire le corps à un moignon
   derrière, allonger les pattes. La gueule doit dominer la silhouette.
4. **Séparer mecha / mecha2** : mecha reste bipède compact à deux canons ;
   mecha2 doit devenir nettement plus large que haut, épaulé, avec les
   réservoirs qui dépassent franchement du profil (ils sont censés être
   « instables et apparents »).

## Corrections appliquées — deuxième build

Capture : `captures/passe1-revue1b-silhouettes.png` et
`captures/passe1-revue1b-small-close.png`.

- `drop()` passe à quatre frusta avec un pied étroit et une vraie taille ; les
  gouttes font désormais 1,85 à 2,30 fois leur rayon en hauteur.
- Les deux Mini sont reconstruits **autour de la gueule** : une bouche béante
  qui occupe l'essentiel de la hauteur, un moignon de corps derrière, des
  pattes courtes. Le galet de mini2 devient un bloc anguleux posé de travers.
- Le Hungry Blub ouvre sa mâchoire et réduit son corps à une poche à l'arrière.
- Le MK2 devient large et trapu face au Mechablub dressé, réservoirs sortis du
  profil.

**Résultat : mini1/mini2/blub1 ne se confondent plus, et le Hungry Blub lit
enfin comme une mâchoire sur pattes.** Les rapports de taille restent exacts.

**Revue 1 n'est PAS encore close** : elle porte sur *toutes* les silhouettes, et
il manque encore les 7 corps de l'invocateur, les 5 tiers de la créature et les
marques. Elle sera rejouée sur l'ensemble complet.

## Outil de revue

`TDObs.showcase([{model, radius}])` aligne n'importe quels modèles enregistrés à
l'échelle réelle du jeu, sans avoir besoin de les instancier comme objets de
jeu — nécessaire pour les paliers de tour et les tiers de créature. Vérifié sur
les dix unités (`captures/passe1-showcase-units.png`).

## Ce qui n'est PAS en cause

Les rayons, la table `UNIT_FOOTPRINT` et le lien avec `js/blub.js` sont
corrects et ne doivent pas bouger. La correction est purement une question de
proportions et d'appendices.
