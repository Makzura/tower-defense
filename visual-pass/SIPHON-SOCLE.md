# Siphon — Passe 0 : inventaire et SOCLE PARTAGÉ

Per §14 this is produced first and alone. **Nothing parallel starts until it is
validated**, because every parallel lot depends on these numbers.

---

## 0. Ce que la mécanique dit déjà (lu dans js/towers/beam.config.js)

`footprint: 15` u.l., **fixe à tous les paliers** — commenté dans le fichier
comme « placement only, NEVER changes with tiers ». Le §2 est donc déjà vrai
côté simulation ; il ne reste qu'à ne pas le trahir visuellement.

| palier | mécanisme débloqué | conséquence visuelle du brief |
|---|---|---|
| A1 | `ramp_per_target`, `def_pierce` | le **ramp** (§8) est visible dès A1. `def_pierce` n'a **aucun** effet visuel (§12) |
| A2 | — | palier de valeurs seules : le brief lui donne quand même un état (mains dorées) |
| A3 | `charge_to_gold` | le **sceptre** apparaît, l'anneau devient l'origine du rayon |
| A4 | `hp_scaling` | torse et bas du visage dorés |
| A5 | `gold_to_power` | **la jauge Midas** (§10) — c'est ce mécanisme-là, pas A3 |
| B1 | — | le capuchon bouge seul, seconde ombre |
| B2 | `slow` | l'**enlisement**, lu uniquement sur l'ennemi (§8, §12) |
| B3 | `lifesteal` | **la veine apparaît ici** (§9), fine et pâle |
| B4 | — | visage remplacé par une ouverture, tendons |
| B5 | `death_denial` | **la séquence de sacrifice** (§11) |

Deux points que cela tranche, et qu'il ne faut pas inventer autrement :
la veine naît à **B3** et non plus tôt ; la jauge Midas est **A5** et non A3.

---

## 1. Échelle et proportions du personnage de base

Le pipeline émet **31.8032 px par unité Blender** (`td_mesh.UNITS_TO_PX`), et le
plateau tourne à ~1 px par u.l. Donc `u_blender = px / 31.8032`.

| grandeur | u.l. / px | unités Blender |
|---|---|---|
| footprint de jeu (fixe) | 15 | rayon **0.4717** |
| hauteur totale, palier de base | ~57 | **1.79** |
| hauteur totale, A5 / B5 | ~66 | **2.08** (montée VERTICALE uniquement) |
| ourlet — côté long (traîne) | 21 | 0.66 depuis l'axe |
| ourlet — côté court (ouvert) | 11 | 0.35 depuis l'axe |

**L'ourlet asymétrique est le socle du §2** : 0.66 d'un côté, 0.35 de l'autre,
donc l'empreinte au sol n'est un cercle à aucun palier et ne peut pas l'être par
construction. L'axe vertical est rompu par une épaule gauche à **+0.06** plus
haute que la droite et un buste incliné de **8°** vers l'avant.

La tour ne grossit **jamais** au sol : de base à A5/B5 la seule croissance est
+0.29 en hauteur. Aucun lot ne doit augmenter un rayon au sol.

---

## 2. Points d'origine du rayon — EN COORDONNÉES

C'est le point que le §14 exige de figer avant toute production de rayon.

| état | nom | coordonnées (Blender local, +Y = devant) |
|---|---|---|
| base, A1, A2, toute la voie B | `HANDS` | **(0.055, 0.305, 1.045)** |
| A3, A4, A5 | `RING` | **(0.315, 0.395, 1.190)** |

`HANDS` est le **vide entre les deux paumes**, pas une paume — §4. Il est
volontairement décalé de +0.055 en x : les mains ne sont pas centrées sur l'axe,
ce qui est une des ruptures de symétrie exigées.

`RING` est le centre de l'anneau creux du sceptre, tenu en avant et à droite. Le
passage de `HANDS` à `RING` se fait **à A3 et seulement là**.

Les deux sont exportés par le script du personnage et **lus** par le lot rayon —
jamais retapés.

---

## 3. Palettes, valeurs exactes

Aucun recoupement avec l'Invocateur (vert-mousse/pierre et cyan-chrome).

```
BASE (avant tout achat) — pauvre, terne, humain
  cloth_worn   #6B6355   tissu usé, la plus grande surface, la plus sombre
  cloth_dark   #4A453C   plis et intérieur du capuchon
  hem_fray     #7D735F   ourlet effiloché
  skin         #B08A66   mains nues, seule peau visible
  skin_dark    #8A6A4C

VOIE A — l'idole
  gold         #C9A227   or franc
  gold_dark    #8A6E1C   creux et charnières
  brass        #9A7B3C
  amber        #D9A441   emission 0.30  (chaude, jamais froide)
  ochre_cloth  #A8823E   tissu ocre
  purple_rich  #6B3A6E   pourpre riche
  white_warm   #F0E2C0   emission 0.55  éclat métallique

VOIE B — l'abîme
  abyss        #2A1B3D   violet abyssal
  oil_black    #14101C   noir huileux, plus grande surface
  membrane     #4A4250   gris pourri
  rose_sick    #E86FA8   emission 0.70  luminescence rose malade
  rose_dim     #7A3A5C   emission 0.30
  tendon       #6B5570   translucide/nerveux
```

**Règle de valeur** : la plus grande surface prend la valeur la plus sombre.
`cloth_worn` en base, `oil_black` en B, et sur A c'est le drapé ocre — l'or est
un accent jusqu'à A4, pas un remplissage.

---

## 4. Ancrages au sol

| ancrage | nom | coordonnées | apparaît à |
|---|---|---|---|
| départ de la veine | `VEIN_ROOT` | **(-0.12, -0.28, 0.02)** | B3 |
| centre de la coulure d'or | `POUR_ROOT` | **(0.09, 0.14, 0.01)** | A4 |

`VEIN_ROOT` est **derrière** le personnage, du côté de la traîne : la veine part
vers la base et ne doit pas croiser le devant du modèle. Elle passe **sous** la
route (§9) — le plateau ayant maintenant une vraie hauteur, la veine se dessine
à `groundHeightAt(x,y) - 0.5` sous une tuile de route et remonte ailleurs.

Ni l'un ni l'autre n'agrandit le footprint : ce sont des décalques, pas des
volumes de collision.

---

## 5. Les états du rayon, et leur nommage

Le lot rayon (L3) livre **exactement** ces états, sous ces noms :

| nom | quand | ce qu'il doit dire |
|---|---|---|
| `thread` | base, aucun ramp | fil pâle, fin, régulier. Faible et assumé |
| `ramp` | pendant le verrouillage | s'épaissit **en continu**, texture fil → corde torsadée |
| `saturated` | plafond du ramp | état clairement AUTRE, pas juste plus gros |
| `seeking` | cible morte, avant raccrochage | détaché, retombé, il balaie et tâtonne |
| `gold` | voie A | ambre → or franc, opaque et dense, grains qui remontent |
| `column` | A5 | ce n'est plus un rayon, c'est une colonne |
| `tendon` | voie B | matière translucide, nerveuse, courbure lente de câble |
| `chain` | voie B, cibles multiples | **rebondit** d'ennemi en ennemi, ne se dédouble pas à la source |

**Le sens du flux est porté par la matière**, jamais par une flèche (§8) : les
quatre moyens autorisés sont les particules qui grossissent vers la tour, la
texture qui défile vers la tour, les chevrons orientés vers la tour et le
renflement côté tour. Le lot L3 doit en combiner au moins deux dès `thread`.

Un rayon secondaire porte la couleur de **la voie qui l'a accordé** (§7), pas de
la voie principale.

---

## 6. Ce qui n'a AUCUN effet visuel

Repris ici pour qu'aucun lot ne l'ajoute « par gentillesse » : `def_pierce`
(A1), l'exécution, les impacts individuels, et le ralentissement côté rayon ou
interface. Le ralentissement se lit **uniquement** sur l'ennemi.

---

## 7. Le modèle Siphon actuel doit être REFAIT, pas étendu

Les cinq `siphon-*.js` construits plus tôt dans cette session violent le §2 de
façon directe : la robe est un `td.frustum`, c'est-à-dire précisément une
surface de révolution. Elle passerait le test des 360° en donnant la même
silhouette à tous les angles.

Ils étaient bâtis sur une autre lecture du personnage (un moissonneur/mage avec
un focus). Ce brief décrit autre chose : un homme voilé qui aspire à mains nues.
Le travail est à reprendre depuis la silhouette, pas à corriger.

---

## 8. Parallélisation : ce que j'ai vérifié

Les onglets multiples **ne marchent pas** dans ce panneau : un second onglet
s'ouvre puis reste sur `about:blank` après navigation (testé deux fois). Il y a
un seul jeu vivant, donc **l'observation et les revues restent sérielles**.

Ce qui se parallélise réellement, c'est l'**écriture** : les lots L1 à L6 du §14
sont des fichiers Python indépendants, un agent par lot, chacun propriétaire de
son fichier. C'est exactement ce qui a marché pour l'Invocateur (4 agents, 46
modèles, une passe de critique qui a trouvé 4 vrais défauts).

**L1 et L2 ne peuvent pas démarrer avant que ce socle soit validé**, et les
marques de crosspath, la jauge Midas et l'intégration rayon/personnage sont des
points de synchronisation qui exigent L1/L2/L3 terminés (§14).
