const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL 2 não é suportado.");
}

// ==================================================
// SHADERS
// ==================================================

const vertexShaderSource = `#version 300 es

in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
in vec2 aTexCoord;      // coordenadas de textura (UV) do vértice

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vTexCoord;     // UV interpolada para o fragment shader

void main() {

    vec4 world = u_model * vec4(aPosition, 1.0);

    vWorldPos = world.xyz;
    vNormal   = mat3(u_model) * aNormal;
    vColor    = aColor;
    vTexCoord = aTexCoord;

    // ------------------------------------------------------------------
    // PROJEÇÃO PERSPECTIVA aplicada aqui:
    // gl_Position = projeção_perspectiva * visão * mundo
    // u_projection é a matriz de perspectiva montada em perspective()
    // ------------------------------------------------------------------
    gl_Position = u_projection * u_view * world;
}
`;

const fragmentShaderSource = `#version 300 es

precision mediump float;

in vec3 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vTexCoord;

uniform vec3 u_cameraPos;

// ---------- TEXTURA ----------
uniform sampler2D u_texture;   // imagem aplicada ao objeto
uniform float u_useTexture;    // 1.0 = usa textura, 0.0 = só a cor por vértice
uniform float u_texMix;        // quanto a cor base tinge a textura (0..1)
uniform vec2  u_texScroll;     // deslocamento de UV (rola a textura do chão/pista)
uniform float u_useScroll;     // 1.0 = aplica u_texScroll neste objeto
uniform vec3  u_colorTint;     // tinta multiplicativa por objeto (ex.: cor do prédio)

// ---------- MÚLTIPLAS FONTES DE LUZ ----------
// Luz 0 = SOL (direcional)  |  Luz 1 = HOLOFOTE (spotlight que sai da nave)
uniform vec3  u_lightDir0;     // direção da luz direcional (do sol para a cena, invertida no cálculo)
uniform vec3  u_lightColor0;   // cor/intensidade do sol
uniform float u_lightOn0;      // 1.0 = ligada, 0.0 = desligada

// --- Holofote: agora é um SPOTLIGHT (farol) com posição, direção e cone ---
uniform vec3  u_lightPos1;     // posição do farol (nariz da nave)
uniform vec3  u_lightColor1;   // cor/intensidade do farol
uniform float u_lightOn1;      // 1.0 = ligado, 0.0 = desligado
uniform vec3  u_spotDir;       // direção para onde o farol aponta (frente da nave)
uniform float u_spotCosInner;  // cosseno do ângulo interno do cone (cheio)
uniform float u_spotCosOuter;  // cosseno do ângulo externo do cone (borda)

// --- Luzes de TIRO (lasers): luzes pontuais curtas, sem cone ---
// Cada tiro ativo (até MAX_LASERS mais próximos da câmera) ilumina o que
// está em volta com atenuação por distância, reforçando o clima noturno
// quando o Sol está desligado.
#define MAX_LASERS 6
uniform vec3  u_laserPos[MAX_LASERS];   // posições dos tiros mais próximos
uniform vec3  u_laserColor;             // cor da luz do laser (ex.: verde)
uniform int   u_laserCount;             // quantos tiros ativos enviar (0..MAX_LASERS)

uniform vec3  u_ambient;       // luz ambiente geral
uniform float u_fogOn;         // 1.0 = névoa ligada

// Emissão própria do objeto: objetos "luminosos" (ex.: o laser) somam sua
// cor direto no resultado final, então continuam brilhando mesmo com o Sol
// e o farol desligados.
uniform float u_emissive;      // 0.0 = normal, >0.0 = quanto a cor base brilha sozinha

out vec4 outColor;

void main() {

    vec3 n = normalize(vNormal);
    vec3 toCamera = normalize(u_cameraPos - vWorldPos);

    // faces de costas para a câmera: inverte a normal (ilumina os dois lados)
    if (dot(n, toCamera) < 0.0) {
        n = -n;
    }

    // começa só com a luz ambiente
    vec3 light = u_ambient;

    // ---------- LUZ 0: SOL (direcional) ----------
    // direção fixa, não depende da posição do fragmento
    vec3 L0  = normalize(u_lightDir0);
    float d0 = max(dot(n, L0), 0.0);
    vec3 h0  = normalize(L0 + toCamera);
    float s0 = pow(max(dot(n, h0), 0.0), 32.0) * 0.25;
    light += u_lightOn0 * (d0 * u_lightColor0 + s0 * u_lightColor0);

    // ---------- LUZ 1: HOLOFOTE (SPOTLIGHT que sai da nave) ----------
    // Tem posição (nariz da nave), direção (frente) e um CONE de abertura.
    // Fora do cone não ilumina; na borda do cone a luz some suavemente.
    vec3  toL1 = u_lightPos1 - vWorldPos;      // do fragmento para o farol
    float dist1 = length(toL1);
    vec3  L1   = toL1 / max(dist1, 0.001);     // direção fragmento -> farol
    float d1   = max(dot(n, L1), 0.0);
    float att1 = 1.0 / (1.0 + 0.008 * dist1 + 0.0012 * dist1 * dist1);

    // fator do cone: ângulo entre a direção do farol e a direção farol->fragmento
    vec3  spot = normalize(u_spotDir);
    float cosAng = dot(normalize(-toL1), spot);     // -toL1 = farol -> fragmento
    float cone = smoothstep(u_spotCosOuter, u_spotCosInner, cosAng);

    vec3  h1   = normalize(L1 + toCamera);
    float s1   = pow(max(dot(n, h1), 0.0), 48.0) * 0.6;
    light += u_lightOn1 * cone * att1 * (d1 * u_lightColor1 + s1 * u_lightColor1);

    // ---------- LUZES DE TIRO (lasers) ----------
    // Cada tiro é uma luz pontual curta: difusa + atenuação por distância,
    // sem cone. Só SOMA ao resultado (nunca substitui Sol/farol). Alcance
    // curto via atenuação forte, para iluminar só o que está perto do tiro.
    for (int i = 0; i < MAX_LASERS; i++) {
        if (i >= u_laserCount) break;
        vec3  toL  = u_laserPos[i] - vWorldPos;
        float dist = length(toL);
        vec3  L    = toL / max(dist, 0.001);
        float d    = max(dot(n, L), 0.0);
        float att  = 1.0 / (1.0 + 0.15 * dist + 0.08 * dist * dist);
        light += att * d * u_laserColor;
    }

    // ---------- COR BASE DO MATERIAL ----------
    // Quando o objeto tem textura, a cor do pixel vem da imagem amostrada
    // em vTexCoord. A cor por vértice (vColor) é misturada por u_texMix
    // para dar tom (ex.: tingir levemente o metal), e a iluminação é
    // aplicada por cima -> textura + iluminação integradas.
    vec3 base;
    if (u_useTexture > 0.5) {
        // rola a UV no chão/pista para dar sensação de movimento para frente
        vec2 uv = vTexCoord + u_useScroll * u_texScroll;
        vec3 tex = texture(u_texture, uv).rgb;
        base = mix(tex, tex * vColor, u_texMix);
    } else {
        base = vColor;
    }

    vec3 color = base * u_colorTint * light;

    // emissão própria: objetos luminosos (laser) brilham mesmo sem luz
    // externa, somando a cor base por cima da iluminação.
    color += base * u_colorTint * u_emissive;

    // névoa leve: objetos distantes se misturam com o céu
    if (u_fogOn > 0.5) {
        float dist = length(u_cameraPos - vWorldPos);
        float fog = clamp((dist - 35.0) / 60.0, 0.0, 1.0);
        vec3 skyColor = vec3(0.46, 0.70, 0.92);
        color = mix(color, skyColor, fog);
    }

    outColor = vec4(color, 1.0);
}
`;

function createShader(gl, type, source) {

    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error);
    }

    return shader;
}

function createProgram(gl, vsSource, fsSource) {

    const program = gl.createProgram();

    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }

    return program;
}

const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
gl.useProgram(program);

// ==================================================
// MATRIZES DE CÂMERA
// ==================================================

function perspective(fovRad, aspect, near, far) {
    const f = 1 / Math.tan(fovRad / 2);
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0
    ];
}

function lookAt(eye, target, up) {

    let z = [eye[0]-target[0], eye[1]-target[1], eye[2]-target[2]];
    let len = Math.hypot(...z);
    z = z.map(v => v / len);

    let x = [
        up[1]*z[2] - up[2]*z[1],
        up[2]*z[0] - up[0]*z[2],
        up[0]*z[1] - up[1]*z[0]
    ];
    len = Math.hypot(...x);
    x = x.map(v => v / len);

    const y = [
        z[1]*x[2] - z[2]*x[1],
        z[2]*x[0] - z[0]*x[2],
        z[0]*x[1] - z[1]*x[0]
    ];

    const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

    return [
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ];
}

// ==================================================
// OBJETOS DA CENA
// ==================================================

function createAttribute(name, data, size = 3) {

    const location = gl.getAttribLocation(program, name);
    if (location < 0) return;                 // atributo não usado no shader

    const buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

// createSceneObject(mesh, { texture, texMix })
// texture : textura WebGL a aplicar (ou null para usar só a cor por vértice)
// texMix  : quanto a cor base tinge a textura (0 = textura pura, 1 = textura * cor)
function createSceneObject(mesh, options = {}) {

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    createAttribute("aPosition", mesh.vertices, 3);
    createAttribute("aNormal",   mesh.normals,  3);
    createAttribute("aColor",    mesh.colors,   3);
    createAttribute("aTexCoord", mesh.uvs,      2);

    return {
        vao: vao,
        count: mesh.count,
        modelTransform: m4.identity(),
        texture: options.texture || null,
        texMix:  options.texMix  !== undefined ? options.texMix : 0.0
    };
}

// ==================================================
// CARREGAMENTO DE TEXTURAS
// --------------------------------------------------
// As imagens vêm embutidas como data URL em textures.js (TEXTURE_IMAGES),
// o que permite carregar as texturas mesmo abrindo o index.html via
// file:// (sem servidor). Os mesmos arquivos estão em /textures/*.png.
// Enquanto a imagem carrega, a textura mostra 1 pixel cinza; ao terminar,
// a imagem real é enviada para a GPU com mipmaps e repetição (tiling).
// ==================================================

function createTexture(url) {

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // pixel temporário enquanto a imagem não chega
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([150, 150, 160, 255]));

    const image = new Image();
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    image.src = url;

    return texture;
}

const TEX = {
    metal:    createTexture(TEXTURE_IMAGES.metal),
    grass:    createTexture(TEXTURE_IMAGES.grass),
    road:     createTexture(TEXTURE_IMAGES.road),
    building: createTexture(TEXTURE_IMAGES.building),
};

// Cada objeto recebe uma textura coerente com o cenário de Corneria.
// A sombra fica sem textura (usa só a cor por vértice).
const ground    = createSceneObject(createGround(),    { texture: TEX.grass,    texMix: 0.15 });
const road      = createSceneObject(createRoad(),      { texture: TEX.road,     texMix: 0.0  });
const buildings = createSceneObject(createBuildings(), { texture: TEX.building, texMix: 0.35 });
const shadow    = createSceneObject(createShadow());
const arwing    = createSceneObject(createArwing(),    { texture: TEX.metal,    texMix: 0.5  });

// O chão e a pista rolam a textura para dar a sensação de voo para frente.
ground.scroll = true;
road.scroll   = true;

// As montanhas/torres fixas originais (createBuildings) ficam só como
// pano de fundo distante; os prédios QUE INTERAGEM com o jogo são
// instâncias da malha unitária abaixo, posicionadas por Game.predios.

// ---- objetos de JOGO (sem textura: a cor por vértice domina) ----
// Uma única malha por tipo é reutilizada para desenhar várias instâncias
// (cada tiro/inimigo/anel/prédio só muda a matriz de modelo).
const laserObj     = createSceneObject(createLaser());
laserObj.emissive  = 1.0;   // o tiro brilha sozinho (não depende de Sol/farol)
const enemyObj     = createSceneObject(createEnemy());
const ringObj      = createSceneObject(createRing());
const explosionObj = createSceneObject(createExplosion());
const buildingObj  = createSceneObject(createBuildingBlock(), { texture: TEX.building, texMix: 0.5 });

const uModel      = gl.getUniformLocation(program, "u_model");
const uView       = gl.getUniformLocation(program, "u_view");
const uProjection = gl.getUniformLocation(program, "u_projection");
const uCameraPos  = gl.getUniformLocation(program, "u_cameraPos");

// uniforms de textura
const uTexture    = gl.getUniformLocation(program, "u_texture");
const uUseTexture = gl.getUniformLocation(program, "u_useTexture");
const uTexMix     = gl.getUniformLocation(program, "u_texMix");
const uTexScroll  = gl.getUniformLocation(program, "u_texScroll");
const uUseScroll  = gl.getUniformLocation(program, "u_useScroll");
const uColorTint  = gl.getUniformLocation(program, "u_colorTint");
gl.uniform1i(uTexture, 0);   // sampler usa a unidade de textura 0

// uniforms de iluminação
const uLightDir0    = gl.getUniformLocation(program, "u_lightDir0");
const uLightColor0  = gl.getUniformLocation(program, "u_lightColor0");
const uLightOn0     = gl.getUniformLocation(program, "u_lightOn0");
const uLightPos1    = gl.getUniformLocation(program, "u_lightPos1");
const uLightColor1  = gl.getUniformLocation(program, "u_lightColor1");
const uLightOn1     = gl.getUniformLocation(program, "u_lightOn1");
const uSpotDir      = gl.getUniformLocation(program, "u_spotDir");
const uSpotCosInner = gl.getUniformLocation(program, "u_spotCosInner");
const uSpotCosOuter = gl.getUniformLocation(program, "u_spotCosOuter");
const uAmbient      = gl.getUniformLocation(program, "u_ambient");
const uFogOn        = gl.getUniformLocation(program, "u_fogOn");

// uniforms das luzes de tiro (lasers) e da emissão própria
const uLaserColor = gl.getUniformLocation(program, "u_laserColor");
const uLaserCount = gl.getUniformLocation(program, "u_laserCount");
const uLaserPos   = gl.getUniformLocation(program, "u_laserPos");
const uEmissive   = gl.getUniformLocation(program, "u_emissive");

// cor da luz do laser (mesmo verde do tiro); emissão padrão desligada
const LASER_LIGHT_COLOR = [0.30, 1.00, 0.45];
const MAX_LASERS = 6;   // deve bater com o #define do shader
gl.uniform3fv(uLaserColor, LASER_LIGHT_COLOR);
gl.uniform1i(uLaserCount, 0);
gl.uniform1f(uEmissive, 0.0);

function drawObject(object) {

    gl.uniformMatrix4fv(uModel, false, object.modelTransform);

    // liga (ou não) a textura deste objeto
    if (object.texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, object.texture);
        gl.uniform1f(uUseTexture, 1.0);
        gl.uniform1f(uTexMix, object.texMix);
    } else {
        gl.uniform1f(uUseTexture, 0.0);
    }

    // só o chão e a pista rolam a textura (sensação de movimento)
    gl.uniform1f(uUseScroll, object.scroll ? 1.0 : 0.0);

    // tinta por objeto (branco = sem alteração)
    const tint = object.tint || [1, 1, 1];
    gl.uniform3fv(uColorTint, tint);

    // emissão própria (laser brilha sozinho); padrão 0 = sem emissão
    gl.uniform1f(uEmissive, object.emissive || 0.0);

    gl.bindVertexArray(object.vao);
    gl.drawArrays(gl.TRIANGLES, 0, object.count);
}

// ==================================================
// ESCALA E POSIÇÃO DA NAVE NA CENA
// ==================================================

const SHIP_SCALE  = 0.6;
const SHIP_HEIGHT = 3.2;

const BACKDROP_TILE = 55;   // comprimento do ciclo de repetição em Z

// ==================================================
// FONTES DE LUZ (estado controlável em tempo de execução)
// ==================================================

const lights = {
    sol: {
        on: true,
        dir: [0.5, 1.0, 0.8],              // direção do sol
        color: [0.95, 0.90, 0.75]          // luz quente de sol
    },
    // Holofote agora é um SPOTLIGHT que sai do nariz da nave e aponta para
    // frente (-Z). pos/dir são atualizados no loop conforme a nave se move.
    holofote: {
        on: true,
        pos: [0, 3.2, -2.0],               // nariz da nave (atualizado no loop)
        dir: [0, -0.15, -1.0],             // aponta para frente e levemente para baixo
        color: [0.75, 0.88, 1.00],         // feixe branco-azulado de farol
        cosInner: Math.cos(0.26),          // ~15° cone cheio
        cosOuter: Math.cos(0.42)           // ~24° borda do cone
    },
    // ambiente mais baixa: a cena fica em penumbra para o feixe do farol
    // aparecer bem (o Sol, na tecla Z, devolve o "dia" para comparação).
    ambient: [0.12, 0.13, 0.17],
    fog: true
};

// ==================================================
// CÂMERAS (múltiplas configurações alternáveis)
// ==================================================
//
// Modo 0: ORBITAL     - gira em volta da cena com o mouse (câmera livre)
// Modo 1: PERSEGUIÇÃO  - atrás da nave, estilo jogo
// Modo 2: TORRE FIXA   - câmera parada em uma torre da cidade
// Modo 3: TOPO (cockpit alto) - vista de cima acompanhando a nave
//
// Troca com as teclas 1, 2, 3, 4 (ou C para ciclar).
// ==================================================

const CAM_NAMES = ["Orbital (mouse)", "Perseguição", "Torre fixa", "Visão superior"];
let camMode = 1;   // começa na câmera de perseguição (melhor para jogar)

// estado da câmera orbital (mouse)
let camYaw      = 0.7;
let camPitch    = 0.30;
let camDistance = 16;
let autoRotate  = false;

let dragging = false;
let lastX = 0, lastY = 0;

canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
});

window.addEventListener("mouseup", () => dragging = false);

window.addEventListener("mousemove", (e) => {
    if (!dragging || camMode !== 0) return;

    camYaw   -= (e.clientX - lastX) * 0.01;
    camPitch += (e.clientY - lastY) * 0.01;
    camPitch  = Math.max(0.02, Math.min(1.5, camPitch));

    lastX = e.clientX;
    lastY = e.clientY;
});
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    camDistance *= (e.deltaY > 0) ? 1.08 : 0.92;
    camDistance = Math.max(4, Math.min(60, camDistance));
}, { passive: false });

window.addEventListener("keydown", (e) => {

    switch (e.code) {

        // Espaço = atirar (tratado em game.js). Rotação automática da
        // câmera orbital agora fica na tecla P, para não conflitar.
        case "KeyP":
            autoRotate = !autoRotate;
            break;

        // ---- troca de câmera ----
        case "Digit1": camMode = 0; break;
        case "Digit2": camMode = 1; break;
        case "Digit3": camMode = 2; break;
        case "Digit4": camMode = 3; break;
        case "KeyC":   camMode = (camMode + 1) % CAM_NAMES.length; break;

        // ---- liga/desliga fontes de luz ----
        case "KeyZ": lights.sol.on      = !lights.sol.on;      break;
        case "KeyX": lights.holofote.on = !lights.holofote.on; break;
        case "KeyF": lights.fog         = !lights.fog;         break;
    }

    updateHud();
});

// ==================================================
// HUD (mostra câmera e luzes ativas)
// ==================================================

function updateHud() {
    const hud = document.getElementById("hud");
    if (!hud) return;
    hud.innerHTML =
        `<strong>Câmera [${camMode + 1}]:</strong> ${CAM_NAMES[camMode]} &nbsp;|&nbsp; ` +
        `<strong>Sol [Z]:</strong> ${lights.sol.on ? "ON" : "OFF"} &nbsp;|&nbsp; ` +
        `<strong>Farol [X]:</strong> ${lights.holofote.on ? "ON" : "OFF"} &nbsp;|&nbsp; ` +
        `<strong>Névoa [F]:</strong> ${lights.fog ? "ON" : "OFF"}`;
}

// ==================================================
// CONFIGURAÇÃO INICIAL DO WEBGL
// ==================================================

gl.clearColor(0.46, 0.70, 0.92, 1.0);   // céu de Corneria
gl.viewport(0, 0, canvas.width, canvas.height);
gl.enable(gl.DEPTH_TEST);

// ==================================================
// SELETOR DE CÂMERA: devolve {eye, target} conforme o modo
// ==================================================

function computeCamera(alvoNave, time) {

    const up = [0, 1, 0];

    switch (camMode) {

        // ---- ORBITAL (controlada pelo mouse) ----
        case 0: {
            const alvo = [0, 2.5, 0];
            const eye = [
                alvo[0] + camDistance * Math.cos(camPitch) * Math.sin(camYaw),
                alvo[1] + camDistance * Math.sin(camPitch),
                alvo[2] + camDistance * Math.cos(camPitch) * Math.cos(camYaw)
            ];
            return { eye, target: alvo, up };
        }

        // ---- PERSEGUIÇÃO (atrás e acima da nave) ----
        case 1: {
            const eye = [
                alvoNave[0] - 1.2,
                alvoNave[1] + 2.2,
                alvoNave[2] + 9.0
            ];
            return { eye, target: [alvoNave[0], alvoNave[1] + 0.5, alvoNave[2] - 2.0], up };
        }

        // ---- TORRE FIXA (câmera parada na cidade olhando a nave) ----
        case 2: {
            const eye = [10.5, 8.0, -20.0];
            return { eye, target: alvoNave, up };
        }

        // ---- VISÃO SUPERIOR (de cima, acompanha a nave) ----
        case 3: {
            const eye = [alvoNave[0] + 0.01, alvoNave[1] + 14.0, alvoNave[2] + 0.5];
            return { eye, target: alvoNave, up };
        }
    }
}

// ==================================================
// LOOP DE ANIMAÇÃO
// ==================================================

let time = 0;

let ultimoFrame = performance.now();

function render() {

    // dt real (em segundos) para a lógica de jogo ficar independente do FPS
    const agora = performance.now();
    let dt = (agora - ultimoFrame) / 1000;
    ultimoFrame = agora;
    if (dt > 0.05) dt = 0.05;   // limita saltos (ex.: aba em segundo plano)

    time += dt;

    // ---- ATUALIZA A LÓGICA DE JOGO (controles, tiros, inimigos, colisões) ----
    atualizarJogo(dt);
    atualizarGameHud();

    if (autoRotate && camMode === 0) {
        camYaw += 0.006;
    }

    // ---- Nave controlada pelo jogador (posição vinda de Game.nave) ----
    const n = Game.nave;
    // leve flutuação quando parado, só na tela de início
    const bob = (Game.fase === Game.FASE.PRONTO) ? 0.15 * Math.sin(time * 1.5) : 0;

    // pisca a nave quando está invulnerável após levar dano
    const piscando = Game.invulnDano > 0 && (Math.floor(time * 20) % 2 === 0);

    // BARREL ROLL: durante o boost a nave dá um giro completo (360°) no
    // eixo Z. boostGiroProgresso() vai de 0 a 1 ao longo do boost; usamos
    // uma curva suave (easing) para o giro acelerar e desacelerar.
    const giroProg = boostGiroProgresso();
    const giroSuave = giroProg * giroProg * (3 - 2 * giroProg);   // smoothstep
    const barrelRoll = giroSuave * Math.PI * 2;                   // 0 -> 2π

    // Ordem: escala -> roll -> pitch -> translação (translação aplicada por
    // último, então usa diretamente as coordenadas de mundo de Game.nave).
    let m = m4.identity();
    m = m4.scale(m, SHIP_SCALE, SHIP_SCALE, SHIP_SCALE);
    m = m4.zRotate(m, n.roll + barrelRoll);   // roll de manobra + giro do boost
    m = m4.xRotate(m, n.pitch);
    m = m4.translate(m, n.x, n.y + bob, n.z);
    arwing.modelTransform = m;

    const naveWorld = [n.x, n.y + bob, n.z];

    // sombra da nave projetada no chão, acompanhando o X/Z
    let ms = m4.identity();
    ms = m4.translate(ms, naveWorld[0], 0, naveWorld[2]);
    shadow.modelTransform = ms;

    // ---- SPOTLIGHT: sai do nariz da nave e aponta para frente (-Z) ----
    // posição = um pouco à frente da nave; direção acompanha o roll/pitch
    lights.holofote.pos = [naveWorld[0], naveWorld[1], naveWorld[2] - 1.8];
    // direção para frente, inclinada para baixo, deslocada pelo roll lateral
    const sideTilt = Math.sin(n.roll) * 0.35;
    lights.holofote.dir = [sideTilt + n.x * 0.0, -0.18 + n.pitch * 0.5, -1.0];

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- CÂMERA ----
    const alvoNave = [naveWorld[0], naveWorld[1] + 0.8, naveWorld[2]];
    const cam = computeCamera(alvoNave, time);

    const view = lookAt(cam.eye, cam.target, cam.up);

    // PROJEÇÃO PERSPECTIVA aplicada na cena
    const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 200);

    gl.uniformMatrix4fv(uView, false, view);
    gl.uniformMatrix4fv(uProjection, false, proj);
    gl.uniform3fv(uCameraPos, cam.eye);

    // ---- ILUMINAÇÃO (envia o estado das fontes para o shader) ----
    gl.uniform3fv(uLightDir0,   lights.sol.dir);
    gl.uniform3fv(uLightColor0, lights.sol.color);
    gl.uniform1f(uLightOn0,     lights.sol.on ? 1.0 : 0.0);

    gl.uniform3fv(uLightPos1,    lights.holofote.pos);
    gl.uniform3fv(uLightColor1,  lights.holofote.color);
    gl.uniform1f(uLightOn1,      lights.holofote.on ? 1.0 : 0.0);
    gl.uniform3fv(uSpotDir,      lights.holofote.dir);
    gl.uniform1f(uSpotCosInner,  lights.holofote.cosInner);
    gl.uniform1f(uSpotCosOuter,  lights.holofote.cosOuter);

    gl.uniform3fv(uAmbient, lights.ambient);
    gl.uniform1f(uFogOn,    lights.fog ? 1.0 : 0.0);

    // ---- LUZES DE TIRO: envia os tiros mais próximos da câmera ----
    // Arrays de luz pesam por fragmento, então limitamos a MAX_LASERS tiros.
    // Ordenamos por distância à câmera e mandamos só os mais próximos.
    enviarLuzesDeTiro(cam.eye);

    // ---- rolagem da textura do chão/pista (sensação de movimento) ----
    // V repete muitas vezes (chão uvScale=26, pista vRep=20); dividimos o
    // scroll do mundo por um fator proporcional para a velocidade parecer certa.
    const scrollV = -(Game.mundoScroll / 6.0);
    gl.uniform2f(uTexScroll, 0.0, scrollV);

    drawObject(ground);
    drawObject(road);

    // ---- backdrop distante (montanhas/torres originais) rolando ----
    // Em vez de ficar parado (parecia uma estrutura "travada"), o conjunto
    // rola em +Z junto com o mundo e volta para o fundo ao passar de um
    // ciclo. Desenhamos em dois blocos deslocados para não haver emenda.
    desenharBackdrop();

    drawObject(shadow);

    // ==================================================
    // BACKDROP DISTANTE (montanhas + torres originais) rolando/reciclando.
    // A malha `buildings` tem seu conteúdo em torno de Z ≈ -22..-38. Deslocamos
    // em +Z pelo scroll do mundo (módulo o tamanho do ciclo) e desenhamos duas
    // cópias separadas por um ciclo, de modo que, quando uma sai, a outra já
    // está cobrindo o fundo — dá a impressão de paisagem distante passando.
    // ==================================================

    // Faixa distante onde o backdrop vive e recicla. O conteúdo original tem
    // ~16 unidades de profundidade (Z ≈ -38..-22); o ciclo é maior que isso para
    // as duas cópias cobrirem a faixa sem buraco, e tudo fica sempre atrás da nave.
    // comprimento do ciclo de repetição em Z

    function desenharBackdrop() {
        // desloc: 0..TILE. Some em +Z (aproxima) e, ao fechar o ciclo, volta ao
        // fundo. Mantemos as cópias numa faixa distante com um recuo (RECUO),
        // para que mesmo o ponto mais próximo do ciclo continue longe da nave.
        const desloc = Game.mundoScroll % BACKDROP_TILE;   // 0..TILE
        const RECUO = -20;   // nunca deixa o backdrop chegar mais perto que ~Z -20

        for (let i = 0; i < 2; i++) {
            // dz varia de (RECUO - TILE) até RECUO — sempre negativo (distante)
            const dz = RECUO - i * BACKDROP_TILE + desloc - BACKDROP_TILE;
            let m = m4.identity();
            m = m4.translate(m, 0, 0, dz);
            buildings.modelTransform = m;
            drawObject(buildings);
        }
        buildings.modelTransform = m4.identity();
    }
    
    // prédios (cenário + obstáculos) rolando com o mundo
    desenharPredios();

    if (!piscando) drawObject(arwing);

    // ---- desenha as entidades de JOGO ----
    desenharEntidadesDeJogo();

    requestAnimationFrame(render);
}

// ==================================================
// DESENHO DOS PRÉDIOS (instâncias da malha unitária)
// Cada prédio é escalado por (w, h, d) e posicionado por (x, z).
// A malha tem base em y=0 e topo em y=1, então a escala em Y vira a altura.
// ==================================================

function desenharPredios() {
    for (const p of Game.predios) {
        buildingObj.tint = p.cor;   // cor da construção (variação visual)

        // ordem: escala -> translação (translação por último = posição no mundo)
        let m = m4.identity();
        m = m4.scale(m, p.w, p.h, p.d);
        m = m4.translate(m, p.x, 0, p.z);
        buildingObj.modelTransform = m;
        drawObject(buildingObj);
    }
    buildingObj.tint = null;   // restaura para não afetar outros desenhos
}

// ==================================================
// DESENHO DAS ENTIDADES DE JOGO
// Reutiliza uma malha por tipo, mudando só a matriz de modelo.
// ==================================================

// Monta e envia ao shader as posições dos tiros que viram "luz pontual".
// Para não estourar os uniforms nem o custo por pixel, só enviamos os
// MAX_LASERS tiros mais próximos da câmera (ordenados por distância).
function enviarLuzesDeTiro(eye) {
    const tiros = Game.tiros;
    if (!tiros || tiros.length === 0) {
        gl.uniform1i(uLaserCount, 0);
        return;
    }

    // calcula a distância² de cada tiro à câmera e ordena (mais perto primeiro)
    const porDistancia = tiros.map(t => {
        const dx = t.x - eye[0], dy = t.y - eye[1], dz = t.z - eye[2];
        return { t, d2: dx * dx + dy * dy + dz * dz };
    }).sort((a, b) => a.d2 - b.d2);

    const n = Math.min(MAX_LASERS, porDistancia.length);
    const dados = new Float32Array(MAX_LASERS * 3);
    for (let i = 0; i < n; i++) {
        const t = porDistancia[i].t;
        dados[i * 3 + 0] = t.x;
        dados[i * 3 + 1] = t.y;
        dados[i * 3 + 2] = t.z;
    }

    gl.uniform3fv(uLaserPos, dados);
    gl.uniform1i(uLaserCount, n);
}

function desenharEntidadesDeJogo() {

    // tiros (lasers)
    for (const t of Game.tiros) {
        let m = m4.identity();
        m = m4.translate(m, t.x, t.y, t.z);
        laserObj.modelTransform = m;
        drawObject(laserObj);
    }

    // inimigos (giram no próprio eixo para dar vida)
    // Ordem de chamadas: as PRIMEIRAS são aplicadas ao vértice primeiro.
    // Giramos no eixo local e só depois transladamos para a posição no mundo.
    for (const e of Game.inimigos) {
        let m = m4.identity();
        m = m4.yRotate(m, time * 1.5 + e.fase);     // rotação local
        m = m4.translate(m, e.x, e.y, e.z);         // posição no mundo (aplicada por último)
        enemyObj.modelTransform = m;
        drawObject(enemyObj);
    }

    // anéis de bônus (coletáveis): deita o anel de frente e gira
    for (const r of Game.aneis) {
        let m = m4.identity();
        m = m4.xRotate(m, Math.PI / 2);   // deixa o anel "de frente" para a nave
        m = m4.zRotate(m, r.girar);
        m = m4.translate(m, r.x, r.y, r.z);
        ringObj.modelTransform = m;
        drawObject(ringObj);
    }

    // explosões (crescem e somem)
    for (const ex of Game.explosoes) {
        const prog = ex.t / ex.duracao;          // 0 -> 1
        const escala = 0.5 + prog * 1.8;
        let m = m4.identity();
        m = m4.scale(m, escala, escala, escala);
        m = m4.yRotate(m, prog * 6.0);
        m = m4.translate(m, ex.x, ex.y, ex.z);
        explosionObj.modelTransform = m;
        drawObject(explosionObj);
    }
}

// ==================================================
// HUD E TELAS DE JOGO (pontuação, vidas, início/vitória/derrota)
// ==================================================

const elScore   = document.getElementById("scoreBox");
const elMeta    = document.getElementById("metaBox");
const elVidas   = document.getElementById("vidasBox");
const elBoost   = document.getElementById("boostBox");
const elOverlay = document.getElementById("overlay");
const elTitulo  = document.getElementById("overlayTitulo");
const elSub     = document.getElementById("overlaySub");
const elResumo  = document.getElementById("overlayResumo");
const elDica    = document.getElementById("overlayDica");

function atualizarGameHud() {
    if (elScore) elScore.textContent = Game.pontuacao;
    if (elMeta) {
        const vel = Math.round(velocidadeMundoAtual() * 10);   // "km/h" fictício
        elMeta.innerHTML = "Meta: " + Game.config.pontuacaoVitoria +
            " &nbsp;|&nbsp; Vel: " + vel + (boostAtivo() ? " ▲" : "");
    }
    if (elVidas) elVidas.textContent = "♥".repeat(Math.max(0, Game.vidas));
    if (elBoost) {
        if (boostAtivo()) {
            elBoost.textContent = "BOOST!";
            elBoost.style.color = "#ffe066";
        } else if (boostDisponivel()) {
            elBoost.textContent = "BOOST pronto";
            elBoost.style.color = "#7fff9c";
        } else {
            elBoost.textContent = "BOOST recarregando";
            elBoost.style.color = "#888";
        }
    }
}

// mostra/esconde as telas conforme a fase muda
function aoMudarFase(fase) {
    if (!elOverlay) return;

    if (fase === Game.FASE.JOGANDO) {
        elOverlay.classList.add("escondido");
        return;
    }

    elOverlay.classList.remove("escondido");

    if (fase === Game.FASE.PRONTO) {
        elTitulo.textContent = "STAR FOX";
        elTitulo.className = "";
        elSub.innerHTML = "Voe sobre Corneria em alta velocidade. Destrua as naves inimigas " +
            "(vermelhas) e atravesse os anéis dourados para pontuar. <strong>Desvie dos " +
            "prédios</strong> — bater neles custa uma vida! Alcance <strong>" +
            Game.config.pontuacaoVitoria + "</strong> pontos antes de perder suas " +
            Game.config.vidasIniciais + " vidas.";
        elResumo.textContent = "";
        elDica.textContent = "Pressione ENTER para começar";
    }
    else if (fase === Game.FASE.VITORIA) {
        elTitulo.textContent = "VITÓRIA!";
        elTitulo.className = "vitoria";
        elSub.textContent = "Você defendeu Corneria e atingiu a meta de pontuação!";
        elResumo.innerHTML = resumoPartida();
        elDica.textContent = "Pressione R para jogar de novo";
    }
    else if (fase === Game.FASE.DERROTA) {
        elTitulo.textContent = "FIM DE JOGO";
        elTitulo.className = "derrota";
        elSub.textContent = "Sua Arwing foi abatida. Tente novamente!";
        elResumo.innerHTML = resumoPartida();
        elDica.textContent = "Pressione R para reiniciar";
    }
}

function resumoPartida() {
    const s = Game.stats;
    return `Pontuação: <strong>${Game.pontuacao}</strong> &nbsp;|&nbsp; Recorde: ${Game.recorde}<br>` +
           `Inimigos destruídos: ${s.destruidos} &nbsp;|&nbsp; Anéis coletados: ${s.coletados} &nbsp;|&nbsp; ` +
           `Inimigos que escaparam: ${s.escaparam}`;
}

// liga os controles de jogo e a troca de telas
registrarEntradasDeJogo();
Game.onFaseMudou = aoMudarFase;
aoMudarFase(Game.fase);   // desenha a tela inicial

updateHud();
render();
