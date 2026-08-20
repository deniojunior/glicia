# Glicia

Assistente pessoal para registro e acompanhamento do controle glicêmico de
**uma única pessoa** com diabetes tipo 1. O Glicia recebe mensagens em linguagem
natural (ex.: *"Minha glicemia está 165 e vou jantar 3 colheres de arroz, uma
concha de feijão e um bife."*), interpreta os dados, usa a tabela local de
alimentos como contexto para a LLM contar os carboidratos e **calcula a dose de
insulina de forma determinística** a partir do total confirmado.

O princípio que rege todo o sistema:

> **"Tabela informa. LLM conta carboidratos. Código calcula dose. Usuária confirma."**

A IA calcula apenas os carboidratos da refeição usando a tabela enviada no
prompt; ela nunca recomenda ou decide dose, nem inventa glicemia. A dose continua
sendo calculada pelo código e só é calculada após confirmação explícita.

📄 **Como o cálculo funciona:** veja [`docs/ALGORITMO.md`](docs/ALGORITMO.md).

---

## ⚠️ Aviso importante

**Este projeto tem a intenção de ajudar, mas não se responsabiliza por quem o
utiliza.**

- O Glicia **não é um dispositivo médico** e **não substitui** a orientação de
  profissionais de saúde.
- A fórmula de cálculo apenas **reproduz o protocolo configurado** pela própria
  usuária (na origem, uma planilha pessoal). **Não é uma recomendação médica
  universal** e não introduz automaticamente regras clínicas não especificadas.
- Decisões sobre dose de insulina são de **responsabilidade exclusiva da usuária
  e de sua equipe médica**. Sempre confirme com seu médico ou endocrinologista.
- O software é fornecido **"como está" (as is), sem garantias** de qualquer tipo.
  Os autores e mantenedores **não se responsabilizam** por qualquer dano,
  prejuízo ou consequência decorrente do uso — veja a seção
  [Licença](#licença).

Se você está em situação de emergência médica, procure atendimento imediatamente.

---

## Status do projeto

- **Fase 1 — MVP Local (atual):** aplicação de terminal, **100% offline**, com
  interpretador simulável (mock), resolução de alimentos, cálculo determinístico
  de insulina, fluxo de confirmação e persistência local em SQLite.
- **Fases futuras:** integrações com WhatsApp, OpenAI, Supabase, transcrição de
  áudio e Google Sheets. A arquitetura já expõe os pontos de extensão
  (portas/adaptadores), mas essas integrações **não** fazem parte do MVP.

---

## Arquitetura (visão rápida)

Arquitetura **hexagonal enxuta** (ports & adapters): um núcleo de domínio puro
cercado por portas (interfaces), com adaptadores concretos plugando nelas. Trocar
o canal (terminal → WhatsApp) ou o interpretador (mock → OpenAI) significa trocar
um adaptador, **sem tocar na lógica de domínio**.

```
src/
├─ domain/        # núcleo puro: cálculo, resolução, orquestração, portas
│  ├─ insulin/    # calculateInsulin (função pura, único lugar do cálculo)
│  ├─ meals/      # calculateMealCarbs
│  ├─ foods/      # FoodResolver
│  ├─ conversation/  # orquestrador + sanitização da interpretação
│  ├─ logging/    # logger sem dados clínicos
│  └─ ports/      # ChannelAdapter, Interpreter, Repository
├─ adapters/      # TerminalChannel, MockInterpreter, SqliteRepository, InMemory
└─ app/           # wiring (composição) + main (CLI)

migrations/       # schema SQL (SQLite na Fase 1, compatível com Postgres)
seeds/            # base de alimentos (amostra do Manual SBD) + importador
tests/            # unit, property (fast-check), integration, e2e
```

---

## Requisitos

- **Node.js ≥ 20**
- **npm** (ou outro gerenciador compatível)

O `better-sqlite3` é um módulo nativo; a instalação compila/baixa o binário
apropriado automaticamente.

---

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Compilar o TypeScript
npm run build

# 3. Iniciar a CLI offline (parser local + cálculo pela tabela local)
npm start
```

Ao iniciar, digite mensagens em linguagem natural descrevendo sua glicemia e
refeição. O Glicia interpreta, pede o que faltar, apresenta um resumo e — após
você confirmar com **"sim"** — calcula e registra a dose. Digite **"cancelar"**
para recomeçar.

### Configuração opcional

- `GLICIA_DB_PATH` — caminho do arquivo SQLite local. Se omitido, usa o padrão
  `glicia.db`. Use `:memory:` para um banco efêmero.
- Copie `.env.example` para `.env` se quiser definir variáveis localmente. **A
  Fase 1 é totalmente offline e não usa segredos** — as chaves no `.env.example`
  existem apenas como referência para as fases futuras.

### Contagem de carboidratos pela LLM

Para enviar a tabela de alimentos à OpenAI e receber carboidratos por item e o
total da refeição, configure uma chave no ambiente e inicie no modo `openai`:

```bash
export OPENAI_API_KEY="sua-chave"
export GLICIA_INTERPRETER="openai"
npm start
```

Nesse modo, a LLM recebe a tabela local como prompt e conduz toda a conversa:
ela identifica alimentos, conta carboidratos e coleta glicemia, tendência e
tipo de refeição. Quando os parâmetros estiverem completos, o código calcula e
exibe a dose sugerida. Não há confirmação por `sim` nem uma máquina de estados
conversacional nesse caminho.

---

## Como testar

O projeto usa [Vitest](https://vitest.dev) como runner e
[fast-check](https://fast-check.dev) para **testes baseados em propriedades**
(property-based testing).

```bash
# Rodar toda a suíte uma vez (unit + property + integration + e2e)
npm test

# Modo watch (re-executa ao salvar)
npm run test:watch

# Checagem de tipos, sem emitir arquivos
npm run typecheck
```

Todos os testes rodam **offline**, sem chamadas de rede. Os testes de propriedade
executam no mínimo 100 casos gerados por execução e referenciam explicitamente a
propriedade de correção que validam.

---

## Como contribuir

Contribuições são bem-vindas! Para manter a qualidade e a segurança do projeto:

1. **Faça um fork** e crie um branch a partir da branch principal:
   `git checkout -b minha-contribuicao`.
2. **Siga o princípio arquitetural**: mantenha o domínio puro. Nenhuma lógica de
   cálculo deve depender de rede, IO ou variáveis de ambiente. A dose de insulina
   continua sendo calculada em **um único lugar** (`calculateInsulin`).
3. **Escreva testes**:
   - testes unitários para exemplos e casos de borda;
   - testes de propriedade (fast-check) para invariantes de correção;
   - mantenha tudo offline e determinístico.
4. **Garanta que tudo passa** antes de abrir o PR:
   ```bash
   npm run typecheck && npm run build && npm test
   ```
5. **Abra um Pull Request** descrevendo o que mudou, o que foi testado e qualquer
   decisão de design relevante. Faça commits pequenos e com mensagens claras.
6. **Segurança e privacidade**: nunca registre dados clínicos completos em logs
   e nunca inclua segredos no repositório.

Ao contribuir, você concorda que sua contribuição será licenciada sob os mesmos
termos do projeto (veja abaixo).

---

## Base de alimentos

A base é **normalizada**: a tabela `food` guarda a **identidade** do alimento e a
tabela `food_measure` guarda cada par **alimento + medida** como um registro
próprio (com sua própria quantidade e seu próprio carboidrato). Assim um mesmo
alimento pode ter várias medidas — por exemplo, arroz em "colher de sopa" (25 g)
e em "escumadeira" (90 g). Apelidos (`food_alias`) apontam para a identidade.

A fonte versionada fica em `seeds/`:

- `seeds/sbd-foods.csv` — colunas `name, serving_unit, serving_quantity, carbohydrates`
  (uma linha por par alimento+medida; linhas com o mesmo `name` viram um único
  alimento com várias medidas).
- `seeds/sbd-aliases.csv` — colunas `food_name, alias`.
- `seeds/import-sbd-foods.ts` — importador idempotente que popula `food` +
  `food_measure` + `food_alias`.

O que está versionado é uma **amostra**. Para carregar a base completa do Manual
de Contagem de Carboidratos da SBD, substitua os CSVs pelos dados oficiais
(mantendo o mesmo formato de colunas) e rode a aplicação/importador. Ao iniciar a
CLI, os alimentos são semeados automaticamente na primeira execução quando a
tabela está vazia.

### Memória de preferências

O Glicia aprende associações confirmadas durante a conversa, por exemplo
`café` → `café coado sem açúcar` ou `pão sovado` → `pão de leite`. Essas
associações são persistidas por paciente em `food_memory` e reutilizadas como
contexto do interpretador e da resolução determinística. A memória guarda o
alimento e a medida canônicos, mas não guarda quantidade padrão nem dose de
insulina; a quantidade informada em cada nova mensagem sempre prevalece.

## Documentação

- [`docs/ALGORITMO.md`](docs/ALGORITMO.md) — explicação detalhada de como o
  algoritmo interpreta a mensagem e calcula as doses.

---

## Licença

Distribuído sob a **Licença MIT**. Veja o arquivo [`LICENSE`](LICENSE) para o
texto completo.

Como reforçado no [aviso acima](#-aviso-importante), o software é fornecido
**"como está", sem garantias**, e os autores **não se responsabilizam** por
qualquer uso ou consequência decorrente dele.
