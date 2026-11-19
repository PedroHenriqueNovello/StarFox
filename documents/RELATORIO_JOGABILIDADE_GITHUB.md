# Relatório — Jogabilidade, interação e pontuação

**Projeto:** Star Fox 3D – Arwing sobrevoando Corneria  
**Tecnologia:** WebGL 2 puro, JavaScript e GLSL ES 3.00  
**Data:** 19/11/2026

## 1. Objetivo desta entrega

Este relatório documenta as mecânicas de jogabilidade, os controles, as interações com o cenário, o sistema de pontuação e as condições de vitória e derrota do projeto **Star Fox 3D**.

A versão atual permite controlar a nave Arwing em um cenário 3D, desviar de prédios, enfrentar naves inimigas, disparar lasers, coletar anéis, utilizar um impulso de esquiva e acompanhar visualmente a pontuação, as vidas e o progresso da partida.

Também foi concluída a melhoria prevista no documento `documents/planejamento_futuro.md`: quando o Sol é desligado pela tecla `Z`, a névoa e o fundo da cena assumem uma tonalidade azul-escura, reforçando o aspecto noturno.

O projeto continua sendo executado em **WebGL 2 puro**, sem o uso de Three.js, Babylon.js ou outra engine 3D externa.

## 2. Arquivos relacionados às mecânicas

| Arquivo | Responsabilidade |
|---|---|
| `src/index.html` | Canvas, HUD, instruções de controle e telas de início, vitória e derrota |
| `src/game.js` | Estado da partida, controles, movimentação, spawns, colisões, pontuação e regras de término |
| `src/main.js` | Renderização, câmeras, iluminação, névoa, HUD auxiliar e envio dos dados para os shaders |
| `src/gameGeometry.js` | Geometria da nave inimiga, lasers, anéis e demais entidades visuais |
| `src/sceneGeometry.js` | Geometria do chão, pista, prédios e cenário |
| `src/m4.js` | Operações matemáticas com matrizes de transformação |
| `documents/planejamento_futuro.md` | Planejamento das melhorias visuais e de iluminação |

---

## 3. Movimentação e controles

### 3.1 Movimentação da Arwing

A nave é controlada nos eixos horizontal e vertical enquanto o cenário se desloca automaticamente para criar a sensação de voo para frente.

- **Setas esquerda/direita** ou **A/D**: movimentação lateral.
- **Setas para cima/baixo** ou **W/S**: movimentação vertical.
- A nave permanece dentro dos limites do corredor de voo por meio de limites de posição em X e Y.
- A inclinação visual da nave acompanha a movimentação lateral e vertical, deixando a resposta visual mais próxima de uma aeronave.

A velocidade do cenário é controlada por `velocidadeMundo`. Dessa forma, o jogador pilota a nave desviando dos elementos que se aproximam, sem precisar controlar diretamente o avanço em Z.

### 3.2 Disparo

- **Espaço** ou **J**: dispara os lasers.
- Cada ação de disparo cria dois tiros, um de cada lado da nave.
- Os tiros avançam pelo cenário e são removidos quando ultrapassam o alcance definido.
- O contador interno registra a quantidade de disparos realizados.

Os lasers também receberam uma melhoria visual: até seis tiros mais próximos da câmera podem contribuir como fontes pontuais de luz, iluminando o chão e os prédios ao redor. O próprio laser possui emissão de luz, portanto continua visível mesmo quando o Sol está desligado.

### 3.3 Impulso e esquiva

- **Shift**: ativa o boost quando ele está disponível.
- O boost possui duração e tempo de recarga.
- Durante o boost, a nave executa uma rotação visual de esquiva, o cenário acelera e a nave fica protegida de colisões que normalmente causariam perda de vida.
- O HUD informa se o boost está pronto, ativo ou recarregando.

### 3.4 Início e reinício

- **Enter**: inicia a partida na tela inicial.
- **R**: reinicia a partida depois de uma vitória ou derrota.

Ao reiniciar, a pontuação, as vidas, os tiros, os inimigos, os anéis, as explosões e o estado do cenário são restaurados para os valores iniciais.

### 3.5 Câmeras e iluminação

Os controles auxiliares são:

- **1**: câmera orbital.
- **2**: câmera de perseguição.
- **3**: câmera fixa na torre.
- **4**: visão superior.
- **C**: alterna entre as câmeras.
- **Z**: liga ou desliga o Sol.
- **X**: liga ou desliga o farol da nave.
- **F**: liga ou desliga a névoa.

---

## 4. Interações e regras do jogo

### 4.1 Inimigos

As naves inimigas surgem à frente do jogador e avançam em direção à Arwing. Elas realizam um leve movimento lateral, dificultando a mira.

O modelo visual foi atualizado de um octaedro vermelho para um caça hostil low-poly, com:

- Fuselagem pontuda.
- Asas laterais.
- Aletas verticais.
- Cores vermelha e laranja para indicar perigo.
- Orientação voltada para a nave do jogador.

### 4.2 Tiro contra inimigo

Quando um laser colide com uma nave inimiga:

1. O inimigo é destruído.
2. O tiro é consumido.
3. Uma explosão visual é criada.
4. O jogador recebe pontos.
5. O contador de inimigos destruídos é atualizado.

A colisão é calculada por volumes esféricos, comparando a distância entre os centros das entidades com a soma dos seus raios de colisão.

### 4.3 Inimigo que escapa

Se uma nave inimiga passa pela posição da nave do jogador sem ser destruída, ela é considerada uma fuga.

Nesse caso:

- O contador de inimigos que escaparam aumenta.
- O jogador perde **25 pontos**.
- A pontuação nunca fica abaixo de zero.

Essa penalidade aumenta a importância de destruir os inimigos antes que eles atravessem o corredor de voo.

### 4.4 Colisão entre nave e inimigo

Se a Arwing colidir com um inimigo:

- A nave inimiga é removida.
- Uma explosão visual é criada.
- O jogador perde uma vida.
- Durante o boost, a colisão funciona como uma esquiva e não causa perda de vida.

### 4.5 Anéis coletáveis

Anéis dourados surgem no caminho da nave e podem ser coletados por proximidade.

Ao atravessar um anel:

- O anel é removido.
- O contador de anéis coletados aumenta.
- O jogador recebe **75 pontos**.

### 4.6 Prédios e obstáculos

Os prédios fazem parte do cenário e também funcionam como obstáculos. Eles aparecem dos dois lados e em partes do corredor de voo, sendo reciclados para a frente do cenário para manter a sensação de um percurso contínuo.

Quando a nave colide com um prédio:

- O jogador perde uma vida.
- Uma explosão visual é criada.
- É ativada uma janela de invulnerabilidade de aproximadamente um segundo, evitando várias perdas consecutivas na mesma colisão.
- Durante o boost, a colisão não causa dano.

---

## 5. Sistema de pontuação

A pontuação é armazenada em `Game.pontuacao` e é atualizada durante a partida conforme as ações do jogador e os acontecimentos do cenário.

| Ação ou acontecimento | Pontuação |
|---|---:|
| Destruir uma nave inimiga | +100 |
| Coletar um anel | +75 |
| Deixar uma nave inimiga escapar | −25 |
| Colidir com prédio ou inimigo | Perde vida, sem desconto direto de pontos |

A pontuação aparece no HUD sobre o canvas. O mesmo HUD apresenta a meta de vitória, a velocidade, o estado do boost e a quantidade de vidas restantes.

A pontuação também influencia a dificuldade: conforme o jogador acumula pontos, o intervalo de surgimento dos inimigos diminui até um limite, fazendo com que a partida fique progressivamente mais difícil.

A meta de vitória foi ajustada de **1.500 para 3.000 pontos**.

---

## 6. Condições de vitória e derrota

### 6.1 Vitória

A partida termina em vitória quando:

```javascript
Game.pontuacao >= Game.config.pontuacaoVitoria
```

Na configuração atual, o jogador precisa atingir **3.000 pontos**.

Ao alcançar a meta:

- A fase muda para `VITORIA`.
- A tela exibe a mensagem **“VITÓRIA!”**.
- É apresentado um resumo da pontuação e das estatísticas da partida.
- O jogador pode pressionar **R** para iniciar uma nova partida.

### 6.2 Derrota

A partida termina em derrota quando o jogador perde todas as vidas:

```javascript
Game.vidas <= 0
```

Na configuração atual, a Arwing começa com **3 vidas**.

Ao perder todas as vidas:

- A fase muda para `DERROTA`.
- A tela exibe **“FIM DE JOGO”**.
- São mostradas a pontuação, o recorde, os inimigos destruídos, os anéis coletados e os inimigos que escaparam.
- O jogador pode pressionar **R** para reiniciar.

---

## 7. Atualização da névoa escura

O documento `documents/planejamento_futuro.md` previa que a névoa deveria ficar escura quando o Sol estivesse desligado. Essa funcionalidade foi implementada em `src/main.js`.

No fragment shader, são usadas duas cores:

```glsl
vec3 daySkyColor = vec3(0.46, 0.70, 0.92);
vec3 nightSkyColor = vec3(0.02, 0.04, 0.10);
vec3 skyColor = mix(nightSkyColor, daySkyColor, u_lightOn0);
```

O valor de `u_lightOn0` representa o estado do Sol:

- `1.0`: Sol ligado, usando o céu azul-claro.
- `0.0`: Sol desligado, usando o céu azul-escuro.

Além da cor da névoa, a cor de limpeza do canvas também acompanha o estado do Sol. Isso evita que os objetos fiquem escuros enquanto o fundo permanece azul-claro.

A tecla **F** continua controlando se a névoa está ligada ou desligada. Portanto, o comportamento final é:

| Sol | Névoa | Resultado |
|---|---|---|
| Ligado | Ligada | Céu e horizonte azul-claros |
| Desligado | Ligada | Céu e horizonte azul-escuros |
| Ligado ou desligado | Desligada | Névoa não é aplicada |

---

## 8. Registros das atualizações recentes

As capturas a seguir foram obtidas durante os testes da versão atual do projeto. Elas registram visualmente as alterações descritas neste relatório.

![Cena durante a partida com a névoa ligada e o Sol desligado](captura_jogo_nevoa_sol_off.png)

*Figura 6 – Cena durante a partida com `Sol [Z]: OFF` e `Névoa [F]: ON`. A imagem mostra o cenário escurecido, a Arwing e uma nave inimiga no percurso, permitindo observar a interação entre a nave do jogador, os inimigos e o ambiente.*

![Tela de fim de jogo](captura_fim_de_jogo.png)

*Figura 7 – Tela de derrota após a perda das vidas. O jogo apresenta uma indicação clara de término e permite reiniciar pressionando `R`.*

As imagens também servem como evidência da execução da versão jogável. Para uma comparação mais completa da névoa, recomenda-se gravar no vídeo uma sequência curta com o Sol ligado e outra com o Sol desligado, mantendo a câmera e a posição da nave semelhantes.

---

## 9. Roteiro para a demonstração em vídeo

O vídeo pode seguir esta sequência:

1. Abrir `src/index.html` usando um servidor local, como o Live Server do VS Code.
2. Mostrar a tela inicial e pressionar **Enter**.
3. Demonstrar a movimentação usando as setas ou **W A S D**.
4. Disparar usando **Espaço** ou **J**.
5. Destruir uma nave inimiga e mostrar o aumento da pontuação.
6. Deixar um inimigo escapar e mostrar a penalidade de 25 pontos.
7. Coletar um anel e mostrar o aumento de 75 pontos.
8. Usar **Shift** para demonstrar o boost e a esquiva.
9. Colidir com um prédio ou inimigo para demonstrar a perda de vida.
10. Mostrar o HUD com pontuação, meta e vidas.
11. Pressionar **Z** com a névoa ligada e demonstrar a transição do céu claro para o azul-escuro.
12. Continuar a partida até demonstrar a tela de derrota ou, caso seja possível, atingir os 3.000 pontos para demonstrar a vitória.
13. Pressionar **R** para demonstrar o reinício da partida.

---

## 10. Como executar

A execução pode ser feita com um servidor local:

```bash
cd StarFox
python3 -m http.server 8000
```

Em seguida, abrir no navegador:

```text
http://localhost:8000/src/index.html
```

Também é possível abrir `src/index.html` pelo Live Server do VS Code.

Os arquivos-fonte e os recursos necessários estão distribuídos nas pastas:

- `src/`
- `textures/`
- `screenshots/`
- `tools/`
- `documents/`

---

## 11. Verificação final

A implementação atende aos requisitos descritos pela professora:

- Controles de movimentação implementados.
- Disparo, boost e esquiva implementados.
- Coleta de objetos implementada.
- Colisões entre nave, inimigos, anéis e prédios implementadas.
- Consequências das colisões e fugas implementadas.
- Sistema de pontuação visível e atualizado durante a partida.
- Condições de vitória e derrota implementadas.
- Telas de início, vitória e derrota implementadas.
- Reinício da partida implementado.
- Névoa escura quando o Sol está desligado implementada.
- Projeto jogável e preparado para demonstração em vídeo.

Antes da entrega, recomenda-se atualizar o relatório anterior de melhorias para remover a observação de que a névoa escura ainda não havia sido implementada.
