# Taiga Agent

Assistente local para gerar User Stories e Tasks no Taiga com IA (Gemini), enriquecimento opcional via GitLab e publicacao no board.

## Uso (Docker)

Pre-requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

O repositorio e privado, entao a imagem no GHCR tambem e. Quem tem acesso ao repo sobe construindo localmente — sem `.env` e sem login no registry:

```bash
git clone https://github.com/nobregas/taiga-agent.git
cd taiga-agent
docker compose up -d --build
```

Abra [http://localhost:4200](http://localhost:4200).

Credenciais do Taiga, Gemini e GitLab ficam na UI (Configuracoes / Workspaces) e persistem no volume `taiga-data`.

### Atualizar

```bash
git pull
docker compose up -d --build
```

Opcional, se voce estiver logado no GHCR (`docker login ghcr.io -u USER --password-stdin` com um PAT que tenha `read:packages`):

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
