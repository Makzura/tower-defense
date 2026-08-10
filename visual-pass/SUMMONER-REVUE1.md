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

---

# Revue 1 — passe complète (les 46 modèles)

Première exécution de la revue sur **l'ensemble** des silhouettes : 10 unités
blub, 7 corps d'invocateur, 5 tiers de créature fusionnée, 20 marques d'unité et
4 marques d'invocateur. Les quatre scripts ont été reconstruits en
`--silhouette`, la page rechargée, les 46 modèles vérifiés comme enregistrés
(`GLModels.has` → 46/46, aucun manquant).

## Méthode — et pourquoi les chiffres sont des mesures, pas des impressions

* **Échelle réelle du jeu** : caméra de jeu par défaut (`camDefault` — cible
  640/360, distance 2021,363, pitch 0,5945, yaw −π/2), viewport de référence
  **1278 × 719**.
* En cours de session la fenêtre Chrome a grandi (1278×719 → 2320×1305).
  `drawWorld()` appelle `resize()` à chaque frame, donc le px-par-unité change
  en silence. Toutes les mesures postérieures ont été prises avec la distance
  compensée `2021,363 × H/719` (= 3668,8), ce qui **reproduit `summoner-base` à
  420 px exactement** et `blub-superb` à 3 % près. Les mesures antérieures
  (unités, invocateurs, créature, marques d'unité) étaient déjà au viewport de
  référence. Tout ce qui est chiffré ci-dessous est donc à la même échelle.
* **Silhouettes extraites par différentiel** : frame avec le modèle moins frame
  sans, sur le backbuffer GL. Ce sont les pixels réellement rendus, pas une
  projection calculée. De là viennent la boîte, l'aire, et les recouvrements.
* Deux recouvrements sont donnés. **IoU brut** = les deux masques à leur taille
  vraie, alignés bas/centre (comment ils se posent sur la route). **IoU de
  forme** = les deux masques redimensionnés dans la même boîte, ce qui *retire
  la taille* et ne juge plus que le contour.

Captures — toutes ouvertes et jugées, aucune n'est là pour décorer :
`R1-units-default`, `R1-units-zoom`, `R1-units-void`, `R1-units-small-16x`,
`R1-units-mid-16x`, `R1-units-outline`, `R1-units-pairs`, `R1-units-pot-family`,
`R1-summoners-10x`, `R1-summoners-outline`, `R1-creature-5x`,
`R1-creature-outline`, `R1-marksA-stack`, `R1-summoner-marks`,
`R1-colour-proof`.

## Verdict par famille

| famille | verdict |
|---|---|
| 10 unités blub | **ÉCHEC** — trois paires se confondent, cinq unités partagent un seul contour |
| 7 corps d'invocateur | **RÉUSSITE** |
| 5 tiers de créature | **RÉUSSITE** |
| 20 marques d'unité | **NON JUGEABLE en passe 1** — plus deux cas sous le seuil du pixel |
| 4 marques d'invocateur | **RÉUSSITE sous réserve** — lisibles, `a2` et `b1` s'éteignent selon l'angle |

---

## 1. Chaque unité est-elle identifiable sans couleur ?

### Les dix unités — NON

Taille réelle à l'écran, caméra de jeu par défaut, yaw 0 (`R1-units-outline`,
`R1-units-void`) :

| unité | rayon | boîte px | aire px | verdict |
|---|---|---|---|---|
| mini1 | 10 | 10 × 13 | 86 | ~ un galet à pointe — se lit *contre* blub1, pas contre mini2 |
| mini2 | 10 | 10 × 12 | 86 | ✗ identique à mini1 |
| blub1 | 10 | 13 × 15 | 148 | ✗ œuf lisse, sans aucun trait |
| blub2 | 13 | 17 × 18 | 230 | ✗ le même œuf, plus gros |
| blub3 | 20 | 28 × 25 | 576 | ✓ les deux oreilles sortent du contour |
| hungry | 25 | 33 × 29 | 745 | ~ la couronne dentelée et les pattes ne font qu'une frange de 1 px |
| cyber | 25 | 32 × 29 | 692 | ✗ masse ronde + un ergot rectangulaire |
| mecha | 30 | 34 × 29 | 791 | ✓ créneaux et pods, lit machine |
| mecha2 | 40 | 66 × 37 | 1883 | ✓ châssis large, très reconnaissable |
| superb | 50 | 67 × 65 | 2928 | ✓ colosse au bras levé |

La correction de la première revue **tient à moitié** : mini1 et mini2 ne se
confondent plus avec blub1 (IoU brut 0,58 / 0,49 / 0,49 à yaw 0 / 45° / 90° —
la pointe suffit). Le Hungry Blub a bien une gueule et des pattes en gros plan.
Mais le défaut de fond n'a pas été traité.

### Les 7 corps d'invocateur — OUI (`R1-summoners-outline`, `R1-summoners-10x`)

| corps | boîte px | aire px | ce qui le désigne |
|---|---|---|---|
| base | 33 × 37 | 420 | homme debout, besace basse à gauche |
| a3 | 33 × 41 | 440 | chapeau à large bord + jupe évasée |
| a4 | 31 × 38 | 578 | **deux verticales** — l'homme et son monolithe |
| a5 | 41 × 32 | 558 | le seul plus large que haut, double anneau au sol |
| b3 | 27 × 34 | 408 | voûté, sac dorsal, tige au sol |
| b4 | 27 × 36 | 469 | tête-enclume large sur tige étroite, en l'air |
| b5 | 37 × 41 | 584 | un T — barre horizontale à hauteur de tête |

Les sept se lisent. Rien ne se confond (§2 ci-dessous).

### Les 5 tiers de créature — OUI (`R1-creature-outline`, `R1-creature-5x`)

Le contrat en tête de `summoner_creature.py` est tenu tier par tier, vérifié sur
le contour et pas sur l'intention :

| tier | boîte px | contrat | observé |
|---|---|---|---|
| t0 | 32 × 28 | plus large que haut, aucun relief | ✓ flaque, 32 > 28 |
| t1 | 40 × 55 | plus haut que large, tablier | ✓ capuche dressée + évasement |
| t2 | 48 × 61 | enclume, surplomb | ✓ masse haute sur deux moignons |
| t3 | 74 × 94 | trépied, **trous dans le contour** | ✓ deux trous nets sous les bras |
| t4 | 128 × 153 | montagne sous couronne de flèches | ✓ |

## 2. Deux silhouettes se confondent-elles ?

### Unités — OUI, et plus gravement qu'à la revue précédente

Trois paires, mesurées sur les pixels rendus (`R1-units-pairs`) :

| paire | IoU brut yaw 0 / 45° / 90° | IoU de forme | contenance |
|---|---|---|---|
| **mini1 / mini2** | 0,951 / 0,921 / **0,986** | — | 96,9 % de mini1 est dans mini2 |
| **blub1 / blub2** | 0,639 / 0,668 / 0,606 | **0,895** | 92,2 % de blub1 est dans blub2 |
| **hungry / cyber** | 0,862 / 0,785 / 0,785 | **0,877** | 93,0 % de hungry est dans cyber |

* **mini1 / mini2** : c'est le même contour sous tous les angles. La correction
  demandée à la revue précédente — « le galet de tête devient un vrai bloc
  anguleux posé de travers, visible en ombre chinoise » — a bien été appliquée
  dans la géométrie, mais à 10 × 12 px ce bloc pèse **un à deux pixels**. Il
  n'existe pas en ombre chinoise. Voir `R1-units-small-16x` : à 16× on distingue
  une pointe (mini1) de deux ergots (mini2) ; à 1× il n'y a rien.
* **blub1 / blub2** : blub1 est *strictement inclus* dans blub2. Ce sont deux
  tailles du même œuf, sans un seul trait qui les sépare.
* **hungry / cyber** : les deux ont le même rayon (25) et la même masse ronde.
  Ils ne se séparent même pas par la taille.

Et le défaut est plus large que trois paires. En retirant la taille, **cinq des
dix unités partagent un seul contour** (`R1-units-pot-family` — les cinq masques
ramenés à la même boîte sont cinq galets quasi identiques) :

```
blub1/cyber  0,898   blub1/blub2  0,895   blub2/cyber  0,882
hungry/cyber 0,877   blub2/hungry 0,876   blub1/hungry 0,874
mini2/cyber  0,853
```

Le §17 exige de « distinguer un Mini Blub d'un Blub III par la silhouette
seule » : ça, c'est acquis (blub3 a ses oreilles). Ce qui ne l'est pas, c'est de
distinguer un Blub I d'un Blub II, un Mini I d'un Mini II, ou un Hungry d'un
Cyber. `summoner_creature.py` énonce lui-même la règle qui est enfreinte ici :
*« deux contours qui ne diffèrent que par l'échelle sont le même contour »* — et
blub1/blub2 n'ont même que ça, tandis que hungry/cyber n'ont pas même l'échelle.

**La couleur ne rattrape pas le cas le plus grave.** Sur le build couleur
(`R1-colour-proof`), hungry et cyber se séparent (mousse verte contre bleu), mais
mini1/mini2 et blub1/blub2 sont **de la même couleur** en plus d'avoir le même
contour.

### Invocateurs — NON (aucune paire douteuse)

Pire paire **base / a3 à 0,61**, puis base/b3 0,548, b3/b4 0,523 ; tout le reste
≤ 0,49. Base et a3 sont proches en surface mais le chapeau et la jupe d'a3
changent franchement le profil, et base/b3 se sépare par la voûte et le sac. À
comparer aux 0,95 de mini1/mini2 : cette famille a une vraie marge.

### Créature — NON

IoU brut le plus haut : t1/t2 à 0,638, puis t0/t1 0,459 et t2/t3 0,394. Chaque
tier change de profil, comme le contrat l'exige, et pas seulement de taille.

## 3. Les rapports de taille sont-ils exacts ? — OUI

Les rayons au sol imprimés à la construction sont exactement ceux des tables, et
ils n'ont pas bougé d'un pixel :

* unités : **10 / 13 / 20 / 10 / 10 / 25 / 25 / 30 / 40 / 50 px** (§7) ;
* créature : **25 / 30 / 35 / 50 / 100 px** (`BlubTower.MONSTER_TIERS`) ;
* invocateur : **25,0 px** (0,786 u), cercle de craie 0,629 u.

Deux remarques qui n'invalident rien mais qu'il vaut mieux savoir :

1. **La largeur à l'écran ne suit pas l'empreinte.** superb (r 50) mesure
   67 px de large contre 66 px pour mecha2 (r 40) : au sol superb est 25 % plus
   grand, à l'écran il n'est pas plus large. Il gagne en hauteur (65 contre 37)
   et en aire (2928 contre 1883). L'empreinte est juste ; la *lecture* de la
   hiérarchie passe par la hauteur, pas par la largeur.
2. **`summoner_unit_marks.py` imprime mini1/mini2 à 7,8 px de rayon** là où
   `UNIT_FOOTPRINT` dit 10. Ce n'est pas une dérive d'empreinte : c'est le rayon
   du *corps reconstruit* des Mini, dont la marque a besoin pour trouver son
   siège. L'empreinte de jeu reste 10 et ne doit pas bouger.

## 4. Les marques

### 20 marques d'unité — la revue 1 est le mauvais instrument, et il faut le dire

Pixels **ajoutés** par la marque au-dessus du corps nu, à l'échelle réelle,
meilleur des quatre yaws (`R1-marksA-stack` : trois rangées, corps nu / +b1 /
+b2 — entre la première et la deuxième, **on ne voit rien**) :

| marque | b1 (bouche) | b2 (anneau) | corps nu |
|---|---|---|---|
| blub1 | **5** | 21 | 146 |
| blub2 | **3** | 29 | 222 |
| blub3 | **7** | 20 | 573 |
| mini1 | **5** | 21 | 87 |
| mini2 | **3** | 21 | 88 |
| hungry | 42 | 41 | 745 |

| marque | a1 | a2 |
|---|---|---|
| cyber | 17 | 32 |
| mecha | 33 | 30 |
| mecha2 | 90 | 23 |
| superb | 47 | 69 |

L'en-tête de `summoner_unit_marks.py` est explicite : la marque porte son sens
en **cyan émissif sur un corps de mousse**, « la façon légale la plus forte de
dire crosspath ». Un build silhouette éteint précisément ce qui les rend
lisibles. On ne peut donc pas les recaler en ÉCHEC sur la question 1 — c'est la
passe 2 qui les jugera.

Ce qui **peut** être conclu dès maintenant, parce que la couleur n'y changera
rien : **b1 sur blub1, blub2, blub3, mini1 et mini2 occupe 3 à 7 pixels
d'écran**. Une marque de 3 px n'a nulle part où mettre un cyan. Ces cinq-là sont
à revoir en taille, pas en palette. b1 sur hungry (42 px) et les huit marques de
voie B (17 à 90 px) sont, elles, d'une taille exploitable.

### 4 marques d'invocateur — RÉUSSITE sous réserve (`R1-summoner-marks`)

Pixels ajoutés, sur les 7 corps × 4 yaws, corps nu 408–584 px :

| marque | siège | plage | remarque |
|---|---|---|---|
| a1 | cercle | **47 – 60** | présente sur les 7 corps et les 4 yaws, jamais occultée |
| b2 | tête | 10 – 25 | toujours présente |
| a2 | hanche | **0** – 27 | nulle sur a3 à 90°, a4 à 180°, b5 à 90° |
| b1 | main dr. | **1** – 30 | 1–2 px sur a3 à 0° et 180° |

a1 et b2 passent franchement. a2 et b1 disparaissent derrière le corps sous
certains angles — c'est le comportement normal d'un détail posé sur un flanc, et
la tourelle tourne, donc ce n'est pas bloquant ; c'est noté pour que la passe 2
ne conclue pas à un bug de rendu en les voyant s'éteindre.

## Corrections à appliquer (aucun script n'a été modifié par cette revue)

1. **mini2 doit différer de mini1 par le CONTOUR, pas par un bloc de 2 px.** À
   10 × 12 px il n'y a pas de place pour un détail : la différence doit être une
   proportion d'ensemble — par exemple mini2 nettement plus large que haut
   (coin trapu) contre mini1 plus haut que large — ou un appendice qui sort du
   corps d'au moins 3 px à l'échelle réelle.
2. **blub2 doit cesser d'être blub1 agrandi.** Sa croûte dorsale existe dans les
   données (son siège de bouche est une *barre* là où blub1 a un *disque*) mais
   elle ne touche jamais le contour. Il lui faut un relief qui dépasse le profil
   de ≥ 2 px à l'échelle réelle.
3. **hungry et cyber (tous deux r 25) doivent se séparer par la proportion.** La
   couronne dentelée du Hungry et l'ergot du Cyber ne pèsent qu'une frange de
   1 px. L'un des deux doit changer de rapport hauteur/largeur.
4. **Le fond du problème** : cinq des dix unités (mini2, blub1, blub2, hungry,
   cyber) partagent un contour circulaire à ≥ 0,85 d'IoU de forme. Il faut au
   moins un profil franchement non circulaire parmi les petites et moyennes,
   sans quoi corriger les paires une à une ne fera que déplacer la confusion.
5. **b1 sur blub1/blub2/blub3/mini1/mini2** : 3 à 7 px. À agrandir avant que la
   passe 2 ne cherche à les colorer.

## Reconstruction couleur — confirmée

Les quatre scripts ont été relancés **sans** `--silhouette` immédiatement après
la revue, et le résultat a été vérifié sur disque et dans le jeu :

* **46/46 modèles en couleur sur disque**, de 2 à 10 entrées de palette, minimum
  2 — aucun fichier à palette unique. Zéro gris, zéro manquant.
* Page rechargée : `GLModels.has` → 46/46 enregistrés.
* `R1-colour-proof` (ouverte) : blubs vert mousse, Cyber bleu, Mecha acier à
  anneaux cyan, invocateurs avec cercle de craie et cercle d'or, tiers de
  créature verts. Chroma moyenne 24,8 sur 25 822 px de modèle.
* `node tools/check-winding.js` avec `PYTHON=` renseigné : les 12 primitives
  (`gl-geometry` et `td_mesh`) sont **toutes orientées vers l'extérieur**.

## Outil ajouté à la revue

Le harnais ne mesurait pas les silhouettes ; il a fallu l'outiller, entièrement
en session (rien n'a été écrit dans le jeu) :

* extraction du masque d'un modèle par différentiel de frames, d'où boîte, aire
  et recouvrements — c'est ce qui transforme « ils se ressemblent » en 0,951 ;
* `TDCrop` (agrandissement au plus proche voisin d'une région, sans changer le
  rendu : on grossit les pixels réels, on ne rapproche pas la caméra) ;
* `TDStack` (empilement de deux ou trois configurations dans une seule image —
  c'est ce qui montre que la rangée « corps nu » et la rangée « corps + b1 »
  sont identiques) ;
* `TDSheet` / `TDPair` (contour pur noir sur blanc, et superposition de deux
  contours en deux couleurs).

**La leçon de la session** : la compensation de distance après le
redimensionnement de fenêtre. `drawWorld()` appelle `resize()` à chaque frame,
donc « échelle réelle du jeu » n'est pas une propriété de la caméra seule — une
fenêtre qui grandit change le px-par-unité sans rien dire. Toute mesure de
silhouette doit citer son viewport, sans quoi deux revues ne sont pas
comparables.

---

# Revue 1 — units, second pass : ÉCHEC (d'un cheveu, et pour une paire nouvelle)

Rejeu de la moitié « unités » de la Revue 1 après le travail des trois agents.
**Le défaut de fond signalé par la Revue 1 est corrigé.** Les cinq paires
demandées passent toutes. La revue ne se clôt quand même pas : une paire
*nouvelle* — **blub3 / cyber** — est passée au-dessus du seuil, et blub3 était
une unité **RÉUSSITE** à la revue précédente. C'est donc une régression, pas un
reliquat.

## Viewport et calibration — pourquoi ces chiffres sont comparables aux précédents

* Canvas **2220 × 1249** (et non 1278 × 719). `drawWorld()` appelle `resize()` à
  chaque frame : la distance a donc été compensée `2021,363 × 1249/719 =
  3511,38`, exactement la méthode de la Revue 1.
* Silhouettes **extraites par différentiel de frames** sur le canvas GL (frame
  avec le modèle moins frame sans), seuil de différence 12/765.
* **La calibration est prouvée sur des modèles que personne n'a touchés** —
  invocateurs et tiers de créature (horodatage 22:58, antérieur au chantier de
  00:18) :

| mesure | cette passe | Revue 1 | écart |
|---|---|---|---|
| `summoner-base` boîte / aire | 34 × 38 / 446 | 33 × 37 / 420 | +1 px, +6 % |
| invocateurs base/a3 IoU brut | 0,614 | 0,61 | +0,004 |
| invocateurs base/b3 | 0,561 | 0,548 | +0,013 |
| invocateurs b3/b4 | 0,555 | 0,523 | +0,032 |
| créature t1/t2 | 0,649 | 0,638 | +0,011 |
| créature t0/t1 | 0,465 | 0,459 | +0,006 |
| créature t2/t3 | 0,384 | 0,394 | −0,010 |

Mon extraction est donc **très légèrement plus généreuse** (+1 px par côté,
+0,01 d'IoU en moyenne). À retenir pour lire le cas limite plus bas : un 0,853
chez moi vaut ~0,84 avec le réglage de la Revue 1.

* L'IoU de forme est stable : recalculé à N = 32/48/64/96/128, l'étalement par
  paire est **≤ 0,020**. Le cas limite n'est pas un artefact de rééchantillonnage.
* Captures ouvertes et jugées : `R1b-units-silhouettes`, `R1b-small-16x`,
  `R1b-pair-mini1-mini2`, `R1b-pair-blub1-blub2`, `R1b-pair-hungry-cyber`,
  `R1b-pair-blub3-cyber`, `R1b-units-colour`.

## Les dix unités — boîte et aire à l'échelle réelle, yaw 0

| unité | rayon | boîte px | aire px | l/h | Revue 1 |
|---|---|---|---|---|---|
| mini1 | 10 | 10 × 15 | 106 | **0,67** | 10 × 13 / 86 |
| mini2 | 10 | 16 × 12 | 132 | **1,33** | 10 × 12 / 86 |
| blub1 | 10 | 14 × 22 | 234 | **0,64** | 13 × 15 / 148 |
| blub2 | 13 | 28 × 13 | 251 | **2,15** | 17 × 18 / 230 |
| blub3 | 20 | 30 × 26 | 609 | 1,15 | 28 × 25 / 576 |
| hungry | 25 | 34 × 32 | 822 | 1,06 | 33 × 29 / 745 |
| cyber | 25 | 34 × 37 | 816 | 0,92 | 32 × 29 / 692 |
| mecha | 30 | 35 × 29 | 841 | 1,21 | 34 × 29 / 791 |
| mecha2 | 40 | 68 × 38 | 2029 | 1,79 | 66 × 37 / 1883 |
| superb | 50 | 66 × 66 | 3048 | 1,00 | 67 × 65 / 2928 |

**Le profil franchement non circulaire réclamé par la Revue 1 existe** : les
rapports l/h des petites vont de **0,64 (blub1, œuf dressé)** à **2,15 (blub2,
dalle plate)**, un facteur 3,4. Avant, les cinq « galets » étaient tous entre
0,9 et 1,15.

## 1. Chaque unité est-elle identifiable sans couleur ? — OUI

Jugé sur `R1b-small-16x` et `R1b-units-silhouettes` (masques de readback, noir
sur blanc, zoom 16×) — pas sur l'intention.

| unité | verdict | ce qui la désigne en ombre chinoise |
|---|---|---|
| mini1 | ✓ | flèche étroite, pointe franche au sommet, plus haute que large |
| mini2 | ✓ | motte basse et large, encoche sur le flanc droit |
| blub1 | ✓ | œuf haut et lisse, aucun appendice — c'est sa définition |
| blub2 | ✓ | **dalle horizontale surmontée d'une bosse dorsale** — rien d'autre dans la famille ne ressemble à ça |
| blub3 | ~ | les deux oreilles se lisent à yaw 0 ; **elles disparaissent à yaw 45/90** où il redevient une masse ronde |
| hungry | ✓ | pattes qui sortent sous le corps, bourrelets latéraux de 3-6 px |
| cyber | ✓ | dôme à pointe unique, épaules encochées |
| mecha | ✓ | créneaux, lit machine |
| mecha2 | ✓ | châssis large à créneaux |
| superb | ✓ | colosse au bras levé |

## 2. Deux silhouettes se confondent-elles ? — OUI, une seule, et elle est neuve

### Les cinq paires demandées — toutes PASSENT

IoU de **forme** (taille retirée) à yaw 0 / 45 / 90, et IoU **brut** :

| paire | forme y0 / y45 / y90 | max | Revue 1 | brut y0/45/90 | verdict |
|---|---|---|---|---|---|
| mini1 / mini2 | 0,801 / 0,739 / 0,756 | **0,801** | 0,986 (brut) | 0,619 / 0,607 / 0,621 | **PASSE** |
| blub1 / blub2 | 0,760 / 0,574 / 0,807 | **0,807** | 0,895 | 0,322 / 0,428 / 0,728 | **PASSE** |
| hungry / cyber | 0,727 / 0,671 / 0,690 | **0,727** | 0,877 | 0,752 / 0,643 / 0,643 | **PASSE** |
| blub1 / cyber | 0,780 / 0,843 / 0,838 | **0,843** | 0,898 | 0,284 / 0,283 / 0,299 | passe, de peu |
| blub2 / cyber | 0,780 / 0,613 / 0,726 | **0,780** | 0,882 | 0,219 / 0,261 / 0,232 | **PASSE** |

Les trois paires nommées par la Revue 1 sont réellement réparées, et pas de
justesse :

* **mini1 / mini2** — la correction demandée était « une proportion d'ensemble,
  pas un détail de 2 px ». C'est ce qui a été fait : 0,67 contre 1,33 de rapport
  l/h. L'IoU brut tombe de **0,986 → 0,621**. Sur `R1b-pair-mini1-mini2` la
  pointe de mini1 dépasse le corps de mini2 de 3 px et les lobes de mini2
  débordent de 2-3 px de chaque côté, à l'échelle réelle.
* **blub1 / blub2** — l'œuf inclus dans l'œuf a disparu : la contenance
  blub1-dans-blub2 tombe de **92,2 % → 75,6 %**. blub2 est devenu une dalle
  (28 × 13) là où blub1 est un œuf dressé (14 × 22).
* **hungry / cyber** — 0,877 → **0,727**, la plus grosse marge de la famille.
  Cyber a pris de la hauteur (29 → 37 px) et le Hungry de la largeur.

### La grappe circulaire de cinq unités — DISSOUTE

Les sept paires que la Revue 1 listait au-dessus de 0,85 sont toutes redescendues :

```
blub1/cyber   0,898 -> 0,843      blub2/hungry  0,876 -> 0,756
blub1/blub2   0,895 -> 0,807      blub1/hungry  0,874 -> 0,825
blub2/cyber   0,882 -> 0,780      mini2/cyber   0,853 -> 0,822
hungry/cyber  0,877 -> 0,727
```

C'est exactement la correction n° 4 de la Revue 1, et elle est acquise.

### Mais quatre paires sont au-dessus de 0,85 — et une seule compte

Balayage complet des 45 paires :

| paire | forme max | brut max | rayons | confusion réelle ? |
|---|---|---|---|---|
| **blub3 / cyber** | **0,853** | **0,721** | **20 / 25** | **OUI** |
| mini1 / blub3 | 0,868 | 0,189 | 10 / 20 | non — 106 px contre 609 px d'aire |
| blub3 / mecha2 | 0,867 | 0,300 | 20 / 40 | non — 30×26 contre 68×38 |
| mecha / mecha2 | 0,851 | 0,414 | 30 / 40 | non — mecha2 fait le double de large |

L'IoU de forme retire la taille *par construction* : sur des unités que trois
crans de rayon séparent, il ne dit plus rien de ce que le joueur voit, et l'IoU
brut le confirme (0,19 à 0,41). **blub3 / cyber est le seul cas où les deux
métriques accusent en même temps.**

### blub3 / cyber — le motif exact du rejet précédent, sur un couple neuf

```
forme  0,778 / 0,846 / 0,853   (yaw 0 / 45 / 90)
brut   0,715 / 0,721 / 0,715   -- élevé aux TROIS yaws
contenance : 99,5 % de blub3 est à l'intérieur de cyber
rayons 20 et 25 -- un seul cran d'écart
```

Sur `R1b-pair-blub3-cyber` le rouge (blub3) est **avalé** par le bleu (cyber) :
à yaw 45 et 90 il ne reste de blub3 qu'une frange de 1-2 px sous le ventre. Les
oreilles qui faisaient passer blub3 à la revue précédente **ne sortent du
contour qu'à yaw 0** ; dès que l'unité tourne — et elle tourne, elle vise — il
redevient la masse ronde de cyber en plus petit.

C'est mot pour mot le grief que la Revue 1 opposait à blub1/blub2 (« deux
contours qui ne diffèrent que par l'échelle sont le même contour »), et à
hungry/cyber son IoU brut était de 0,862 / 0,785 / 0,785 : **blub3/cyber est
plus régulièrement élevé en brut (0,715 aux trois yaws) que la paire qui avait
fait échouer la revue.**

Réserve d'honnêteté : à 0,853 la paire est **au seuil**, et ma calibration mesure
~+0,01 haut, donc au réglage exact de la Revue 1 elle vaudrait ~0,84. Ce n'est
pas sur les 0,003 que repose le rejet — c'est sur la **conjonction** brut 0,72
aux trois yaws + contenance 99,5 % + rayons voisins, qu'aucune des quatre autres
paires « > 0,85 » ne présente.

### Contenance — deux cas anormaux

Une petite unité tient dans une grande : c'est banal et non signifiant. Les deux
qui le sont :

* **blub3 dans cyber, 99,5 %** — rayons voisins (20 / 25). Traité ci-dessus.
* **blub2 dans blub1, 95,2 % à yaw 90** — et c'est une **inversion de
  hiérarchie** : blub2 (rayon 13) rend 11 × 19 px / 186 px d'aire, contre
  14 × 22 / 234 pour blub1 (rayon **10**). La plus grosse empreinte occupe **79 %**
  de la surface écran de la plus petite. La dalle de blub2 est superbe de face et
  se met de chant à yaw 90, où elle devient un poteau étroit.

## 3. Les rapports de taille sont-ils exacts ? — OUI

`js/blub.js` (`UNITS[].footprintUl`) et `UNIT_FOOTPRINT` de `tower_summoner.py`
concordent et n'ont pas bougé d'une unité :

```
blub1 10   blub2 13   blub3 20   mini1 10   mini2 10
hungry 25  cyber 25   mecha 30   mecha2 40  superb 50
```

`js/blub.js` porte encore son horodatage d'origine (10 août 20:06) : **aucune
valeur de simulation n'a été touchée.**

L'aire écran reste monotone avec le rayon — 106, 132, 234, 251, 609, 822, 816,
841, 2029, 3048 — la seule inversion étant hungry/cyber, qui partagent le
rayon 25. Deux remarques de *lecture*, qui ne sont pas des dérives d'empreinte :

1. blub2 (r 13) mesure 28 px de large contre 30 px pour blub3 (r 20) : à yaw 0 la
   dalle est presque aussi large qu'une unité de rayon 20.
2. L'inversion blub2 / blub1 à yaw 90 décrite au § 2.
3. superb (r 50) reste à 66 px de large contre 68 pour mecha2 (r 40) — inchangé
   depuis la Revue 1, la hiérarchie passe par la hauteur et l'aire.

## 4. Le défaut de livraison : la couche « detail » n'est pas dessinée

Indépendant des silhouettes, et il faut le dire parce qu'un script entier et dix
modèles en dépendent.

`tools/blender/blub_detail.py` construit dix modèles `blub-detail-<unit>` ;
`index.html` les charge (lignes 198-207, modifié à 00:03). **Rien ne les
dessine.** Le chemin de rendu est sans ambiguïté :

* `js/gl/gl-world.js:396` — `blubModel()` retourne `"blub-" + tower.unitId`, et
  rien d'autre ;
* la boucle de superposition (lignes 914-918) est gardée par
  `t.constructor.ID === "blub"`, c'est-à-dire **l'invocateur lui-même**, pas ses
  invocations, et elle n'itère que sur `summonerMarks()` → `summoner-mark-*` ;
* `gl-world.js` porte l'horodatage **22:52**, antérieur au build des details
  (00:26) : le renderer n'a jamais été modifié pour les prendre.

Conséquence mesurée — et c'est le point important pour la revue : **les
brancher ne sauverait pas la paire.**

| unité | px ajoutés au CONTOUR | unité | px ajoutés au CONTOUR |
|---|---|---|---|
| mini1 | +4 | hungry | +85 |
| mini2 | +13 | cyber | **−3** (entièrement à l'intérieur du corps) |
| blub1 | +13 | mecha | +76 |
| blub2 | +23 | mecha2 | +12 |
| blub3 | **+9** | superb | +33 |

En superposant corps + detail comme le runtime le ferait :
`blub3/cyber 0,853 → 0,842` (toujours au seuil), et **deux paires empirent** :
`mini1/mini2 0,801 → 0,812`, `blub1/blub2 0,807 → 0,814`.

L'en-tête de `blub_detail.py` annonce des couvertures de 11 à 148 px : ce sont
les pixels que le detail **modifie** (ré-ombrage compris), pas ceux qu'il
**ajoute au contour**. Les deux mesures sont légitimes, une seule porte sur la
silhouette. **Ce sont les corps qui ont réparé la famille, pas la couche detail.**

## 5. Contrôles de livraison

| contrôle | résultat |
|---|---|
| 46/46 modèles en couleur sur disque | ✓ — minimum **2 entrées** de palette, chroma max la plus basse **0,0862** (`blub-mark-a2-*`). **Zéro gris, zéro manquant, zéro palette unique.** |
| 10 modèles `blub-detail-*` (nouveaux, hors des 46) | ✓ colorés aussi, 2 à 4 entrées |
| build couleur committé | ✓ — `R1b-units-colour` ouverte : blubs vert mousse, cyber bleu, mecha acier à anneaux cyan, superb colosse sombre |
| `node tools/check-winding.js` | ✓ **exit 0**, 12 primitives (`gl-geometry` + `td_mesh`), **toutes vers l'extérieur**, aucune nouvelle primitive |
| empreintes de jeu | ✓ inchangées, `js/blub.js` non modifié |

## Verdict

**ÉCHEC** — mais un échec d'un seul point, et pas celui de la revue précédente.

Ce qui est acquis, et qui était le motif du rejet : la grappe de cinq unités à
contour circulaire est dissoute (sept paires redescendues, la pire de 0,898 à
0,843) ; les cinq paires demandées passent toutes sous 0,85 ; le profil
franchement non circulaire existe enfin (l/h de 0,64 à 2,15) ; les empreintes
n'ont pas bougé ; la couleur et le winding sont propres.

Ce qui bloque : **blub3 / cyber**, forme **0,853**, brut **0,715 / 0,721 /
0,715**, contenance **99,5 %**, rayons **20 et 25**. blub3 était une RÉUSSITE à
la Revue 1 : la correction a déplacé la confusion au lieu de la supprimer, ce
que la Revue 1 avait explicitement annoncé comme risque.

### À corriger avant de rejouer

1. **blub3 doit garder son identité hors de yaw 0.** Ses oreilles ne sortent du
   contour que de face ; à 45° et 90° il n'en reste rien. Il lui faut un relief
   qui dépasse le profil de ≥ 3 px **sous tous les yaws** — ou un rapport l/h
   qui s'écarte de cyber (aujourd'hui 1,15 contre 0,92, trop proche).
2. **Ou faire bouger cyber** : il a gagné 8 px de hauteur dans cette passe et
   c'est ce qui l'a amené sur blub3. Sa pointe unique est un bon départ ; elle
   doit peser plus que 2 px.
3. **Brancher ou retirer la couche detail.** Dix modèles et un script de 56 ko
   sont chargés par `index.html` et jamais dessinés. Si elle doit vivre, il faut
   une liste de superposition pour `tower.isSummon` dans `gl-world.js` à côté de
   `summonerMarks` — mais mesurer d'abord : telle quelle elle dégrade
   mini1/mini2 et blub1/blub2.
4. **L'inversion blub2 / blub1 à yaw 90** : la dalle de rayon 13 rend plus petite
   que l'œuf de rayon 10. À reprendre en épaisseur, pas en empreinte.

*Mesures : canvas 2220 × 1249, distance compensée 3511,38 (référence 1278 × 719),
caméra de jeu par défaut, silhouettes par différentiel de frames, IoU de forme à
N = 64 vérifié stable de N = 32 à 128.*
