# AI Code Review Platform

A production-grade AI-powered code review platform using Django, FastAPI, LangGraph, and Next.js.

## Architecture

- **Frontend**: Next.js (Dashboard, Streaming UI)
- **Backend**: Django (User/Repo Management, GitHub Auth)
- **AI Service**: FastAPI + LangGraph (Multi-agent review workflow)
- **LLM**: Ollama (Mistral 7B)
- **Vector DB**: Qdrant (RAG)
- **Task Queue**: Celery + Redis
- **Database**: PostgreSQL

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Ollama installed locally (if not using the container)

### Installation

1. Clone the repository
2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
3. Build and start the services:
   ```bash
   docker-compose up --build
   ```

### Project Structure

```text
backend/
  django_app/      # Main backend (Django)
  ai_service/       # AI microservice (FastAPI + LangGraph)
frontend/          # Next.js Dashboard
infra/             # Docker & K8s configs
```

## Features

- **Multi-Agent Review**: 5+ specialized agents for security, performance, clean code, etc.
- **Repository-Aware RAG**: Uses Qdrant to retrieve context from your codebase.
- **Streaming Responses**: Real-time AI feedback in the dashboard.
- **GitHub Integration**: Automatic PR reviews via webhooks.
- **Static Analysis**: Integrated Pylint, Bandit, and ESLint.

## License

MIT
