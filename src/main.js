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

// ---------- MÚLTIPLAS FONTES DE LUZ ----------
// Luz 0 = SOL (direcional)  |  Luz 1 = HOLOFOTE/PONTUAL da cidade
uniform vec3  u_lightDir0;     // direção da luz direcional (do sol para a cena, invertida no cálculo)
uniform vec3  u_lightColor0;   // cor/intensidade do sol
uniform float u_lightOn0;      // 1.0 = ligada, 0.0 = desligada

uniform vec3  u_lightPos1;     // posição da luz pontual
uniform vec3  u_lightColor1;   // cor/intensidade da luz pontual
uniform float u_lightOn1;      // 1.0 = ligada, 0.0 = desligada

uniform vec3  u_ambient;       // luz ambiente geral
uniform float u_fogOn;         // 1.0 = névoa ligada

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

    // ---------- LUZ 1: HOLOFOTE / PONTUAL ----------
    // depende da posição: atenua com a distância (dá para ver de onde vem)
    vec3  toL1 = u_lightPos1 - vWorldPos;
    float dist1 = length(toL1);
    vec3  L1   = toL1 / max(dist1, 0.001);
    float d1   = max(dot(n, L1), 0.0);
    float att1 = 1.0 / (1.0 + 0.015 * dist1 + 0.0025 * dist1 * dist1);
    vec3  h1   = normalize(L1 + toCamera);
    float s1   = pow(max(dot(n, h1), 0.0), 48.0) * 0.6;
    light += u_lightOn1 * att1 * (d1 * u_lightColor1 + s1 * u_lightColor1);

    // ---------- COR BASE DO MATERIAL ----------
    // Quando o objeto tem textura, a cor do pixel vem da imagem amostrada
    // em vTexCoord. A cor por vértice (vColor) é misturada por u_texMix
    // para dar tom (ex.: tingir levemente o metal), e a iluminação é
    // aplicada por cima -> textura + iluminação integradas.
    vec3 base;
    if (u_useTexture > 0.5) {
        vec3 tex = texture(u_texture, vTexCoord).rgb;
        base = mix(tex, tex * vColor, u_texMix);
    } else {
        base = vColor;
    }

    vec3 color = base * light;

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

// --------------------------------------------------------------
// MATRIZ DE PROJEÇÃO PERSPECTIVA
// É aqui que a projeção perspectiva é DEFINIDA (montada).
// Ela é APLICADA no vertex shader: u_projection * u_view * world.
// fovRad = campo de visão vertical; aspect = largura/altura;
// near/far = planos de recorte. O termo -1 na linha 2,3 é o que
// gera a divisão perspectiva (objetos distantes ficam menores).
// --------------------------------------------------------------
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

const uModel      = gl.getUniformLocation(program, "u_model");
const uView       = gl.getUniformLocation(program, "u_view");
const uProjection = gl.getUniformLocation(program, "u_projection");
const uCameraPos  = gl.getUniformLocation(program, "u_cameraPos");

// uniforms de textura
const uTexture    = gl.getUniformLocation(program, "u_texture");
const uUseTexture = gl.getUniformLocation(program, "u_useTexture");
const uTexMix     = gl.getUniformLocation(program, "u_texMix");
gl.uniform1i(uTexture, 0);   // sampler usa a unidade de textura 0

// uniforms de iluminação
const uLightDir0   = gl.getUniformLocation(program, "u_lightDir0");
const uLightColor0 = gl.getUniformLocation(program, "u_lightColor0");
const uLightOn0    = gl.getUniformLocation(program, "u_lightOn0");
const uLightPos1   = gl.getUniformLocation(program, "u_lightPos1");
const uLightColor1 = gl.getUniformLocation(program, "u_lightColor1");
const uLightOn1    = gl.getUniformLocation(program, "u_lightOn1");
const uAmbient     = gl.getUniformLocation(program, "u_ambient");
const uFogOn       = gl.getUniformLocation(program, "u_fogOn");

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

    gl.bindVertexArray(object.vao);
    gl.drawArrays(gl.TRIANGLES, 0, object.count);
}

// ==================================================
// ESCALA E POSIÇÃO DA NAVE NA CENA
// ==================================================

const SHIP_SCALE  = 0.6;
const SHIP_HEIGHT = 3.2;

// ==================================================
// FONTES DE LUZ (estado controlável em tempo de execução)
// ==================================================

const lights = {
    sol: {
        on: true,
        dir: [0.5, 1.0, 0.8],              // direção do sol
        color: [0.95, 0.90, 0.75]          // luz quente de sol
    },
    holofote: {
        on: true,
        pos: [0, 10, 2],                   // segue a nave (atualizado no loop)
        color: [0.35, 0.65, 1.00]          // luz azulada de holofote
    },
    ambient: [0.22, 0.24, 0.30],
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
let camMode = 0;

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

        case "Space":
            e.preventDefault();
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
        `<strong>Holofote [X]:</strong> ${lights.holofote.on ? "ON" : "OFF"} &nbsp;|&nbsp; ` +
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

function render() {

    time += 0.016;

    if (autoRotate && camMode === 0) {
        camYaw += 0.006;
    }

    // ---- Nave (posição no mundo) ----
    const altura = SHIP_HEIGHT + 0.15 * Math.sin(time * 1.5);
    const inclinacao = 0.12 * Math.sin(time * 0.9);

    let m = m4.identity();
    m = m4.scale(m, SHIP_SCALE, SHIP_SCALE, SHIP_SCALE);
    m = m4.zRotate(m, inclinacao);
    m = m4.translate(m, 0, altura, 0);
    arwing.modelTransform = m;

    const naveWorld = [0, altura * SHIP_SCALE, 0];

    // holofote acompanha a nave, um pouco acima
    lights.holofote.pos = [naveWorld[0], naveWorld[1] + 6.0, naveWorld[2] + 2.0];

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

    gl.uniform3fv(uLightPos1,   lights.holofote.pos);
    gl.uniform3fv(uLightColor1, lights.holofote.color);
    gl.uniform1f(uLightOn1,     lights.holofote.on ? 1.0 : 0.0);

    gl.uniform3fv(uAmbient, lights.ambient);
    gl.uniform1f(uFogOn,    lights.fog ? 1.0 : 0.0);

    drawObject(ground);
    drawObject(road);
    drawObject(buildings);
    drawObject(shadow);
    drawObject(arwing);

    requestAnimationFrame(render);
}

updateHud();
render();
