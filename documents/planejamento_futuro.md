# Planejamento futuro — Melhorias de iluminação e design

Este documento registra as mudanças planejadas para as próximas entregas do
Star Fox 3D. Nada aqui está implementado ainda — é um guia para os próximos
membros. Cada item traz **o que é**, **por que**, **onde mexer** e **cuidados**.

---

## 1. Tiros iluminados (laser como fonte de luz)

### O que é
Fazer cada tiro emitir luz ao redor de si, iluminando o chão/prédios próximos.
Assim, com o **Sol desligado** (tecla Z), os disparos "acendem" o caminho à frente,
reforçando o clima noturno.

### Por que
Hoje o tiro só tem cor própria (verde brilhante por `vColor`), mas não ilumina
nada em volta. Com o Sol off e a ambiente baixa, a cena fica escura e o tiro
poderia funcionar como uma luz dinâmica curta — além de bonito, ajuda o jogador
a enxergar.

### Onde mexer
- **Shader (fragment) em `main.js`**: hoje há duas luzes (`u_light*0` = Sol,
  `u_light*1` = farol). O caminho mais simples é adicionar **uma luz pontual de
  tiro** (sem cone, com atenuação por distância, igual ao holofote antigo antes
  de virar spotlight). Sugestão de uniforms novos:
  - `uniform vec3 u_laserPos[N];` (posições dos tiros mais próximos)
  - `uniform vec3 u_laserColor;` (cor do laser, ex.: verde)
  - `uniform int  u_laserCount;` (quantos tiros ativos enviar)
  Some a contribuição de cada tiro ao `light` com atenuação
  `att = 1.0 / (1.0 + a*d + b*d*d)`, como já é feito na luz 1 original.
- **`main.js` (loop de render)**: antes de desenhar a cena, montar o array de
  posições dos tiros a partir de `Game.tiros` (limitar a `N`, ex.: 4–8 tiros mais
  próximos da câmera para não estourar uniforms) e enviar via
  `gl.uniform3fv`/`gl.uniform1i`.
- **Opcional (brilho do próprio tiro)**: para o laser não "apagar" quando o Sol
  está off, garanta que a cor base dele não dependa só da luz — ex.: adicionar um
  termo de emissão (`emissive`) no shader para objetos marcados como "luminosos"
  (`object.emissive = true`), somando a cor direto no resultado final:
  `color += emissiveColor;`.

### Cuidados
- **Limite de uniforms**: arrays grandes de luzes pesam. Enviar só os tiros mais
  próximos da nave/câmera (ordenar por distância e cortar em `N`).
- **Custo por fragmento**: cada luz extra roda para todo pixel. Manter `N` baixo.
- **Coerência com o farol**: se o farol (luz 1) já estiver ligado, as luzes de
  tiro devem apenas somar, nunca substituir.

---

## 2. Novo design dos inimigos

### O que é
Trocar o modelo atual do inimigo (um "diamante"/octaedro vermelho em
`createEnemy()`) por algo mais caracterizado — por exemplo uma nave inimiga com
asas, uma cor/emissão de alerta, ou um caça estilo Star Fox.

### Por que
O octaedro é um placeholder reconhecível, mas pouco expressivo. Um modelo melhor
valoriza a cena e a jogabilidade (fica mais claro que é um alvo hostil).

### Onde mexer
- **`gameGeometry.js` → `createEnemy()`**: reconstruir a malha usando o
  `MeshBuilder` (mesmos métodos `tri`, `quad`, `prism` já usados na Arwing em
  `arwingGeometry.js`). Dá para espelhar a estrutura da `createArwing()`
  (corpo + asas + aletas) com proporções/cores diferentes.
- **Textura (opcional)**: se quiser inimigo texturizado, criar/escolher uma
  textura (padrão de `textures.js`/`tools/generateTextures.js`) e passar
  `{ texture, texMix }` ao criar `enemyObj` em `main.js`
  (`const enemyObj = createSceneObject(createEnemy(), { texture: ..., texMix: ... })`).
- **Colisão**: a lógica de colisão usa `raioInimigo` (esfera) em `game.js`. Se o
  novo modelo mudar muito de tamanho, ajustar `GAME_CONFIG.raioInimigo` para o
  novo raio aproximado. **Não** é preciso mexer na detecção em si.
- **Animação**: hoje o inimigo gira no eixo Y em `desenharEntidadesDeJogo()`. Se o
  novo design tiver "frente" clara, talvez convenha apontá-lo para +Z (direção da
  nave) em vez de girar — ajustar essa parte do desenho.

### Cuidados
- **Eixos**: seguir a convenção do projeto — nariz para **-Z**, topo **+Y**,
  asas em **±X** (igual à Arwing). O inimigo avança em **+Z** (vem em direção à
  nave), então "virado para a nave" = nariz para +Z.
- **Contagem de vértices**: manter low-poly; são muitos inimigos simultâneos.
- **Cor de alerta**: usar `u_colorTint` ou `vColor` para manter o vermelho/laranja
  de "hostil", facilitando o jogador identificar o alvo.

---

## 3. Névoa escura quando o Sol está desligado

### O que é
Hoje a névoa (tecla F) sempre mistura o distante com uma cor de **céu azul claro**
(`skyColor` fixa no shader). A ideia é: quando o **Sol está desligado**, a névoa
deve ser **escura** (quase preta/azul-noite), escondendo os limites do mapa e
reforçando o clima noturno. Com o Sol ligado, mantém o céu claro de dia.

### Por que
Com o Sol off, a cena fica escura mas a névoa clara ainda "revela" o horizonte e
as bordas do cenário (onde os prédios reciclam, o fim do chão etc.). Uma névoa
escura disfarça esses limites e combina com a iluminação de farol.

### Onde mexer
- **Shader (fragment) em `main.js`**: a cor da névoa é fixa:
  ```glsl
  vec3 skyColor = vec3(0.46, 0.70, 0.92);
  color = mix(color, skyColor, fog);
