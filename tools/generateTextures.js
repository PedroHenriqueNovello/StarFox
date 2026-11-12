// ==================================================
// GERADOR DE TEXTURAS PROCEDURAIS (PNG real, sem dependências)
// --------------------------------------------------
// Cria os arquivos de imagem usados como textura no jogo:
//   - metal.png    -> fuselagem/asas da Arwing (painéis metálicos)
//   - grass.png    -> gramado de Corneria
//   - road.png     -> pista de voo (asfalto com faixa)
//   - building.png -> torres da cidade (concreto + janelas acesas)
//
// Também gera textures.js, que embute cada PNG como data URL base64,
// para o jogo carregar as texturas mesmo abrindo o index.html via file://
// (sem servidor), evitando o bloqueio de "tainted canvas" do WebGL.
//
// Uso:  node tools/generateTextures.js
// ==================================================

const zlib = require("zlib");
const fs   = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "textures");

// --------------------------------------------------
// Codificador PNG mínimo (RGBA, 8 bits, sem filtro)
// --------------------------------------------------
function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = (crc ^ buf[i]) & 0xff;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8]  = 8;   // bit depth
    ihdr[9]  = 6;   // color type RGBA
    ihdr[10] = 0;   // compression
    ihdr[11] = 0;   // filter
    ihdr[12] = 0;   // interlace

    // cada linha começa com o byte de filtro 0
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }

    const idat = zlib.deflateSync(raw, { level: 9 });

    return Buffer.concat([
        sig,
        chunk("IHDR", ihdr),
        chunk("IDAT", idat),
        chunk("IEND", Buffer.alloc(0))
    ]);
}

// --------------------------------------------------
// Helpers de desenho num buffer RGBA
// --------------------------------------------------
function makeImage(size) {
    return { size, data: Buffer.alloc(size * size * 4) };
}
function setPx(img, x, y, r, g, b, a = 255) {
    x = ((x % img.size) + img.size) % img.size;
    y = ((y % img.size) + img.size) % img.size;
    const i = (y * img.size + x) * 4;
    img.data[i] = r; img.data[i+1] = g; img.data[i+2] = b; img.data[i+3] = a;
}
// ruído determinístico (hash) para não depender de Math.random
function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) >>> 0;
    h = (h ^ (h >> 13)) * 1274126177 >>> 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// ==================================================
// 1) METAL da Arwing: ATLAS por parte, estilo 16-bit (SNES)
// --------------------------------------------------
// Em vez de uma textura única repetida (que fica bagunçada quando esticada
// por face), o metal é um ATLAS 512x512 dividido em 4 regiões. Cada parte
// da nave é mapeada na sua região, respeitando a forma da superfície:
//
//   +----------------+----------------+
//   | FUSELAGEM      | ASA            |   (quadrantes de 256x256)
//   | chapas longit. | painel liso c/ |
//   | + cockpit      | borda de ataque|
//   +----------------+----------------+
//   | ALETA          | LISO (neutro)  |
//   | metal escuro   | branco p/      |
//   | simples        | turbina/cor    |
//   +----------------+----------------+
//
// Regiões (em UV 0..1), usadas pela geometria:
//   FUSELAGEM: U[0.00..0.50] V[0.50..1.00]
//   ASA:       U[0.50..1.00] V[0.50..1.00]
//   ALETA:     U[0.00..0.50] V[0.00..0.50]
//   LISO:      U[0.50..1.00] V[0.00..0.50]
// ==================================================
function texMetal(size) {
    const img = makeImage(size);
    const h = size / 2;            // meia-textura (quadrante)

    const put = (x, y, r, g, b) =>
        setPx(img, x, y, Math.min(255, Math.max(0, r)) | 0,
                         Math.min(255, Math.max(0, g)) | 0,
                         Math.min(255, Math.max(0, b)) | 0);

    for (let qy = 0; qy < h; qy++) {
        for (let qx = 0; qx < h; qx++) {

            const u = qx / h, v = qy / h;   // 0..1 dentro do quadrante
            const grain = (hash2(qx >> 1, qy >> 1) - 0.5) * 8;

            // ---------- FUSELAGEM (top-left) ----------
            // Metal LISO (sem chapas finas) com uma FAIXA AZUL longitudinal,
            // estilo marcação de caça. O cockpit/canopy fica só numa tira
            // superior da região (metade de cima em V), para que apenas a
            // face de TOPO da nave o receba; a metade de baixo em V é lisa
            // e é usada pelas faces de baixo e laterais.
            {
                // base metálica lisa, cinza-azulada clara
                let shade = 206 + grain * 0.5;
                // brilho especular suave ao longo do centro (lombada)
                shade += (1 - Math.abs(u - 0.5) * 2.2) * 16;
                let r = shade * 0.92, g = shade * 0.96, b = shade * 1.05;

                // faixa azul longitudinal (corre ao longo do comprimento = V)
                // fica centrada em U, largura ~16%
                if (Math.abs(u - 0.5) < 0.08) {
                    r = 30; g = 80; b = 210;
                } else if (Math.abs(u - 0.5) < 0.11) {
                    // contorno mais escuro da faixa
                    r = 20; g = 40; b = 120;
                }

                // COCKPIT/CANOPY: só na METADE SUPERIOR da região (v > 0.5),
                // perto do "nariz" do mapeamento. A face de topo usa essa
                // metade; baixo e laterais usam v < 0.5 (lisa, sem canopy).
                if (v > 0.55) {
                    const cu = (u - 0.5) / 0.18;
                    const cv = (v - 0.78) / 0.16;
                    const d = Math.hypot(cu, cv);
                    if (d < 1.0) {
                        // vidro azul-escuro com reflexo claro em cima
                        const refl = Math.max(0, 1 - Math.hypot(cu + 0.3, cv + 0.4));
                        r = 25 + refl * 160;
                        g = 55 + refl * 170;
                        b = 95 + refl * 150;
                    }
                }

                put(qx, qy + h, r, g, b);
            }

            // ---------- ASA (top-right) ----------
            // superfície lisa, borda de ataque clara e uma faixa de acento
            {
                let shade = 205 + grain * 0.6;
                // borda de ataque (uma faixa clara perto de v=0)
                if (v < 0.12) shade += 30;
                // gradiente raiz->ponta (U): escurece levemente na ponta
                shade -= u * 24;
                let r = shade * 0.92, g = shade * 0.96, b = shade * 1.03;
                // faixa de acento (detalhe tipo pintura) a ~70% da corda
                if (v > 0.62 && v < 0.72) { r*=0.72; g*=0.78; b*=0.95; }
                // ponta com marcação escura
                if (u > 0.88) { r*=0.7; g*=0.74; b*=0.82; }
                put(qx + h, qy + h, r, g, b);
            }

            // ---------- ALETA (bottom-left) ----------
            // metal escuro simples (será tingido de azul pela cor do vértice)
            {
                let shade = 150 + grain;
                // leve nervura vertical central
                if (Math.abs(u - 0.5) < 0.05) shade += 25;
                shade += (1 - v) * 20;   // base um pouco mais clara
                put(qx, qy, shade * 0.9, shade * 0.95, shade * 1.1);
            }

            // ---------- LISO / NEUTRO (bottom-right) ----------
            // branco quase puro: usado pela turbina (cor do vértice domina)
            {
                put(qx + h, qy, 252, 252, 252);
            }
        }
    }
    return img;
}

// ==================================================
// 2) GRAMA de Corneria: verde com variação e manchas
// ==================================================
function texGrass(size) {
    const img = makeImage(size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // ruído em duas frequências = aspecto de grama
            const n1 = hash2(x, y);
            const n2 = hash2(x >> 2, y >> 2);
            const n  = n1 * 0.5 + n2 * 0.5;

            const r = lerp(24, 70, n);
            const g = lerp(92, 150, n);
            const b = lerp(46, 70, n);

            setPx(img, x, y, r | 0, g | 0, b | 0);
        }
    }
    // alguns tufos mais claros/escuros espalhados
    for (let k = 0; k < size * 3; k++) {
        const x = (hash2(k, 7) * size) | 0;
        const y = (hash2(k, 13) * size) | 0;
        const dark = hash2(k, 21) > 0.5;
        const len = 2 + (hash2(k, 31) * 4 | 0);
        for (let j = 0; j < len; j++) {
            const i = (((y - j + size) % size) * size + x) * 4;
            if (dark) { img.data[i] *= 0.7; img.data[i+1] *= 0.75; img.data[i+2] *= 0.7; }
            else      { img.data[i] = Math.min(255, img.data[i]*1.2);
                        img.data[i+1] = Math.min(255, img.data[i+1]*1.2);
                        img.data[i+2] = Math.min(255, img.data[i+2]*1.15); }
        }
    }
    return img;
}

// ==================================================
// 3) PISTA de voo: asfalto azul-petróleo com faixa central e bordas
// ==================================================
function texRoad(size) {
    const img = makeImage(size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // asfalto com granulado
            const n = hash2(x, y) * 0.5 + hash2(x >> 1, y >> 1) * 0.5;
            let r = lerp(24, 48, n);
            let g = lerp(60, 86, n);
            let b = lerp(66, 92, n);

            const u = x / size;      // 0..1 na largura

            // bordas ciano
            if (u < 0.06 || u > 0.94) { r = 40; g = 150; b = 170; }

            // faixa central tracejada branca (quebra em v)
            const centro = Math.abs(u - 0.5) < 0.035;
            const traco  = (y % (size / 4)) < (size / 8);
            if (centro && traco) { r = 210; g = 230; b = 220; }

            setPx(img, x, y, r | 0, g | 0, b | 0);
        }
    }
    return img;
}

// ==================================================
// 4) TORRES: concreto com grade de janelas (algumas acesas)
// ==================================================
function texBuilding(size) {
    const img = makeImage(size);
    const cols = 6, rows = 10;
    const cw = size / cols, ch = size / rows;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // concreto base cinza-azulado
            const n = hash2(x >> 1, y >> 1);
            let r = lerp(70, 92, n);
            let g = lerp(96, 118, n);
            let b = lerp(110, 132, n);

            // células de janela
            const cx = (x % cw) / cw;
            const cy = (y % ch) / ch;
            const col = (x / cw) | 0;
            const row = (y / ch) | 0;

            const isWindow = cx > 0.18 && cx < 0.82 && cy > 0.22 && cy < 0.78;
            if (isWindow) {
                const lit = hash2(col, row) > 0.45;        // janela acesa?
                if (lit) {
                    const flick = hash2(col + 3, row + 1);
                    r = lerp(120, 180, flick);
                    g = lerp(210, 240, flick);
                    b = lerp(215, 245, flick);             // brilho ciano
                } else {
                    r = 26; g = 42; b = 54;                 // vidro escuro
                }
            }
            setPx(img, x, y, r | 0, g | 0, b | 0);
        }
    }
    return img;
}

// ==================================================
// EXECUÇÃO
// ==================================================
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZE = 256;
const textures = {
    metal:    texMetal(512),   // atlas maior (mais resolução por parte da nave)
    grass:    texGrass(SIZE),
    road:     texRoad(SIZE),
    building: texBuilding(SIZE),
};

const dataUrls = {};
for (const [name, img] of Object.entries(textures)) {
    const png = encodePNG(img.size, img.size, img.data);
    const file = path.join(OUT_DIR, name + ".png");
    fs.writeFileSync(file, png);
    dataUrls[name] = "data:image/png;base64," + png.toString("base64");
    console.log("gerado:", path.relative(path.join(__dirname, ".."), file), "(" + png.length + " bytes)");
}

// gera textures.js com os data URLs embutidos (carregamento offline)
const js =
`// ==================================================
// TEXTURAS EMBUTIDAS (geradas por tools/generateTextures.js)
// --------------------------------------------------
// Os mesmos arquivos estão em /textures/*.png. Aqui eles vão
// embutidos como data URL base64 para que o jogo carregue as
// texturas mesmo abrindo o index.html direto (file://), sem servidor.
// Para regenerar:  node tools/generateTextures.js
// ==================================================

const TEXTURE_IMAGES = {
${Object.entries(dataUrls).map(([k, v]) => `    ${k}: "${v}"`).join(",\n")}
};
`;
fs.writeFileSync(path.join(__dirname, "..", "textures.js"), js);
console.log("gerado: textures.js");
