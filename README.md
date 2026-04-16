# Sovereign Shield

A browser-based single-player grand strategy game. You play India's Head of Defense Integration, 2026–2036. Manage procurement, R&D, and force structure across 40 quarterly turns against real-world named adversaries (PLAAF, PAF, PLAN).

## Status

Foundation scaffolding complete (see `docs/superpowers/plans/`). Gameplay systems (turn engine, adversary simulation, vignettes, LLM AAR generation, UI dashboards) live in subsequent plans.

## Stack

- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: React 19 + Vite + TypeScript + Tailwind + Zustand
- LLM: OpenRouter (env var key)
- Hosting: Vercel (frontend) + GCP VM Docker (backend)

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8010
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

### Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest -v
```

## Docs

- `docs/superpowers/specs/` — design specs
- `docs/decisions/` — design decision log (what we picked and why)
- `docs/content/` — seed content and reference data
- `docs/superpowers/plans/` — implementation plans (start with `ROADMAP.md`)
- `docs/DEPLOYMENT.md` — deploy operational runbook
