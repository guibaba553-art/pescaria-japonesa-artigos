# Fluxo SDD — OpenSpec + oh-my-opencode-slim

> Consulta rápida para não esquecer os comandos e a ordem.

---

## Setup Inicial (uma vez)

```bash
npm install -g @fission-ai/openspec@latest
cd /caminho/do/projeto
openspec init                  # detecta OpenCode automaticamente
openspec config profile        # opcional: ativar comandos expandidos
openspec update
```

Cria `openspec/` no projeto + skills em `.opencode/skills/openspec-*/`.

---

## Perfis de Comandos

### Core (default, já vem funcionando)
```
/opsx:explore → /opsx:propose → /opsx:apply → /opsx:archive
```

### Expanded (ativar via `openspec config profile`)
```
/opsx:explore → /opsx:new → /opsx:ff ou /opsx:continue → /opsx:apply
             → /opsx:verify → /opsx:archive ou /opsx:bulk-archive
```

---

## Fluxo Passo a Passo

### 1. Explorar (quando a ideia ainda está vaga)
```
/opsx:explore
"Quero adicionar pagamento via PIX com QR code estático"
```
→ AI lê o codebase, sugere opções, afina a ideia
→ Não cria artefato nenhum — só conversa
→ Pode transicionar para `/opsx:propose` ou `/opsx:new`

### 2a. Propor rápido (core — tudo de uma vez)
```
/opsx:propose add-pix-qrcode
```
→ Cria `openspec/changes/add-pix-qrcode/` com:
  - `proposal.md` — intenção, escopo, abordagem
  - `specs/` — requisitos em GIVEN/WHEN/THEN
  - `design.md` — decisões técnicas
  - `tasks.md` — checklist de implementação

⏸ **REVISE OS ARTEFATOS ANTES DE IMPLEMENTAR**

### 2b. Propor incremental (expanded — artefato por artefato)
```
/opsx:new add-pix-qrcode          # só cria a pasta
/opsx:continue                     # cria proposal.md
/opsx:continue                     # cria specs/
/opsx:continue                     # cria design.md
/opsx:continue                     # cria tasks.md
```
Ou tudo de uma vez:
```
/opsx:ff add-pix-qrcode            # fast-forward: cria todos
```

### 3. Implementar
```
/opsx:apply
```
→ Lê `tasks.md` e executa cada task
→ oh-my-opencode-slim entra aqui — o orchestrador delega:
  - `@fixer` para implementação mecânica
  - `@designer` para UI/UX
  - `@oracle` para revisão de arquitetura
→ Tasks são marcadas `[x]` conforme concluídas

**Pode pausar e retomar** — `/opsx:apply` continua de onde parou.

### 4. Verificar (antes de arquivar)
```
/opsx:verify
```
→ Completude: todas tasks feitas? requisitos cobertos?
→ Corretude: implementação bate com o spec?
→ Coerência: decisões de design refletidas no código?

**Só arquive se passar ou se os warnings forem aceitáveis.**

### 5. Arquivar
```
/opsx:archive
```
→ Pergunta se quer sync os delta specs para as specs principais
→ Move para `openspec/changes/archive/YYYY-MM-DD-add-pix-qrcode/`

**Vários de uma vez:**
```
/opsx:bulk-archive
```
→ Detecta conflitos de spec entre changes e resolve automaticamente

---

## Estrutura de Diretórios

```
openspec/
├── specs/                     # Specs principais (fonte da verdade)
│   └── pagamento/
│       └── spec.md
├── changes/                   # Changes ativos
│   └── add-pix-qrcode/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       ├── specs/             # Delta specs
│       │   └── pagamento/
│       │       └── spec.md
│       └── .openspec.yaml
├── changes/archive/           # Changes concluídos
└── config.yaml                # Config opcional do projeto
```

---

## Resumo dos Comandos

| Comando | Perfil | O que faz |
|---|---|---|
| `/opsx:explore` | core+expanded | Thinking partner, não cria artefatos |
| `/opsx:propose` | core | Cria change + todos artefatos de uma vez |
| `/opsx:new` | expanded | Cria só o scaffold da pasta |
| `/opsx:continue` | expanded | Cria 1 artefato por vez (respeita dependências) |
| `/opsx:ff` | expanded | Cria todos artefatos de uma vez (fast-forward) |
| `/opsx:apply` | core+expanded | Implementa as tasks |
| `/opsx:verify` | expanded | Valida implementação vs specs |
| `/opsx:sync` | core+expanded | Merge manual dos delta specs (opcional) |
| `/opsx:archive` | core+expanded | Arquivar change concluído |
| `/opsx:bulk-archive` | expanded | Arquivar vários de uma vez |
| `/opsx:onboard` | expanded | Tutorial guiado (15 min) |

---

## Lembretes Importantes

- **Revise os artefatos antes de implementar** — é o ponto principal do SDD
- **Delta specs** usam `## ADDED / MODIFIED / REMOVED Requirements` — semanticos, não copia-cola
- **O `/opsx:archive` já pergunta se quer sync** — não precisa rodar `/opsx:sync` separadamente
- **OpenSpec specs** focam em requisitos, não em código — a implementação fica com oh-my-opencode-slim
- **Para mudar de perfil:** `openspec config profile` + `openspec update`

---

## Exemplo Real (Pescaria Japonesa)

```
# feature: PDV aceitar PIX via QR code dinâmico

/opsx:propose add-pix-dinamico-pdv

→ openspec/changes/add-pix-dinamico-pdv/
  proposal.md  → intenção: cliente pagar com PIX no balcão
  specs/       → GIVEN cliente no PDV WHEN escolhe PIX THEN gera QR code
  design.md    → usar pixGatewayRouter, expirar em 5 min, webhook de confirmação
  tasks.md     → checklist implementação

/opsx:apply
  # orchestrador delega para @fixer:
  # src/lib/pixGatewayRouter.ts → adicionar rota
  # src/components/PdvCheckout.tsx → novo método de pagamento
  # src/hooks/ → polling de status

/opsx:verify
/opsx:archive
```

---

## Links

- [OpenSpec GitHub](https://github.com/Fission-AI/OpenSpec)
- [OpenSpec Docs](https://openspec.dev/)
- [oh-my-opencode-slim](https://ohmyopencodeslim.com/)
