// ==================================================
// GEOMETRIA DOS ELEMENTOS DE JOGO
// --------------------------------------------------
// Malhas simples (low poly) para os objetos que participam da
// jogabilidade: tiros do jogador, naves inimigas, anéis de bônus
// (coletáveis) e o "flash" de explosão. Todas usam o MeshBuilder
// definido em arwingGeometry.js e devolvem o mesmo formato de malha
// consumido por createSceneObject() em main.js.
// ==================================================

// --------------------------------------------------
// TIRO DO JOGADOR (laser) — pequeno losango alongado em Z.
// O nariz da nave aponta para -Z, então o tiro é alongado nesse eixo.
// --------------------------------------------------
function createLaser() {
    const mb = new MeshBuilder();
    const cor = [0.30, 1.00, 0.45];   // verde brilhante (domina via cor de vértice)

    const r = 0.14;   // raio (largura/altura)
    const c = 1.1;    // metade do comprimento em Z

    const frente = [0, 0, -c];
    const tras   = [0, 0,  c];
    const d = [
        [ r,  0, 0],
        [ 0,  r, 0],
        [-r,  0, 0],
        [ 0, -r, 0],
    ];

    for (let i = 0; i < 4; i++) {
        const a = d[i];
        const b = d[(i + 1) % 4];
        mb.tri(frente, a, b, cor);   // bico da frente
        mb.tri(tras,   b, a, cor);   // bico de trás
    }

    return mb.build();
}

// --------------------------------------------------
// NAVE INIMIGA — caça hostil low-poly (corpo + asas em flecha + aletas).
// Segue a convenção de eixos do projeto: nariz para -Z, topo +Y, asas ±X.
// Cores de alerta (vermelho/laranja) para ficar claro que é um alvo.
// Dimensionado para caber em um raio de colisão de ~1.0 (GAME_CONFIG.raioInimigo).
// --------------------------------------------------
function createEnemy() {
    const mb = new MeshBuilder();

    const corpo   = [0.85, 0.20, 0.22];   // vermelho (hostil)
    const corpoEsc = [0.52, 0.11, 0.13];  // vermelho escuro (traseira/baixo)
    const asa     = [0.70, 0.16, 0.18];   // asas em tom de vermelho
    const alerta  = [1.00, 0.45, 0.12];   // laranja de alerta (aletas/detalhe)

    // ---------- FUSELAGEM ----------
    // Nariz pontudo em -Z; corpo se alarga até a traseira em +Z.
    const N = [ 0.00,  0.00, -1.00];   // nariz (ponta)
    const U = [ 0.00,  0.30,  0.55];   // topo (traseira)
    const D = [ 0.00, -0.26,  0.55];   // baixo (traseira)
    const L = [-0.42,  0.00,  0.55];   // traseira esquerda
    const R = [ 0.42,  0.00,  0.55];   // traseira direita

    // bico da frente (quatro faces convergindo no nariz)
    mb.tri(N, U, R, corpo);      // cima-direita
    mb.tri(N, L, U, corpo);      // cima-esquerda
    mb.tri(N, R, D, corpoEsc);   // baixo-direita
    mb.tri(N, D, L, corpoEsc);   // baixo-esquerda

    // traseira (tampa do motor), em laranja de alerta
    mb.tri(U, L, D, alerta);
    mb.tri(U, D, R, alerta);

    // ---------- ASAS EM FLECHA (varridas para trás) ----------
    // Cada asa parte da raiz na fuselagem e se abre em ±X, recuando em +Z.
    function asaInimiga(lado) {
        const raizF = [lado * 0.30,  0.00, -0.10];   // raiz frente
        const raizT = [lado * 0.30,  0.00,  0.45];   // raiz trás
        const ponta = [lado * 1.05, -0.08,  0.70];   // ponta da asa (recuada)

        // duas faces (topo e base) para a asa ser visível dos dois lados
        mb.tri(raizF, raizT, ponta, asa);
        mb.tri(raizF, ponta, raizT, asa);
    }
    asaInimiga(-1);
    asaInimiga( 1);

    // ---------- ALETAS VERTICAIS (duas, cor de alerta) ----------
    // Pequenas aletas na traseira, inclinadas, reforçando a silhueta de caça.
    function aletaInimiga(lado) {
        const baseF  = [lado * 0.14, 0.05,  0.30];
        const baseT  = [lado * 0.14, 0.05,  0.55];
        const topo   = [lado * 0.22, 0.55,  0.55];

        mb.tri(baseF, baseT, topo, alerta);
        mb.tri(baseF, topo, baseT, alerta);
    }
    aletaInimiga(-1);
    aletaInimiga( 1);

    return mb.build();
}

// --------------------------------------------------
// ANEL DE BÔNUS (coletável) — anel dourado feito de segmentos.
// Atravessar o anel soma pontos. Construído como um "tubo" circular.
// --------------------------------------------------
function createRing() {
    const mb = new MeshBuilder();
    const cor = [1.00, 0.84, 0.25];   // dourado

    const R = 1.4;    // raio do anel
    const r = 0.18;   // espessura do tubo
    const seg = 18;   // segmentos ao redor

    for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;

        // quatro pontos da seção do tubo (quadrado girado ao redor do anel)
        const p = (ang, off) => [
            (R + off[0]) * Math.cos(ang),
            off[1],
            (R + off[0]) * Math.sin(ang)
        ];

        const outer0 = p(a0, [ r, 0]);
        const inner0 = p(a0, [-r, 0]);
        const up0    = p(a0, [0,  r]);
        const dn0    = p(a0, [0, -r]);

        const outer1 = p(a1, [ r, 0]);
        const inner1 = p(a1, [-r, 0]);
        const up1    = p(a1, [0,  r]);
        const dn1    = p(a1, [0, -r]);

        // casca externa
        mb.tri(outer0, up0, up1, cor);   mb.tri(outer0, up1, outer1, cor);
        mb.tri(up0, inner0, inner1, cor); mb.tri(up0, inner1, up1, cor);
        mb.tri(inner0, dn0, dn1, cor);   mb.tri(inner0, dn1, inner1, cor);
        mb.tri(dn0, outer0, outer1, cor); mb.tri(dn0, outer1, dn1, cor);
    }

    return mb.build();
}

// --------------------------------------------------
// FLASH DE EXPLOSÃO — uma pequena estrela/ouriço que aparece
// rapidamente quando um inimigo é destruído. Cor laranja.
// --------------------------------------------------
function createExplosion() {
    const mb = new MeshBuilder();
    const cor = [1.00, 0.55, 0.12];

    const s = 1.0;
    const pontas = [
        [ s, 0, 0], [-s, 0, 0],
        [0,  s, 0], [0, -s, 0],
        [0, 0,  s], [0, 0, -s],
    ];
    const n = 0.28;   // tamanho do núcleo

    for (const pt of pontas) {
        mb.tri([ n, 0, 0], [0, n, 0], pt, cor);
        mb.tri([0, n, 0], [-n, 0, 0], pt, cor);
        mb.tri([-n, 0, 0], [0, -n, 0], pt, cor);
        mb.tri([0, -n, 0], [ n, 0, 0], pt, cor);
    }

    return mb.build();
}

// --------------------------------------------------
// PRÉDIO (bloco unitário) — caixa 1x1x1 com a BASE em y=0 e o TOPO em y=1,
// X e Z em [-0.5, 0.5]. Em main.js cada prédio é escalado por (w, h, d) e
// posicionado por (x, z), reaproveitando esta mesma malha.
//
// As quatro fachadas recebem UV com repetição vertical (janelas em andares)
// usando a textura building.png. O topo usa um canto liso (concreto).
// --------------------------------------------------
function createBuildingBlock() {
    const mb = new MeshBuilder();
    const corFachada = [0.95, 0.98, 1.00];   // a cor real vem por instância (tint), aqui fica neutra
    const corTopo    = [0.30, 0.45, 0.56];

    const x0 = -0.5, x1 = 0.5;
    const z0 = -0.5, z1 = 0.5;
    const y0 = 0.0,  y1 = 1.0;

    const andares = 4;   // quantas vezes a textura de janelas repete na altura

    // cantos (frente = z1, fundo = z0)
    const A = [x0, y0, z1], B = [x1, y0, z1], C = [x1, y1, z1], D = [x0, y1, z1]; // frente
    const E = [x1, y0, z0], F = [x0, y0, z0], G = [x0, y1, z0], H = [x1, y1, z0]; // fundo

    const facade = (a, b, c, d, cor) => {
        mb.tri(a, b, c, cor, [0, 0], [1, 0], [1, andares]);
        mb.tri(a, c, d, cor, [0, 0], [1, andares], [0, andares]);
    };

    facade(A, B, C, D, corFachada);                         // frente (+Z)
    facade(E, F, G, H, corFachada);                         // fundo (-Z)
    facade(F, A, D, G, corFachada);                         // lateral esquerda (-X)
    facade(B, E, H, C, corFachada);                         // lateral direita (+X)

    // topo (concreto liso, canto da textura)
    const liso = [[0.02, 0.02], [0.18, 0.02], [0.18, 0.18], [0.02, 0.18]];
    mb.tri(D, C, H, corTopo, liso[0], liso[1], liso[2]);
    mb.tri(D, H, G, corTopo, liso[0], liso[2], liso[3]);

    return mb.build();
}

