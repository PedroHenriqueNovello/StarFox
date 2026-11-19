# Star Fox 3D — Arwing sobrevoando Corneria

Projeto acadêmico desenvolvido em WebGL 2 puro, com JavaScript e shaders GLSL ES 3.00. O jogo coloca o jogador no controle de uma nave Arwing em um cenário 3D inspirado na cidade de Corneria, com obstáculos, naves inimigas, lasers, anéis coletáveis, iluminação dinâmica e diferentes câmeras de visualização.

## Sobre o jogo

O objetivo é pilotar a Arwing pelo corredor de voo, destruir naves inimigas, coletar anéis e alcançar a meta de pontuação antes de perder todas as vidas. O cenário avança continuamente em direção ao jogador, exigindo movimentação, disparos e desvios constantes.

A versão atual inclui um caça inimigo low-poly, lasers com emissão própria e iluminação de curto alcance, horizonte mais distante, sistema de boost e névoa com ambientação diurna e noturna. Quando o Sol é desligado, a névoa e o fundo da cena assumem uma tonalidade azul-escura.

## Tecnologias

- WebGL 2
- JavaScript
- GLSL ES 3.00
- HTML5 Canvas
- Texturas PNG e coordenadas UV
- Matrizes de transformação 4×4 implementadas no projeto

O projeto não utiliza Three.js, Babylon.js ou outra engine 3D externa.

## Como executar

Abra o arquivo `src/index.html` utilizando o Live Server do VS Code ou outro servidor HTTP local.

Com Python, por exemplo:

```bash
python3 -m http.server 8000
```

Depois, acesse no navegador:

```text
http://localhost:8000/src/index.html
```

É necessário utilizar um navegador com suporte a WebGL 2.

## Controles

| Tecla | Ação |
|---|---|
| Setas ou `W A S D` | Movimentação da nave |
| `Espaço` ou `J` | Disparo de lasers |
| `Shift` | Boost e esquiva temporária |
| `Enter` | Iniciar a partida |
| `R` | Reiniciar após vitória ou derrota |
| `1` | Câmera orbital |
| `2` | Câmera de perseguição |
| `3` | Câmera fixa na torre |
| `4` | Visão superior |
| `C` | Alternar entre as câmeras |
| `Z` | Ligar ou desligar o Sol |
| `X` | Ligar ou desligar o farol da nave |
| `F` | Ligar ou desligar a névoa |

## Pontuação e regras

- Destruir uma nave inimiga: **+100 pontos**.
- Coletar um anel dourado: **+75 pontos**.
- Deixar uma nave inimiga escapar: **−25 pontos**.
- Colidir com um inimigo ou prédio: perda de uma vida.
- A nave começa com **3 vidas**.
- A meta de vitória é de **3.000 pontos**.
- Ao perder todas as vidas, a partida termina em derrota.

O HUD apresenta a pontuação, a meta, a velocidade, as vidas, o estado do boost, o estado do Sol, o farol e a névoa.

## Organização do projeto

```text
src/
├── index.html              # Interface, canvas, HUD e telas do jogo
├── main.js                 # Renderização, shaders, câmeras e iluminação
├── game.js                 # Regras, controles, colisões e pontuação
├── gameGeometry.js         # Geometria das entidades do jogo
├── arwingGeometry.js       # Geometria da Arwing
├── sceneGeometry.js        # Geometria do cenário
├── textures.js             # Texturas embutidas
└── m4.js                   # Operações com matrizes 4×4

textures/                   # Texturas PNG utilizadas na cena
tools/                      # Ferramentas de geração de texturas
documents/                  # Relatórios e planejamento do projeto
screenshots/                # Registros visuais da execução
```

## Documentação

- [Relatório de jogabilidade, interação e pontuação](documents/RELATORIO_JOGABILIDADE_GITHUB.md)
- [Relatório de melhorias de iluminação, inimigos e horizonte](documents/RELATORIO_MELHORIAS_ILUMINACAO_INIMIGOS_HORIZONTE.md)
- [Relatório de texturas e materiais](documents/RELATORIO_TEXTURAS.md)

## Integrantes

- **Henrique Rodrigues Ribeiro**
- **Letícia Abrahão Moreira**
- **Lucas Alves Gazale**
- **Nícolas Marcelo Estevam de Jesus Cabanas**
- **Pedro Henrique Novello D’Elia Porto de Almeida**

## Créditos acadêmicos

Projeto desenvolvido para a disciplina de Computação Gráfica, com foco na aplicação de transformações geométricas, projeção perspectiva, iluminação, texturização, interação, colisões e regras de jogo em WebGL 2.
