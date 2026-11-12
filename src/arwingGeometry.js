// ==================================================
// GEOMETRIA DA ARWING (low poly)
// Eixos: nariz aponta para -Z, topo é +Y, asas em ±X
// ==================================================

class MeshBuilder {

    constructor() {
        this.vertices = [];
        this.normals  = [];
        this.colors   = [];
        this.uvs      = [];   // coordenadas de textura (U,V) por vértice
    }

    // tri(a, b, c, color, [uvA, uvB, uvC])
    // Se as UVs não forem informadas, usa um mapeamento padrão
    // (triângulo no canto da textura). Isso mantém os objetos antigos
    // funcionando mesmo sem UV explícita.
    tri(a, b, c, color, uvA, uvB, uvC) {

        const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
        const v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];

        let n = [
            u[1]*v[2] - u[2]*v[1],
            u[2]*v[0] - u[0]*v[2],
            u[0]*v[1] - u[1]*v[0]
        ];

        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0]/len, n[1]/len, n[2]/len];

        const uv = [uvA || [0, 0], uvB || [1, 0], uvC || [1, 1]];
        const pts = [a, b, c];

        for (let i = 0; i < 3; i++) {
            const p = pts[i];
            this.vertices.push(p[0], p[1], p[2]);
            this.normals.push(n[0], n[1], n[2]);
            this.colors.push(color[0], color[1], color[2]);
            this.uvs.push(uv[i][0], uv[i][1]);
        }
    }

    // quad(a, b, c, d, color, [uvScale])
    // Mapeia a textura no quadrilátero inteiro: a=(0,0) b=(1,0) c=(1,1) d=(0,1).
    // uvScale repete a textura (tiling) quando a face é grande.
    quad(a, b, c, d, color, uvScale = 1) {
        const s = uvScale;
        this.tri(a, b, c, color, [0, 0], [s, 0], [s, s]);
        this.tri(a, c, d, color, [0, 0], [s, s], [0, s]);
    }

    prism(a, b, c, offset, color, uvScale = 1) {

        const add = (p) => [p[0]+offset[0], p[1]+offset[1], p[2]+offset[2]];
        const a2 = add(a), b2 = add(b), c2 = add(c);
        const s = uvScale;

        // tampas: mapeia o triângulo em um canto da textura
        this.tri(a,  b,  c,  color, [0, 0], [s, 0], [s, s]);
        this.tri(a2, b2, c2, color, [0, 0], [s, 0], [s, s]);

        // faces laterais: textura esticada ao longo da extrusão
        this.quad(a, b, b2, a2, color, s);
        this.quad(b, c, c2, b2, color, s);
        this.quad(c, a, a2, c2, color, s);
    }

    build() {
        return {
            vertices: new Float32Array(this.vertices),
            normals:  new Float32Array(this.normals),
            colors:   new Float32Array(this.colors),
            uvs:      new Float32Array(this.uvs),
            count:    this.vertices.length / 3
        };
    }
}

// ==================================================
// CORES
// ==================================================

const COR_CORPO    = [0.95, 0.95, 0.97];
const COR_CORPO_2  = [0.80, 0.80, 0.84];
const COR_ASA      = [0.93, 0.94, 0.97];
const COR_ALETA    = [0.00, 0.08, 0.95];
const COR_TRASEIRA = [0.85, 0.28, 0.10];

// ==================================================
// CORPO
// ==================================================

// ==================================================
// REGIÕES DO ATLAS DE METAL (metal.png, 512x512)
// --------------------------------------------------
// A textura é lida com UNPACK_FLIP_Y, então V=0 é a BASE do arquivo.
// Cada parte da nave usa a sua região, sem repetição e respeitando a
// forma da superfície. reg(u0,v0,u1,v1) devolve um sub-retângulo (um
// "quad" de UV) para mapear fuselagem/asa/aleta de forma coerente.
//  - FUSELAGEM: metade inferior-esquerda do arquivo -> V baixo, U esquerdo
//  - ASA:       metade inferior-direita             -> V baixo, U direito
//  - ALETA:     metade superior-esquerda            -> V alto,  U esquerdo
//  - LISO:      metade superior-direita             -> V alto,  U direito
// ==================================================
const ATLAS = {
    fuse:  { u0: 0.02, v0: 0.02, u1: 0.48, v1: 0.48 },
    wing:  { u0: 0.52, v0: 0.02, u1: 0.98, v1: 0.48 },
    fin:   { u0: 0.02, v0: 0.52, u1: 0.48, v1: 0.98 },
    smooth:{ u0: 0.52, v0: 0.52, u1: 0.98, v1: 0.98 },
};
// pontos de um retângulo de UV: (su,sv) em 0..1 dentro da região
function uvIn(reg, su, sv) {
    return [reg.u0 + (reg.u1 - reg.u0) * su, reg.v0 + (reg.v1 - reg.v0) * sv];
}

// ==================================================
// CORPO
// ==================================================

function arwingBody(mb) {

    const N = [ 0.00,  0.00, -2.60];   // nariz
    const L = [-0.50,  0.00,  0.80];   // esquerda (traseira)
    const R = [ 0.50,  0.00,  0.80];   // direita (traseira)
    const U = [ 0.00,  0.38,  0.80];   // topo (traseira)
    const D = [ 0.00, -0.28,  0.80];   // baixo (traseira)

    const F = ATLAS.fuse;
    // A região da fuselagem tem a faixa azul no centro (su=0.5) ao longo
    // do comprimento (sv), e o COCKPIT só na metade superior (sv > 0.5).
    //
    // FACE DE TOPO -> usa a metade COM cockpit (sv de 0.5 a 1.0), com o
    // nariz na ponta onde fica o canopy. A faixa azul central aparece.
    const topNose = uvIn(F, 0.5, 0.78);  // nariz: no centro do canopy
    const topL    = uvIn(F, 0.0, 0.5);   // traseira-esquerda do topo
    const topR    = uvIn(F, 1.0, 0.5);   // traseira-direita do topo
    mb.tri(N, L, U, COR_CORPO,   topNose, topL, uvIn(F, 0.5, 0.5));
    mb.tri(N, U, R, COR_CORPO_2, topNose, uvIn(F, 0.5, 0.5), topR);

    // FACE DE BAIXO -> usa a metade LISA (sv de 0.0 a 0.5), SEM cockpit.
    // Também passa pela faixa azul central, mantendo a marcação embaixo.
    const botNose = uvIn(F, 0.5, 0.0);
    mb.tri(N, D, L, COR_CORPO_2, botNose, uvIn(F, 0.5, 0.45), uvIn(F, 0.0, 0.45));
    mb.tri(N, R, D, COR_CORPO,   botNose, uvIn(F, 1.0, 0.45), uvIn(F, 0.5, 0.45));

    // TRASEIRA (turbina): região lisa branca -> some o padrão de chapa,
    // fica só a cor do bocal da turbina (branco * cor = cor pura).
    const S = ATLAS.smooth;
    const s0 = uvIn(S, 0.5, 0.5), s1 = uvIn(S, 0.5, 0.5), s2 = uvIn(S, 0.5, 0.5);
    mb.tri(L, R, U, COR_TRASEIRA, s0, s1, s2);
    mb.tri(L, D, R, COR_CORPO_2,  uvIn(F,0,0), uvIn(F,0.5,0), uvIn(F,1,0));
}

// ==================================================
// ASAS
// ==================================================
// prism cria: 2 tampas (triângulos) + 3 faces laterais (quads).
// Mapeamos tudo na região "wing" do atlas, com a raiz da asa na borda
// de ataque clara (sv=0) e a ponta mais escura (sv=1) -> coerente e sem
// repetição, dando aparência de painel de asa (diferente da fuselagem).

function arwingWing(mb, lado) {

    const raizFrente = [lado * 0.65,  0.00, -0.40];
    const raizTras   = [lado * 0.65,  0.00,  0.45];
    const ponta      = [lado * 2.10, -0.50,  1.50];

    const W = ATLAS.wing;
    const add = (p) => [p[0], p[1] + 0.05, p[2]];   // mesmo offset do prism
    const a = raizFrente, b = raizTras, c = ponta;
    const a2 = add(a), b2 = add(b), c2 = add(c);

    // UVs dos 3 vértices dentro da asa: raiz(frente/tras) perto da borda de
    // ataque, ponta no lado escuro.
    const uA = uvIn(W, 0.15, 0.10);   // raiz frente
    const uB = uvIn(W, 0.15, 0.55);   // raiz trás
    const uC = uvIn(W, 0.95, 0.35);   // ponta

    // tampas (topo e base da asa)
    mb.tri(a,  b,  c,  COR_ASA, uA, uB, uC);
    mb.tri(a2, b2, c2, COR_ASA, uA, uB, uC);

    // faces laterais (bordas da asa) — usam a mesma região, faixa estreita
    const e0 = uvIn(W, 0.10, 0.05), e1 = uvIn(W, 0.95, 0.30);
    mb.tri(a, b, b2, COR_ASA, e0, e1, e1); mb.tri(a, b2, a2, COR_ASA, e0, e1, e0);
    mb.tri(b, c, c2, COR_ASA, e0, e1, e1); mb.tri(b, c2, b2, COR_ASA, e0, e1, e0);
    mb.tri(c, a, a2, COR_ASA, e0, e1, e1); mb.tri(c, a2, c2, COR_ASA, e0, e1, e0);
}

// ==================================================
// ALETAS AZUIS
// ==================================================

function arwingFin(mb, lado) {

    const baseFrente = [lado * 0.62, -0.15, -0.60];
    const baseTras   = [lado * 0.62,  0.05, -0.10];
    const topo       = [lado * 0.50,  0.85,  0.40];

    const Fi = ATLAS.fin;
    const add = (p) => [p[0] + lado * 0.04, p[1], p[2]];
    const a = baseFrente, b = baseTras, c = topo;
    const a2 = add(a), b2 = add(b), c2 = add(c);

    const uA = uvIn(Fi, 0.15, 0.10);
    const uB = uvIn(Fi, 0.85, 0.10);
    const uC = uvIn(Fi, 0.50, 0.95);

    mb.tri(a,  b,  c,  COR_ALETA, uA, uB, uC);
    mb.tri(a2, b2, c2, COR_ALETA, uA, uB, uC);

    const e0 = uvIn(Fi, 0.15, 0.10), e1 = uvIn(Fi, 0.85, 0.10), e2 = uvIn(Fi, 0.5, 0.95);
    mb.tri(a, b, b2, COR_ALETA, e0, e1, e1); mb.tri(a, b2, a2, COR_ALETA, e0, e1, e0);
    mb.tri(b, c, c2, COR_ALETA, e1, e2, e2); mb.tri(b, c2, b2, COR_ALETA, e1, e2, e1);
    mb.tri(c, a, a2, COR_ALETA, e2, e0, e0); mb.tri(c, a2, c2, COR_ALETA, e2, e0, e2);
}

// ==================================================
// MONTA A NAVE COMPLETA
// ==================================================

function createArwing() {

    const mb = new MeshBuilder();

    arwingBody(mb);

    arwingWing(mb, -1);
    arwingWing(mb,  1);

    arwingFin(mb, -1);
    arwingFin(mb,  1);

    return mb.build();
}