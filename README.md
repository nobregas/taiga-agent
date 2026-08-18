# Taiga Agent

Assistente local para gerar User Stories e Tasks no Taiga com IA (Gemini), enriquecimento opcional via GitLab e publicacao no board.

## Configuracao

Credenciais e projetos ficam no **SQLite** (`~/.taiga-agent/data.db` por padrao), gerenciados pela UI:

- **Configuracoes** — email/senha Taiga, API Gemini (globais)
- **Workspaces** — projeto Taiga + repositorios GitLab filhos
- **Wizard** — campo **Repositorio** na criacao da US (default = repo padrao do workspace)

O `.env` na raiz guarda apenas infra do servidor (`PORT`, `CORS_ORIGIN`, `TAIGA_AGENT_DATA_DIR`).

### Migracao do `.env` antigo

Na primeira execucao, se existir `.env` com `TAIGA_*`, `GEMINI_*` e `GITLAB_*`, o backend importa automaticamente:

1. Credenciais → `app_settings`
2. Projeto Taiga → workspace `Default`
3. GitLab → codebase `Default` (repositorio padrao)

Depois disso, use a UI para criar workspaces adicionais e repositorios.

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

## Docker

O frontend e servido pelo nginx e encaminha `/api` para o backend (mesma origem). O SQLite fica no volume `taiga-data`.

```bash
cp .env.example .env   # se ainda nao existir; nao coloque secrets no compose
docker compose up --build
```

- App: `http://localhost:4200`
- API direta: `http://localhost:3000/api/health`

Credenciais do Taiga/Gemini/GitLab continuam na UI (Configuracoes / Workspaces), persistidas no volume. Nao commite o arquivo `.env`.

Para parar: `docker compose down`. O volume com o banco permanece ate `docker compose down -v`.
