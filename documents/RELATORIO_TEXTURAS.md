# Relatório 4 – Star Fox 3D: Texturas e Materiais

**Projeto:** Star Fox 3D – Arwing sobrevoando Corneria
**Integrantes:** Henrique Rodrigues Ribeiro (176515); Letícia Abrahão Moreira (176559); Lucas Alves Gazale (176565); Nícolas Marcelo Estevam de Jesus Cabanas (176625); Pedro Henrique Novello D'Elia Porto de Almeida (176620)
**Data:** 11/11/2026

## 1. Objetivo desta entrega

Esta entrega acrescenta **texturas e materiais** à cena 3D desenvolvida nas entregas anteriores. O projeto mantém a nave Arwing, o cenário de Corneria, as quatro câmeras, a projeção perspectiva e as fontes de iluminação já implementadas. A principal evolução é substituir a aparência baseada somente em cor por vértice por superfícies texturizadas, com coordenadas UV e integração com a iluminação.

O projeto foi implementado em **WebGL 2 puro**, com JavaScript e shaders GLSL ES 3.00 escritos manualmente, sem Three.js ou Babylon.js.

## 2. Evolução em relação à entrega anterior

A entrega anterior implementava a cena, as câmeras, a projeção perspectiva e a iluminação. O relatório anterior registrava como concluídos: quatro modos de câmera, troca em tempo de execução, Sol direcional, holofote pontual com atenuação, luz ambiente e névoa.

Nesta entrega, esses recursos foram preservados. A alteração concentra-se na camada visual:

| Aspecto | Entrega anterior | Esta entrega |
| --- | --- | --- |
| Superfícies | Cores sólidas por vértice | Texturas aplicadas aos objetos |
| Coordenadas UV | Não utilizadas | UV por vértice em todas as malhas texturizadas |
| Materiais | Cor + iluminação | Textura, cor de material e iluminação |
| Pista | Geometria e cor | Textura de asfalto com bordas e faixa |
| Cenário | Gramado, montanhas e torres coloridos | Gramado, torres e pista texturizados |
| Nave | Modelo com cores facetadas | Atlas de metal mapeado por partes |
| Arquivos novos | — | Quatro PNGs, `textures.js`, gerador e documentação |

Portanto, a entrega atual não substitui a anterior: ela adiciona o requisito de texturas e materiais sobre a base já funcional.

## 3. Arquivos entregues

| Arquivo/pasta | Função |
| --- | --- |
| `index.html` | Página, canvas 800×600, legenda e HUD |
| `main.js` | Shaders, texturas, iluminação, câmeras e renderização |
| `m4.js` | Operações com matrizes 4×4 |
| `arwingGeometry.js` | Geometria da nave e geração de UVs |
| `sceneGeometry.js` | Geometria do chão, pista, montanhas e torres |
| `textures.js` | Texturas embutidas como data URL base64 |
| `textures/*.png` | Arquivos de imagem usados nas texturas |
| `tools/generateTextures.js` | Geração procedural dos PNGs e do `textures.js` |
| `screenshots/` | Registros visuais da execução |

Os PNGs originais devem permanecer na entrega mesmo com a existência de `textures.js`, pois a professora solicitou os arquivos de imagem utilizados como texturas.

## 4. Aplicação de múltiplas texturas

Foram utilizadas quatro texturas diferentes, excedendo o mínimo de três exigido:

| Textura | Arquivo e dimensão | Objeto aplicado | Função visual |
| --- | --- | --- | --- |
| Metal | `textures/metal.png` – 512×512 | Arwing | Fuselagem, asas, aletas e turbina |
| Grama | `textures/grass.png` – 256×256 | Chão | Cobertura do terreno |
| Estrada | `textures/road.png` – 256×256 | Pista de voo | Asfalto, bordas ciano e faixa central |
| Edificação | `textures/building.png` – 256×256 | Torres | Concreto e janelas iluminadas |

A associação é feita em `main.js`:

```javascript
const ground    = createSceneObject(createGround(),    { texture: TEX.grass,    texMix: 0.15 });
const road      = createSceneObject(createRoad(),      { texture: TEX.road,     texMix: 0.0  });
const buildings = createSceneObject(createBuildings(), { texture: TEX.building, texMix: 0.35 });
const arwing    = createSceneObject(createArwing(),    { texture: TEX.metal,    texMix: 0.5  });
```

O parâmetro `texMix` permite preservar cores importantes do modelo, como as aletas azuis e o bocal traseiro alaranjado, sem remover o padrão do metal.

![Câmera orbital com grama, pista, torres e montanhas texturizadas](https://private-us-east-1.manuscdn.com/sessionFile/41mEVq54X3fjnr9f9uhobo/sandbox/WO7iSkikViMnaGXrgMNAVW-images_1794444640623_na1fn_L2hvbWUvdWJ1bnR1L3dvcmsvU3RhckZveF9yZWxhdG9yaW9fZmluYWwvYXNzZXRzL2NhbTFfb3JiaXRhbA.png?Expires=1794617442&Signature=MEUCIQD-ovRWv40eflr8GkZKkGHX6hzU~xQGx1s9cXlZFWobDQIgHzpn74tyniQAGU22lpzOUeYk~lBOD7GNoE4L6iSj99Q_&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figura 1 – Visão orbital da cena com múltiplas texturas.*

## 5. Mapeamento de texturas e coordenadas UV

A exigência da proposta diz: **“Apresentar as coordenadas de textura (coordenadas UV) utilizadas nos modelos”** e **“Demonstrar o resultado do mapeamento nos objetos 3D”**. Por isso, esta seção documenta tanto as coordenadas presentes no código quanto o resultado visual na cena.

UV é um par de coordenadas `(u, v)` que indica qual ponto da imagem deve ser consultado em cada vértice. `u` representa a posição horizontal da imagem e `v` a posição vertical. Essas coordenadas não são posições 3D; elas são o vínculo entre a superfície do modelo e a imagem da textura.

No projeto, o `MeshBuilder` armazena as coordenadas por vértice:

```javascript
this.uvs.push(uv[i][0], uv[i][1]);
```

Depois, elas são enviadas para o atributo do shader:

```javascript
createAttribute("aTexCoord", mesh.uvs, 2);
```

E interpoladas até o fragment shader:

```
in vec2 aTexCoord;
out vec2 vTexCoord;

vTexCoord = aTexCoord;
vec3 tex = texture(u_texture, vTexCoord).rgb;
```

### 5.1 Estratégias de mapeamento utilizadas

- No gramado, `uvScale = 26`, fazendo a textura repetir em um terreno grande em vez de ficar esticada.

- Na pista, `U` varia de 0 a 1 na largura e `V` se repete aproximadamente 20 vezes no comprimento. Assim as bordas e os tracejados mantêm proporção.

- Nas torres, a coordenada vertical se repete conforme a quantidade aproximada de andares.

- Na nave, o arquivo `metal.png` funciona como um atlas. Regiões diferentes são reservadas à fuselagem, asas, aletas e área lisa.

![Atlas UV da textura de metal com as regiões usadas na nave](https://private-us-east-1.manuscdn.com/sessionFile/41mEVq54X3fjnr9f9uhobo/sandbox/WO7iSkikViMnaGXrgMNAVW-images_1794444640623_na1fn_L2hvbWUvdWJ1bnR1L3dvcmsvU3RhckZveF9yZWxhdG9yaW9fZmluYWwvYXNzZXRzL3V2X2F0bGFzX21ldGFs.png?Expires=1794617442&Signature=MEQCIHBrCixddSbs8f~q9C-zWLfivqKxC3-9l5HcsQunHcJ5AiAfgZW-A0zRyXzM77r05YtnhXxfw-oq~ll5LZD71EJ7WA__&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figura 2 – Atlas UV de **`metal.png`**. As regiões coloridas correspondem às áreas utilizadas por partes diferentes da Arwing.*

```javascript
const ATLAS = {
    fuse:  { u0: 0.02, v0: 0.02, u1: 0.48, v1: 0.48 },
    wing:  { u0: 0.52, v0: 0.02, u1: 0.98, v1: 0.48 },
    fin:   { u0: 0.02, v0: 0.52, u1: 0.48, v1: 0.98 },
    smooth:{ u0: 0.52, v0: 0.52, u1: 0.98, v1: 0.98 },
};
```

O resultado é demonstrado nas capturas da nave e nas quatro câmeras. As imagens mostram que a textura acompanha a geometria, que a pista não fica borrada e que as torres apresentam repetição coerente de janelas.

![Nave Arwing com o atlas de metal aplicado](https://private-us-east-1.manuscdn.com/sessionFile/41mEVq54X3fjnr9f9uhobo/sandbox/WO7iSkikViMnaGXrgMNAVW-images_1794444640623_na1fn_L2hvbWUvdWJ1bnR1L3dvcmsvU3RhckZveF9yZWxhdG9yaW9fZmluYWwvYXNzZXRzL25hdmVfbWV0YWw.png?Expires=1794617442&Signature=MEUCIHcZyqfv~b5kvN4XiEY3bojyALSnLHXMw0Yj3uLjJXQIAiEAlOUpkQTl~B0fHvWFk-ARsptKIIV4VZBYQPJLQxRYCX4_&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figura 3 – Detalhe da nave com textura metálica aplicada à fuselagem, asas e aletas.*

## 6. Integração com a iluminação

As fontes da entrega anterior foram mantidas:

- **Sol:** luz direcional quente, controlada pela tecla `Z`.

- **Holofote:** luz pontual azulada, com atenuação e posição que acompanha a nave, controlada pela tecla `X`.

- **Luz ambiente:** evita que as superfícies fiquem completamente pretas.

- **Névoa:** mistura objetos distantes com o céu, controlada pela tecla `F`.

A textura é amostrada e depois recebe a iluminação no fragment shader:

```
vec3 base;
if (u_useTexture > 0.5) {
    vec3 tex = texture(u_texture, vTexCoord).rgb;
    base = mix(tex, tex * vColor, u_texMix);
} else {
    base = vColor;
}

vec3 color = base * light;
```

Assim é possível perceber simultaneamente o padrão da textura e a contribuição das luzes. Ao desligar o Sol, a cena escurece; ao desligar o holofote, desaparece o realce azulado próximo à nave; ao desligar a névoa, os objetos distantes ficam mais nítidos.

![Câmera de perseguição demonstrando perspectiva e iluminação](https://private-us-east-1.manuscdn.com/sessionFile/41mEVq54X3fjnr9f9uhobo/sandbox/WO7iSkikViMnaGXrgMNAVW-images_1794444640623_na1fn_L2hvbWUvdWJ1bnR1L3dvcmsvU3RhckZveF9yZWxhdG9yaW9fZmluYWwvYXNzZXRzL2NhbTJfcGVyc2VndWljYW8.png?Expires=1794617442&Signature=MEUCIQCPxxAscX3iuYm7zpEFvbzCIbjUVC3hGeYmsD9EfL8jcAIgGFtYcOahUggk7FhGASXoxgbBv1YYQWZ-MJFWjr9OaYs_&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figura 4 – Câmera de perseguição com pista, torres e iluminação integradas.*

## 7. Execução e demonstração técnica

O projeto foi testado pelo grupo em navegador com suporte a WebGL 2. A execução pode ser feita abrindo `index.html`, embora seja recomendado usar o Live Server do VS Code para manter uma execução consistente.

Roteiro sugerido:

1. Abrir `index.html` pelo Live Server.

1. Usar a câmera `1` para mostrar a cena completa.

1. Usar a câmera `4` e o zoom para evidenciar a textura metálica da nave.

1. Usar a câmera `2` para destacar a pista convergindo em perspectiva.

1. Pressionar `Z` e `X` para comparar a contribuição do Sol e do holofote.

1. Pressionar `F` para demonstrar a névoa.

1. Explicar a Figura 2 e mostrar no código as regiões UV do atlas.

![Vista de cima com pista, gramado e nave](https://private-us-east-1.manuscdn.com/sessionFile/41mEVq54X3fjnr9f9uhobo/sandbox/WO7iSkikViMnaGXrgMNAVW-images_1794444640623_na1fn_L2hvbWUvdWJ1bnR1L3dvcmsvU3RhckZveF9yZWxhdG9yaW9fZmluYWwvYXNzZXRzL2NhbTRfc3VwZXJpb3I.png?Expires=1794617442&Signature=MEYCIQCxFNau0heSuVotCNBjLsXxUA68lxvtm-EXKxfs-VaUfAIhAMnYveQvLKvOJkRGiC288FGVZqQcun7SnyiMLUtAWfhy&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figura 5 – Visão superior para observar o mapeamento do chão, da pista e da nave.*
