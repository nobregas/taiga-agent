# Taiga Agent

Assistente local para gerar User Stories e Tasks no Taiga com IA (Gemini), enriquecimento opcional via GitLab e publicacao no board.

## Uso (Docker)

Pre-requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/nobregas/taiga-agent.git
cd taiga-agent
docker compose up -d
```

Abra [http://localhost:4200](http://localhost:4200). Nao e necessario criar `.env` nem configurar porta.

Credenciais do Taiga, Gemini e GitLab ficam na UI (Configuracoes / Workspaces) e persistem no volume `taiga-data`.

Se a imagem ainda nao estiver no GitHub Container Registry, construa localmente:

```bash
docker compose up -d --build
```

### Atualizar

```bash
docker compose pull
docker compose up -d
```

Para parar: `docker compose down`. O banco SQLite permanece ate `docker compose down -v`.

## Configuracao na UI

- **Configuracoes** — email/senha Taiga, API Gemini (globais)
- **Workspaces** — projeto Taiga + repositorios GitLab filhos
- **Wizard** — campo **Repositorio** na criacao da US (default = repo padrao do workspace)

O SQLite fica em `~/.taiga-agent/data.db` no modo desenvolvimento, ou no volume Docker `/data` em producao.

### Migracao do `.env` antigo

Na primeira execucao em desenvolvimento, se existir `.env` com `TAIGA_*`, `GEMINI_*` e `GITLAB_*`, o backend importa automaticamente:

1. Credenciais → `app_settings`
2. Projeto Taiga → workspace `Default`
3. GitLab → codebase `Default` (repositorio padrao)

Depois disso, use a UI. `.env` e opcional (so desenvolvimento local ou override avancado) e nao entra no fluxo Docker.

## Desenvolvimento

```bash
npm run install:all   # primeira vez
```

Iniciar tudo (escolha um):

| Comando | Quando usar |
|---------|-------------|
| `.\dev.ps1` ou `dev.bat` | Windows — duplo clique ou terminal |
| `npm start` / `npm run dev` | Qualquer SO |

Backend: `http://localhost:3000` · Frontend: `http://localhost:4200`
