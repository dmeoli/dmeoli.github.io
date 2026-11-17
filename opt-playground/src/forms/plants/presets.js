// The plants of the menu, with their rules as in The Algorithmic Beauty of
// Plants (ABOP), and the angle, steps and tropism of each; where the book
// draws a plant in the plane, a roll / has been added so that it grows in
// space, and the change is said in the note.

export const presets = {
  shrub: {
    en: 'Stochastic shrub (after ABOP section 1.7)', it: 'Arbusto stocastico (da ABOP sezione 1.7)',
    n: 8, delta: 28, tropism: -0.08, exp: 3, tip: 0.7, seed: 3, pose: 'up',
    text: `#define d 137.5
axiom: A
A ->(.4) F(1)[&A]/(d)[&A]/(d)A
A ->(.35) F(1)[&A]/(d)A
A ->(.25) F(1)A
F(l) -> F(l*1.25)`,
    note: {
      en: 'Each apex A is rewritten by one of three productions chosen at random with probabilities 0.4, 0.35 and 0.25 (two lateral shoots, one, or none), as the stochastic L-systems of section 1.7 of the book, so that every seed gives a different shrub of the same kind; each new shoot is rolled by 137.5 degrees from the last, every internode grows by 1.25 per step, and a slight upward tropism keeps the shrub standing.',
      it: "Ogni apice A è riscritto da una di tre produzioni scelta a caso con probabilità 0.4, 0.35 e 0.25 (due germogli laterali, uno o nessuno), come i sistemi L stocastici della sezione 1.7 del libro, sicché ogni seme dà un arbusto diverso della stessa specie; ogni nuovo germoglio è ruotato di 137.5 gradi rispetto al precedente, ogni internodo cresce di 1.25 a ogni passo, e un leggero tropismo verso l'alto tiene l'arbusto in piedi.",
    },
  },
  ternary: {
    en: 'Ternary tree (ABOP Fig. 2.8a)', it: 'Albero ternario (ABOP Fig. 2.8a)',
    n: 6, delta: 18.95, tropism: 0.22, exp: 3, tip: 0.7, seed: 1, pose: 'up',
    text: `#define d1 94.74
#define d2 132.63
#define lr 1.109
#define vr 1.732
axiom: !(1)F(200)/(45)A
A -> !(vr)F(50)[&F(50)A]/(d1)[&F(50)A]/(d2)[&F(50)A]
F(l) -> F(l*lr)
!(w) -> !(w*vr)`,
    note: {
      en: 'Every apex A puts out three branches, each pitched by the angle from the axis and rolled by 94.74 and 132.63 degrees from the one before, while every internode grows by 1.109 per step, so that the old wood is longer than the young; gravity (the tropism e = 0.22 of the book) bends the branches down, and a negative e, as for shoots that grow towards the light, closes the crown into an upright cone. The widths !(w) of the book grow by the square root of 3 per step, which is the rule of Leonardo for three branches of equal weight, and the drawing follows it.',
      it: 'Ogni apice A mette tre rami, ciascuno inclinato dell\'angolo rispetto all\'asse e ruotato di 94.74 e 132.63 gradi rispetto al precedente, mentre ogni internodo cresce di 1.109 a ogni passo, sicché il legno vecchio è più lungo del giovane; la gravità (il tropismo e = 0.22 del libro) piega i rami verso il basso, e un e negativo, come per i germogli che crescono verso la luce, chiude la chioma in un cono eretto. Le larghezze !(w) del libro crescono della radice di 3 a ogni passo, che è la regola di Leonardo per tre rami di peso uguale, e il disegno la segue.',
    },
  },
  monopodial: {
    en: 'Monopodial tree, Honda (ABOP Fig. 2.6)', it: 'Albero monopodiale, Honda (ABOP Fig. 2.6)',
    n: 10, delta: 45, tropism: 0, exp: 3, tip: 0.7, seed: 1, pose: 'up',
    text: `#define r1 0.9
#define r2 0.6
#define d 137.5
#define wr 0.707
axiom: A(1,10)
A(l,w) -> !(w)F(l)[&B(l*r2,w*wr)]/(d)A(l*r1,w*wr)
B(l,w) -> !(w)F(l)[-$C(l*r2,w*wr)]C(l*r1,w*wr)
C(l,w) -> !(w)F(l)[+$B(l*r2,w*wr)]B(l*r1,w*wr)`,
    note: {
      en: 'Honda (1971) modelled trees with a main axis that keeps growing (monopodial): the trunk A shortens by r1 = 0.9 at every node and puts out a lateral branch B, rolled by the divergence angle 137.5 degrees from the last one, which in turn branches to the left and to the right, alternately, in a plane kept horizontal by $. The branches leave the trunk at the angle of the slider, 45 degrees in the book.',
      it: 'Honda (1971) ha modellato alberi con un asse principale che continua a crescere (monopodiali): il tronco A si accorcia di r1 = 0.9 a ogni nodo e mette un ramo laterale B, ruotato dell\'angolo di divergenza di 137.5 gradi rispetto al precedente, che a sua volta si ramifica a sinistra e a destra, alternatamente, in un piano tenuto orizzontale da $. I rami lasciano il tronco all\'angolo del cursore, 45 gradi nel libro.',
    },
  },
  sympodial: {
    en: 'Sympodial tree, Aono and Kunii (ABOP Fig. 2.7)', it: 'Albero simpodiale, Aono e Kunii (ABOP Fig. 2.7)',
    n: 10, delta: 30, tropism: 0, exp: 3, tip: 0.7, seed: 1, pose: 'up',
    text: `#define r1 0.9
#define r2 0.7
#define a1 10
#define wr 0.707
axiom: A(1,10)
A(l,w) -> !(w)F(l)[&(a1)B(l*r1,w*wr)]/(180)[&(delta)B(l*r2,w*wr)]
B(l,w) -> !(w)F(l)[+(a1)$B(l*r1,w*wr)][-(delta)$B(l*r2,w*wr)]`,
    note: {
      en: 'In a sympodial tree no axis goes on: every apex ends in a fork of two branches, a longer one deviating by a1 = 10 degrees and a shorter one by the angle of the slider (the trees of Aono and Kunii, 1984, as written in the book with the second angle from 50 to 65 degrees), so that the crown is a fan of forks; the smaller the second angle, the closer the tree is to a column.',
      it: 'In un albero simpodiale nessun asse prosegue: ogni apice finisce in una forcella di due rami, uno più lungo che devia di a1 = 10 gradi e uno più corto che devia dell\'angolo del cursore (gli alberi di Aono e Kunii, 1984, come nel libro con il secondo angolo da 50 a 65 gradi), sicché la chioma è un ventaglio di forcelle; più piccolo è il secondo angolo, più l\'albero si avvicina a una colonna.',
    },
  },
  bush: {
    en: 'Bush with leaves (ABOP Fig. 1.25)', it: 'Cespuglio con foglie (ABOP Fig. 1.25)',
    n: 7, delta: 22.5, tropism: 0, exp: 3, tip: 0.7, seed: 1, pose: 'up',
    text: `axiom: A
A -> [&FL!A]/////'[&FL!A]///////'[&FL!A]
F -> S/////F
S -> FL
L -> ['''^^{-f+f+f-|-f+f+f}]`,
    note: {
      en: 'The three-dimensional bush of the book: the apex A gives three shoots rolled apart by five and seven turns of 22.5 degrees, every internode F leaves behind a segment S that carries a leaf L, and the leaf is a polygon traced by the moves f between { and }; the leaves are drawn here and left out of the printed solid.',
      it: 'Il cespuglio tridimensionale del libro: l\'apice A dà tre germogli separati da cinque e da sette rotazioni di 22.5 gradi, ogni internodo F si lascia dietro un segmento S che porta una foglia L, e la foglia è un poligono tracciato dalle mosse f fra { e }; le foglie sono disegnate qui e lasciate fuori dal solido da stampare.',
    },
  },
  fern: {
    en: 'Fractal plant (ABOP Fig. 1.24f)', it: 'Pianta frattale (ABOP Fig. 1.24f)',
    n: 5, delta: 22.5, tropism: 0, exp: 3, tip: 0.6, seed: 1, pose: 'flat',
    text: `axiom: X
X -> F-[[X]+X]+F[+FX]-X
F -> FF`,
    note: {
      en: 'A plant in the plane, the last of Fig. 1.24: the apex X, which draws nothing, grows a stem F with branches to both sides, and every F doubles at each step. It lies in a plane, so it is printed lying flat, as a pressed specimen in a herbarium, without supports; standing up, its side branches would need them.',
      it: 'Una pianta nel piano, l\'ultima della Fig. 1.24: l\'apice X, che non disegna nulla, fa crescere uno stelo F con rami ai due lati, e ogni F raddoppia a ogni passo. Sta in un piano, quindi si stampa distesa, come un esemplare pressato in un erbario, senza supporti; in piedi, i rami laterali ne richiederebbero.',
    },
  },
};
