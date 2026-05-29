# 🌍 GeoStrike

> **FPS single-player com mapas reais do OpenStreetMap — cada missão acontece numa cidade diferente do mundo.**

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16-brightgreen?logo=node.js)
![Three.js](https://img.shields.io/badge/Three.js-r128-black?logo=three.js)
![OpenStreetMap](https://img.shields.io/badge/Mapas-OpenStreetMap-7EBC6F?logo=openstreetmap)
![Licença](https://img.shields.io/badge/Licença-MIT-blue)

---

## 📸 Visão geral

GeoStrike é um jogo FPS de navegador que combina **geometria 3D gerada em tempo real a partir de dados OSM** com mecânicas de missão temáticas. Cada partida carrega uma cidade real (Tóquio, Buenos Aires, Cidade do Cabo, Paris…), constrói prédios, ruas e parques em Three.js, e coloca o jogador numa missão com tema único — Apocalipse Zumbi, Thriller de Espionagem, Horror Sobrenatural, Zona de Guerra ou Mistério Ancestral.

```
Navegador → Node.js/Express → Overpass API (OpenStreetMap)
                ↓
        Geometria 3D Three.js
        Ruas • Prédios • Parques • Água
                ↓
        Missão temática gerada por seed
        Inimigos • Itens • GPS • Modo Cego
```

---

## ✨ Funcionalidades

### 🗺️ Mapa Real
- Dados de ruas, prédios, parques e água extraídos ao vivo da **Overpass API** (OpenStreetMap)
- 25 cidades disponíveis: São Paulo, Tóquio, Paris, Nova York, Cidade do Cabo e mais
- Geometria Three.js gerada proceduralmente: ruas com calçadas em camadas, prédios com altura variável, árvores, parques, rios
- **Marcadores de caminho navegável** — pontos sutis ao longo das ruas indicam onde é possível andar

### 🎮 Gameplay FPS
- Controles `WASD` + mouse (Pointer Lock API)
- Sistema de tiro com cooldown, recarga (`R`) e munição
- 12 tipos de inimigos com comportamento único: zumbis tanque/rápido, guardas, atiradores, drones, fantasmas, demônios, golems e mais
- Colisão com prédios — você não atravessa paredes
- Sistema de HP, dano, cura (kit médico) e overlay de dano na tela

### 🎯 Missões Temáticas (5 temas)
| Tema | Objetivo | Inimigos |
|------|----------|----------|
| ☣️ Pós-Apocalipse | Coletar 2 galões de combustível | Zumbis, Tanques, Rápidos |
| 🕵️ Thriller Urbano | Recuperar 3 pen-drives | Guardas, Atirador, Drone |
| 👻 Survival Horror | Selar 4 cristais | Fantasmas, Sombras, Demônio |
| 💥 Zona de Guerra | Ativar 2 balizas de resgate | Soldados, Comandante |
| 🔮 Mistério Ancestral | Coletar 5 artefatos | Golems, Espectros, Guardião |

### 📡 Sistema GPS
- **Item coletável** `📡` escondido na fase — encontre-o para ativar a navegação
- Traça rota pela **rede viária real** (algoritmo A* greedy sobre nós OSM)
- Animação de linha tracejada animada no minimapa
- Quando o destino está fora do minimapa: seta de borda com distância em metros
- Após coletar todos os itens: rota muda automaticamente para a zona de extração

### 🌑 Modo Cego *(opcional por fase)*
Ativa-se ao coletar o último item da missão:
- Tela escurece gradualmente (fade de 2s nas luzes Three.js + overlay preto)
- **Relâmpagos periódicos** aleatórios iluminam o cenário por milissegundos (8–20s de intervalo)
- **Voz por síntese de fala** (Web Speech API, pt-BR) guia o jogador:
  - Direção e distância até a extração a cada 4.5s
  - Alertas de inimigos próximos (< 10m) com prioridade
  - Aviso de colisão com parede
  - Tom de voz diferente por tema (grave/lento no horror, rápido/militar no war…)
- **Bip de proximidade** — oscilador de áudio que acelera conforme você se aproxima da extração
- Minimapa permanece visível; zoom automático para mostrar a extração mesmo que esteja longe
- **Escolha por fase** — toggle no briefing antes de cada missão

### 🏆 Recordes
- Top 10 recordes salvos em `localStorage` (persiste entre sessões)
- Exibido na tela de conclusão com medalhas 🥇🥈🥉

### 📋 Log de Fase
- A cada fase carregada, `phase_log.json` é atualizado no servidor
- Inclui coordenadas world `{x, z}` e **lat/lon real** de cada item, inimigo, NPC e extração
- Links diretos para o Google Maps de cada posição — útil para depurar itens inacessíveis
- Acesse via `GET /api/phase-log` ou leia o arquivo diretamente

---

## 🏗️ Arquitetura

```
GeoStrike/
├── server.js              # Express + lógica de fase + Overpass API
│   ├── THEMES[]           # 5 temas com inimigos, itens e diálogos NPC
│   ├── LOCATIONS[]        # 25 cidades com lat/lon
│   ├── placeObjects()     # spawn via snapToRoad — todos os objetos em ruas reais
│   ├── GET /api/new-phase # gera mapa + objetos para uma fase
│   ├── GET/POST /api/phase-log  # log de debug com coordenadas reais
│   └── buildRoadNodes()   # índice de nós de rua para snap de spawn
│
├── public/
│   ├── index.html         # estrutura HTML: HUD, overlays, telas
│   ├── css/style.css      # design system escuro, temas, animações
│   └── js/game.js         # todo o motor do jogo (~2500 linhas)
│       ├── initScene()    # Three.js: câmera, luzes, névoa, renderer
│       ├── renderMap()    # constrói geometria 3D a partir dos dados OSM
│       ├── renderRoad()   # ruas com 3 camadas: kerb + superfície + linha central
│       ├── spawnAll()     # posiciona objetos, inimigos, NPC, extração
│       ├── buildRoadDots()# marcadores de caminho navegável
│       ├── buildRoadPath()# A* greedy para rota GPS pelo mapa de ruas
│       ├── runAI()        # comportamento dos inimigos (patrulha, perseguição, tiro)
│       ├── drawMinimap()  # minimapa com GPS, inimigos, NPC, rota animada
│       ├── activateBlindMode() # modo cego: fade de luz, TTS, relâmpagos, bip
│       └── sendPhaseLog() # envia log com lat/lon para o servidor
│
└── phase_log.json         # gerado automaticamente — log de debug de spawns
```

---

## 🚀 Como instalar e rodar

### Pré-requisitos
- **Node.js** v16 ou superior
- Conexão com internet (necessária para buscar dados do OpenStreetMap)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/geostrike.git
cd geostrike

# Instale as dependências
npm install
```

### Rodando

```bash
npm start
```

Abra o navegador em **http://localhost:5000**

> **Dica:** Na primeira fase pode demorar 2–4 segundos enquanto os dados OSM são buscados. As chamadas seguintes usam cache em memória.

### Variáveis de ambiente (opcionais)

```bash
PORT=3000 npm start   # muda a porta (padrão: 5000)
```

---

## 🎮 Controles

| Tecla | Ação |
|-------|------|
| `W A S D` | Mover |
| `Mouse` | Olhar / mirar |
| `Click esquerdo` | Atirar |
| `R` | Recarregar |
| `E` | Interagir com NPC / coletar |
| `Shift` | Correr |
| `F` | Lanterna (tema Horror) |
| `Esc` | Pausar / fechar diálogo |

---

## 🗺️ Cidades disponíveis

| Cidade | País | Cidade | País |
|--------|------|--------|------|
| São Paulo | Brasil | Tóquio | Japão |
| Rio de Janeiro | Brasil | Seul | Coreia do Sul |
| Salvador | Brasil | Xangai | China |
| Paris | França | Singapura | Singapura |
| Londres | UK | Nova Delhi | Índia |
| Roma | Itália | Nova York | EUA |
| Madrid | Espanha | Los Angeles | EUA |
| Berlim | Alemanha | Chicago | EUA |
| Moscou | Rússia | Cidade do México | México |
| Buenos Aires | Argentina | Cairo | Egito |
| Dubai | EAU | Cidade do Cabo | África do Sul |
| Sydney | Austrália | Viena | Áustria |
| Hong Kong | China | | |

---

## 🛠️ Tecnologias

| Tecnologia | Uso |
|-----------|-----|
| **Node.js + Express** | Servidor HTTP, geração de fases, API REST |
| **Three.js r128** | Motor 3D: geometria, luzes, névoa, câmera FPS |
| **OpenStreetMap / Overpass API** | Dados reais de ruas, prédios, parques e água |
| **Web Speech API** | Síntese de voz em pt-BR para o Modo Cego |
| **Web Audio API** | Bip de proximidade e efeitos sonoros procedurais |
| **Canvas 2D API** | Minimapa com rota GPS animada |
| **Pointer Lock API** | Controle de câmera FPS no navegador |
| **localStorage** | Persistência de recordes entre sessões |

---

## 🧩 Como o mapa é gerado

1. **Cidade aleatória** é sorteada da lista de 25 locais
2. **Overpass API** é consultada com um bounding box de ~1km ao redor das coordenadas
3. Dados retornados são filtrados por tipo:
   - `highway` → ruas (com largura por tipo: `primary`, `residential`, `footway`…)
   - `building` → polígonos de prédio convertidos em geometria extrudada
   - `natural=water` / `waterway` → superfícies de água
   - `leisure=park` / `landuse=grass` → parques com árvores procedurais
4. **Spawn de objetos** usa `snapToRoad()`: todo item, inimigo, NPC e zona de extração é colocado no nó de rua mais próximo que não esteja dentro de um prédio — nada nasce em lugar inacessível
5. **Road dots** marcam visualmente os caminhos navegáveis com pequenos pontos nas ruas próximas aos objetivos

---

## 📋 API do servidor

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/new-phase?phase=N` | GET | Gera dados completos de uma fase (mapa OSM + objetos) |
| `/api/phase-log` | GET | Lista as últimas 50 fases logadas com coordenadas |
| `/api/phase-log` | POST | Salva log de uma fase (chamado automaticamente pelo cliente) |

### Exemplo de log de fase (`phase_log.json`)

```json
{
  "phase": 3,
  "theme": "Thriller Urbano",
  "city": "Cidade do Cabo",
  "country": "África do Sul",
  "centerGmaps": "https://www.google.com/maps?q=-33.9249,18.4241",
  "missionItems": [
    {
      "id": "mi_0",
      "type": "pendrive",
      "world": { "x": 42.3, "z": -18.7 },
      "latlon": { "lat": -33.9251, "lon": 18.4245 },
      "gmapsUrl": "https://www.google.com/maps?q=-33.9251,18.4245"
    }
  ]
}
```

> Use os links `gmapsUrl` para verificar se um item foi gerado numa rua acessível.

---

## 🐛 Debug de itens inacessíveis

Se um item parecer inacessível:

1. Verifique `phase_log.json` na raiz do projeto
2. Clique no `gmapsUrl` do item para ver sua posição no Google Maps
3. Compare com a posição do jogador (`playerSpawn.gmapsUrl`)
4. Se o item estiver numa área sem rua, o sistema `snapToRoad` deve ter falhado — abra uma issue com o log

---

## 🔧 Personalização

### Adicionar uma cidade
Em `server.js`, adicione à lista `LOCATIONS`:
```js
{ lat: -15.7801, lon: -47.9292, hint: 'Capital do Brasil', country: 'Brasil', city: 'Brasília' },
```

### Criar um tema novo
Adicione à lista `THEMES` em `server.js`:
```js
{
  id: 'cyberpunk', name: 'Cyberpunk', emoji: '🤖',
  sky: '#001133', fog: '#000a22', fogDensity: .011,
  ambient: '#0044ff', ambientInt: 1.1, sun: '#0088ff', sunInt: 1.0,
  ground: '#050510', wallColor: '#0a0a20',
  story: 'A megacorp roubou os dados. Recupere-os.',
  goal: 'Colete 3 chips de dados e escape.',
  enemies: ['drone','guard','drone','sniper_npc','guard'],
  winItem: 'pendrive', winCount: 3,
  npcAvatar: '🤖', npcName: 'Hacker 4N0N',
  npcHint: 'Os chips estão nos nós da rede física — brilham azul néon.',
  ambientSounds: ['rain', 'radio_static'],
},
```

---

## 📄 Licença

MIT — veja [LICENSE](LICENSE) para detalhes.

---

## 🙏 Créditos

- Dados geográficos: **© OpenStreetMap contributors** ([openstreetmap.org](https://www.openstreetmap.org/copyright))
- Motor 3D: **Three.js** ([threejs.org](https://threejs.org))
- Servidor de mapas: **Overpass API** ([overpass-api.de](https://overpass-api.de))

---

<p align="center">
  Feito com ☕ e muitos <code>node --check</code>
</p>
