// ==================================================
// LÓGICA DE JOGO - STAR FOX (Corneria)
// --------------------------------------------------
// Este módulo concentra TODA a jogabilidade, mantendo a parte de
// renderização (main.js) separada das regras do jogo:
//
//   - Movimentação e controles do jogador (teclado)
//   - Ações: disparar laser e impulso/desvio (boost)
//   - Inimigos e coletáveis (anéis de bônus) com spawn ao longo do tempo
//   - Detecção de colisão (esfera-esfera) e suas consequências
//   - Sistema de pontuação
//   - Condições de vitória/derrota, fim de jogo e reinício
//
// O objeto global `Game` expõe o estado consumido por main.js para
// desenhar a cena (posição da nave, listas de tiros/inimigos/anéis,
// pontuação, vidas, fase do jogo etc.).
// ==================================================

const GAME_CONFIG = {
    // --- objetivo / condições de fim ---
    pontuacaoVitoria: 1500,   // pontos para VENCER
    vidasIniciais: 3,         // quantas colisões o jogador aguenta

    // --- movimentação do jogador ---
    velocidadeLateral: 9.0,   // unidades/seg no eixo X
    velocidadeVertical: 6.0,  // unidades/seg no eixo Y
    limiteX: 7.0,             // quão longe a nave pode ir para os lados
    alturaMin: 1.2,
    alturaMax: 8.5,

    // --- ação: tiro ---
    velocidadeTiro: 55.0,     // unidades/seg (viaja em -Z)
    cadenciaTiro: 0.18,       // intervalo mínimo entre tiros (seg)
    alcanceTiro: 70.0,        // distância máxima antes de sumir

    // --- ação: boost/desvio (temporário: só giro + invulnerabilidade) ---
    boostDuracao: 0.5,              // duração do giro de esquiva (seg)
    boostCooldown: 1.2,             // tempo para poder girar de novo
    boostMundoMultiplicador: 1.6,   // aceleração visual do cenário durante o boost


    // --- mundo rolando (sensação de velocidade) ---
    // A nave fica praticamente parada em Z; o CENÁRIO rola em direção a ela.
    // Isso dá a sensação de voo para frente em velocidade fixa.
    velocidadeMundo: 22.0,          // unidades/seg que o cenário "desce" (em +Z)

    // --- prédios (cenário que também é obstáculo) ---
    predioSpawnZ: -80.0,            // onde um prédio reaparece ao reciclar
    predioDespawnZ: 20.0,           // ao passar disso, recicla para a frente
    faixaVoo: 6.0,                  // meia-largura do corredor livre no centro
    pontosPorPredioEvitado: 0,      // (sem bônus; são só obstáculos)

    // --- inimigos ---
    inimigoVelocidade: 18.0,  // velocidade com que avançam (em +Z, em direção ao jogador)
    inimigoSpawnZ: -70.0,     // onde nascem (à frente)
    inimigoDespawnZ: 14.0,    // passou da nave: escapou
    intervaloSpawnInimigo: 1.15,
    pontosPorInimigo: 100,

    // --- coletáveis (anéis) ---
    anelSpawnZ: -70.0,
    anelDespawnZ: 14.0,
    anelVelocidade: 16.0,
    intervaloSpawnAnel: 3.4,
    pontosPorAnel: 75,

    // --- colisões (raios das esferas de colisão) ---
    raioNave: 1.2,
    raioInimigo: 1.0,
    raioTiro: 0.4,
    raioAnel: 1.5,

    // penalidade: inimigo que escapa sem ser destruído
    penalidadeEscape: 25,

    // margem extra de colisão da nave com prédios (além do raio da nave)
    margemPredio: 0.2,
};

// Fases possíveis do jogo
const FASE = {
    PRONTO:   "pronto",    // tela inicial, aguardando começar
    JOGANDO:  "jogando",
    VITORIA:  "vitoria",
    DERROTA:  "derrota",
};

const Game = {
    config: GAME_CONFIG,
    FASE,

    fase: FASE.PRONTO,

    // --- estado do jogador ---
    nave: { x: 0, y: 3.2, z: 0, rollAlvo: 0, roll: 0, pitch: 0 },
    pontuacao: 0,
    vidas: GAME_CONFIG.vidasIniciais,
    recorde: 0,

    // --- entradas ---
    teclas: {},                 // mapa de teclas pressionadas
    tempoUltimoTiro: -999,
    boostInicioEm: -999,
    boostAtivoAte: 0,
    boostLiberadoEm: 0,

    // --- entidades ---
    tiros: [],        // { x, y, z }
    inimigos: [],     // { x, y, z, vivo }
    aneis: [],        // { x, y, z, girar, coletado }
    explosoes: [],    // { x, y, z, t, duracao }
    predios: [],      // { x, z, w, h, d, tipo, cor, lado } — cenário/obstáculo

    // --- mundo rolando ---
    mundoScroll: 0,   // distância acumulada que o cenário "desceu" (para rolar a textura do chão/pista)
    invulnDano: 0,    // janela curta de invulnerabilidade após tomar dano (evita perder várias vidas de uma vez)

    // --- controle de spawn / tempo ---
    tempo: 0,
    tempoProxInimigo: 0,
    tempoProxAnel: 0,

    // estatísticas (para o resumo de fim de jogo)
    stats: { destruidos: 0, coletados: 0, escaparam: 0, tiros: 0 },

    // callback opcional disparado quando a fase muda (para atualizar HUD/telas)
    onFaseMudou: null,
};

// ==================================================
// ENTRADA (teclado) — registra o estado das teclas.
// As teclas de CÂMERA e LUZES continuam sendo tratadas em main.js;
// aqui só cuidamos das teclas de JOGO.
// ==================================================

function registrarEntradasDeJogo() {

    window.addEventListener("keydown", (e) => {
        Game.teclas[e.code] = true;

        // Enter / R: começar ou reiniciar a partida conforme a fase
        if (e.code === "Enter" || e.code === "KeyR") {
            if (Game.fase === FASE.PRONTO) {
                iniciarPartida();
            } else if (Game.fase === FASE.VITORIA || Game.fase === FASE.DERROTA) {
                reiniciarPartida();
            }
        }

        // evita a página rolar com as setas/espaço durante o jogo
        if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","KeyW","KeyA","KeyS","KeyD","KeyJ","ShiftLeft"].includes(e.code)) {
            e.preventDefault();
        }
    });

    window.addEventListener("keyup", (e) => {
        Game.teclas[e.code] = false;
    });
}

// ==================================================
// CONTROLE DE FASE
// ==================================================

function mudarFase(novaFase) {
    Game.fase = novaFase;
    if (typeof Game.onFaseMudou === "function") {
        Game.onFaseMudou(novaFase);
    }
}

function iniciarPartida() {
    resetarEstado();
    mudarFase(FASE.JOGANDO);
}

function reiniciarPartida() {
    resetarEstado();
    mudarFase(FASE.JOGANDO);
}

function resetarEstado() {
    const c = Game.config;
    Game.nave = { x: 0, y: 3.2, z: 0, rollAlvo: 0, roll: 0, pitch: 0 };
    Game.pontuacao = 0;
    Game.vidas = c.vidasIniciais;
    Game.tiros = [];
    Game.inimigos = [];
    Game.aneis = [];
    Game.explosoes = [];
    Game.tempo = 0;
    Game.mundoScroll = 0;
    Game.invulnDano = 0;
    Game.tempoUltimoTiro = -999;
    Game.boostInicioEm = -999;
    Game.boostAtivoAte = 0;
    Game.boostLiberadoEm = 0;
    Game.tempoProxInimigo = 0.8;
    Game.tempoProxAnel = 2.0;
    Game.stats = { destruidos: 0, coletados: 0, escaparam: 0, tiros: 0 };
    inicializarPredios();
}

// ==================================================
// PRÉDIOS (cenário + obstáculo)
// --------------------------------------------------
// Geramos fileiras de prédios dos dois lados do corredor de voo e também
// alguns no meio, como obstáculos. Cada prédio tem tipo/forma/cor variados.
// Eles rolam em +Z (em direção à nave) e, ao passar da nave, são
// RECICLADOS para a frente (-Z) com novos atributos — isso dá um cenário
// "infinito" sem gastar memória (mesma malha, só muda a matriz).
// ==================================================

// tipos de construção (variação visual e de tamanho)
const PREDIO_TIPOS = [
    { nome: "torre",    w: 1.6, h: 11.0, d: 1.6 },   // torre alta e fina
    { nome: "bloco",    w: 3.2, h: 5.5,  d: 2.8 },   // bloco largo e baixo
    { nome: "zigurate", w: 2.6, h: 8.0,  d: 2.6 },   // escalonado
    { nome: "arranha",  w: 2.0, h: 14.0, d: 2.0 },   // arranha-céu bem alto
];

const PREDIO_CORES = [
    [0.48, 0.62, 0.67],
    [0.45, 0.59, 0.65],
    [0.40, 0.55, 0.62],
    [0.52, 0.60, 0.70],
    [0.36, 0.50, 0.58],
];

// Gera um prédio aleatório numa posição Z dada. `forcarLado`:
//  -1 = lado esquerdo, +1 = lado direito, 0 = pode cair no meio (obstáculo).
function gerarPredio(z, forcarLado) {
    const c = Game.config;
    const cor  = PREDIO_CORES[Math.floor(Math.random() * PREDIO_CORES.length)];

    let lado = forcarLado;
    if (lado === 0) {
        // 75% nas laterais (cenário), 25% no meio (obstáculo de verdade)
        const r = Math.random();
        lado = (r < 0.375) ? -1 : (r < 0.75 ? 1 : 0);
    }

    // Obstáculos no MEIO do corredor usam só tipos baixos/médios, para que
    // o jogador consiga passar por cima ou desviar pelos lados (justo).
    // Nas laterais, qualquer tipo (inclusive arranha-céus altos).
    let tipo;
    if (lado === 0) {
        const baixos = PREDIO_TIPOS.filter(t => t.h <= 8.5);
        tipo = baixos[Math.floor(Math.random() * baixos.length)];
    } else {
        tipo = PREDIO_TIPOS[Math.floor(Math.random() * PREDIO_TIPOS.length)];
    }

    let x;
    if (lado === 0) {
        // obstáculo dentro do corredor de voo (deixa folga nas bordas)
        x = (Math.random() * 2 - 1) * (c.faixaVoo - 2.0);
    } else {
        // nas laterais, logo após a borda do corredor
        const dist = c.faixaVoo + 1.5 + Math.random() * 6.0;
        x = lado * dist;
    }

    return {
        x, z,
        w: tipo.w, h: tipo.h, d: tipo.d,
        tipo: tipo.nome,
        cor,
        lado,
        atingido: false,   // marca para não tirar vida duas vezes do mesmo prédio
    };
}

function inicializarPredios() {
    const c = Game.config;
    Game.predios = [];
    // distribui prédios ao longo do corredor, da frente até um pouco atrás.
    // Espaçamento maior (10 em 10) + menos laterais = cenário mais limpo.
    for (let z = c.predioSpawnZ; z < c.predioDespawnZ; z += 10) {
        // zona segura inicial perto da nave (z > -25): só cenário lateral,
        // nada de obstáculo no meio, para o jogador ter tempo de reagir.
        const perto = z > -25;
        Game.predios.push(gerarPredio(z, perto ? (Math.random() < 0.5 ? -1 : 1) : 0));
        // às vezes acrescenta UMA construção lateral entre os passos
        if (Math.random() < 0.35) {
            Game.predios.push(gerarPredio(z + 5, Math.random() < 0.5 ? -1 : 1));
        }
    }
}


// ==================================================
// AÇÕES DO JOGADOR
// ==================================================

function tentarAtirar() {
    const c = Game.config;
    if (Game.tempo - Game.tempoUltimoTiro < c.cadenciaTiro) return;

    Game.tempoUltimoTiro = Game.tempo;
    Game.stats.tiros++;

    // dois tiros, um de cada asa (visual mais próximo do Star Fox)
    const n = Game.nave;
    Game.tiros.push({ x: n.x - 0.9, y: n.y, z: n.z - 1.5 });
    Game.tiros.push({ x: n.x + 0.9, y: n.y, z: n.z - 1.5 });
}

function boostDisponivel() {
    return Game.tempo >= Game.boostLiberadoEm;
}

function tentarBoost() {
    if (!boostDisponivel()) return;
    const c = Game.config;
    Game.boostInicioEm  = Game.tempo;                  // marca o início (para o giro)
    Game.boostAtivoAte  = Game.tempo + c.boostDuracao;
    Game.boostLiberadoEm = Game.tempo + c.boostCooldown;
}

function boostAtivo() {
    return Game.tempo < Game.boostAtivoAte;
}

// Progresso do giro de esquiva (barrel roll): 0 no início do boost, 1 ao fim.
// Fora do boost, retorna 0 (sem giro). Usado por main.js para rodar a nave.
function boostGiroProgresso() {
    if (!boostAtivo()) return 0;
    const c = Game.config;
    const t = (Game.tempo - Game.boostInicioEm) / c.boostDuracao;
    return Math.max(0, Math.min(1, t));
}


// ==================================================
// SPAWN DE ENTIDADES
// ==================================================

function spawnInimigo() {
    const c = Game.config;
    const x = (Math.random() * 2 - 1) * (c.limiteX - 0.5);
    const y = c.alturaMin + Math.random() * (c.alturaMax - c.alturaMin);
    Game.inimigos.push({ x, y, z: c.inimigoSpawnZ, vivo: true, fase: Math.random() * 6.28 });
}

function spawnAnel() {
    const c = Game.config;
    const x = (Math.random() * 2 - 1) * (c.limiteX - 1.0);
    const y = c.alturaMin + 1.0 + Math.random() * (c.alturaMax - c.alturaMin - 2.0);
    Game.aneis.push({ x, y, z: c.anelSpawnZ, girar: Math.random() * 6.28, coletado: false });
}

// ==================================================
// COLISÃO (esfera-esfera)
// ==================================================

function colide(ax, ay, az, ar, bx, by, bz, br) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    const soma = ar + br;
    return (dx*dx + dy*dy + dz*dz) <= (soma * soma);
}

// ==================================================
// ATUALIZAÇÃO POR QUADRO (chamada por main.js no loop)
//   dt = tempo decorrido em segundos
// ==================================================

function atualizarJogo(dt) {

    if (Game.fase !== FASE.JOGANDO) {
        // mesmo parado, mantém um leve embalo visual na nave
        Game.nave.roll += (0 - Game.nave.roll) * 0.1;
        return;
    }

    const c = Game.config;
    Game.tempo += dt;
    if (Game.invulnDano > 0) Game.invulnDano -= dt;

    atualizarMundo(dt);
    atualizarMovimentoJogador(dt);
    atualizarAcoes();
    atualizarTiros(dt);
    atualizarSpawns(dt);
    atualizarInimigos(dt);
    atualizarAneis(dt);
    atualizarPredios(dt);
    atualizarExplosoes(dt);
    resolverColisoes();
    verificarFimDeJogo();
}

// ---- mundo rolando (velocidade fixa; boost acelera) ----
function velocidadeMundoAtual() {
    const c = Game.config;
    return c.velocidadeMundo * (boostAtivo() ? c.boostMundoMultiplicador : 1.0);
}

function atualizarMundo(dt) {
    // acumula o quanto o cenário desceu — usado para rolar a textura do chão
    Game.mundoScroll += velocidadeMundoAtual() * dt;
}

// ---- movimentação do jogador ----
function atualizarMovimentoJogador(dt) {
    const c = Game.config;
    const n = Game.nave;
    const t = Game.teclas;

    let dirX = 0, dirY = 0;
    if (t["ArrowLeft"]  || t["KeyA"]) dirX -= 1;
    if (t["ArrowRight"] || t["KeyD"]) dirX += 1;
    if (t["ArrowUp"]    || t["KeyW"]) dirY += 1;
    if (t["ArrowDown"]  || t["KeyS"]) dirY -= 1;

    // O boost NÃO dá mais ganho de deslocamento lateral (não "teleporta" a
    // nave para o lado). É só um efeito temporário: giro de esquiva +
    // invulnerabilidade + aceleração visual do cenário. Movimento lateral
    // mantém a velocidade normal.
    n.x += dirX * c.velocidadeLateral * dt;
    n.y += dirY * c.velocidadeVertical * dt;

    // mantém dentro dos limites do "corredor"
    n.x = Math.max(-c.limiteX, Math.min(c.limiteX, n.x));
    n.y = Math.max(c.alturaMin, Math.min(c.alturaMax, n.y));

    // inclinação (roll) acompanha o movimento lateral; pitch acompanha o vertical
    n.rollAlvo = -dirX * 0.5;
    n.roll  += (n.rollAlvo - n.roll) * Math.min(1, dt * 10);
    n.pitch += ((dirY * 0.18) - n.pitch) * Math.min(1, dt * 8);
}

// ---- ações (tiro e boost) ----
function atualizarAcoes() {
    const t = Game.teclas;
    if (t["Space"] || t["KeyJ"]) tentarAtirar();
    if (t["ShiftLeft"] || t["ShiftRight"]) tentarBoost();
}

// ---- tiros ----
function atualizarTiros(dt) {
    const c = Game.config;
    for (const tiro of Game.tiros) {
        tiro.z -= c.velocidadeTiro * dt;
    }
    // remove tiros fora de alcance
    Game.tiros = Game.tiros.filter(tiro => tiro.z > -c.alcanceTiro);
}

// ---- spawns ----
function atualizarSpawns(dt) {
    const c = Game.config;

    Game.tempoProxInimigo -= dt;
    if (Game.tempoProxInimigo <= 0) {
        spawnInimigo();
        // acelera um pouco conforme a pontuação sobe (dificuldade progressiva)
        const fator = Math.max(0.55, 1 - Game.pontuacao / 4000);
        Game.tempoProxInimigo = c.intervaloSpawnInimigo * fator;
    }

    Game.tempoProxAnel -= dt;
    if (Game.tempoProxAnel <= 0) {
        spawnAnel();
        Game.tempoProxAnel = c.intervaloSpawnAnel;
    }
}

// ---- inimigos ----
function atualizarInimigos(dt) {
    const c = Game.config;
    for (const e of Game.inimigos) {
        e.z += c.inimigoVelocidade * dt;
        // leve zigue-zague para dificultar a mira
        e.x += Math.sin(Game.tempo * 2 + e.fase) * 0.8 * dt;
    }

    // inimigos que passaram da nave sem serem destruídos = escaparam (penalidade)
    Game.inimigos = Game.inimigos.filter(e => {
        if (e.vivo && e.z > c.inimigoDespawnZ) {
            Game.stats.escaparam++;
            Game.pontuacao = Math.max(0, Game.pontuacao - c.penalidadeEscape);
            return false;
        }
        return e.vivo;
    });
}

// ---- anéis ----
function atualizarAneis(dt) {
    const c = Game.config;
    for (const r of Game.aneis) {
        r.z += c.anelVelocidade * dt;
        r.girar += dt * 1.5;
    }
    Game.aneis = Game.aneis.filter(r => !r.coletado && r.z < c.anelDespawnZ);
}

// ---- prédios: rolam em +Z e reciclam para a frente ----
function atualizarPredios(dt) {
    const c = Game.config;
    const v = velocidadeMundoAtual();

    for (const p of Game.predios) {
        p.z += v * dt;

        // passou da nave: recicla lá na frente com novos atributos
        if (p.z > c.predioDespawnZ) {
            const novo = gerarPredio(c.predioSpawnZ + (p.z - c.predioDespawnZ), 0);
            Object.assign(p, novo);
        }
    }
}

// ---- explosões (efeito visual temporário) ----
function atualizarExplosoes(dt) {
    for (const ex of Game.explosoes) {
        ex.t += dt;
    }
    Game.explosoes = Game.explosoes.filter(ex => ex.t < ex.duracao);
}

function criarExplosao(x, y, z) {
    Game.explosoes.push({ x, y, z, t: 0, duracao: 0.35 });
}

// ==================================================
// RESOLUÇÃO DE COLISÕES (as "consequências" das regras)
// ==================================================

function resolverColisoes() {
    const c = Game.config;
    const n = Game.nave;

    // 1) TIRO x INIMIGO -> destrói inimigo, soma pontos, gera explosão
    for (const tiro of Game.tiros) {
        if (tiro.consumido) continue;
        for (const e of Game.inimigos) {
            if (!e.vivo) continue;
            if (colide(tiro.x, tiro.y, tiro.z, c.raioTiro, e.x, e.y, e.z, c.raioInimigo)) {
                e.vivo = false;
                tiro.consumido = true;
                Game.pontuacao += c.pontosPorInimigo;
                Game.stats.destruidos++;
                criarExplosao(e.x, e.y, e.z);
                break;
            }
        }
    }
    Game.tiros = Game.tiros.filter(t => !t.consumido);
    Game.inimigos = Game.inimigos.filter(e => e.vivo);

    // 2) NAVE x INIMIGO -> perde vida (salvo durante boost = desvio), explode inimigo
    for (const e of Game.inimigos) {
        if (!e.vivo) continue;
        if (colide(n.x, n.y, n.z, c.raioNave, e.x, e.y, e.z, c.raioInimigo)) {
            e.vivo = false;
            criarExplosao(e.x, e.y, e.z);
            if (!boostAtivo()) {
                Game.vidas -= 1;
            }
        }
    }
    Game.inimigos = Game.inimigos.filter(e => e.vivo);

    // 3) NAVE x ANEL -> coleta, soma pontos
    for (const r of Game.aneis) {
        if (r.coletado) continue;
        if (colide(n.x, n.y, n.z, c.raioNave, r.x, r.y, r.z, c.raioAnel)) {
            r.coletado = true;
            Game.pontuacao += c.pontosPorAnel;
            Game.stats.coletados++;
        }
    }
    Game.aneis = Game.aneis.filter(r => !r.coletado);

    // 4) NAVE x PRÉDIO -> bater num prédio custa uma vida
    //    (colisão esfera da nave contra a caixa AABB do prédio)
    if (Game.invulnDano <= 0 && !boostAtivo()) {
        for (const p of Game.predios) {
            if (p.atingido) continue;
            if (colideEsferaCaixaPredio(n, p, c.raioNave + c.margemPredio)) {
                p.atingido = true;
                Game.vidas -= 1;
                Game.invulnDano = 1.0;              // 1s de invulnerabilidade
                criarExplosao(n.x, Math.max(c.alturaMin, n.y), n.z - 0.5);
                break;
            }
        }
    }
}

// Colisão esfera (nave) x caixa do prédio.
// O prédio ocupa X em [x-w/2, x+w/2], Z em [z-d/2, z+d/2], Y em [0, h].
function colideEsferaCaixaPredio(nave, p, raio) {
    const minX = p.x - p.w / 2, maxX = p.x + p.w / 2;
    const minZ = p.z - p.d / 2, maxZ = p.z + p.d / 2;
    const minY = 0,             maxY = p.h;

    // ponto da caixa mais próximo do centro da nave
    const cx = Math.max(minX, Math.min(nave.x, maxX));
    const cy = Math.max(minY, Math.min(nave.y, maxY));
    const cz = Math.max(minZ, Math.min(nave.z, maxZ));

    const dx = nave.x - cx, dy = nave.y - cy, dz = nave.z - cz;
    return (dx*dx + dy*dy + dz*dz) <= (raio * raio);
}

// ==================================================
// CONDIÇÕES DE VITÓRIA / DERROTA
// ==================================================

function verificarFimDeJogo() {
    const c = Game.config;

    if (Game.pontuacao >= c.pontuacaoVitoria) {
        Game.recorde = Math.max(Game.recorde, Game.pontuacao);
        mudarFase(FASE.VITORIA);
        return;
    }

    if (Game.vidas <= 0) {
        Game.recorde = Math.max(Game.recorde, Game.pontuacao);
        mudarFase(FASE.DERROTA);
        return;
    }
}
