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

## Local Desktop Review Setup

The platform can review code folders directly from your Desktop. This is enabled by a secure Docker volume mount.

1.  Place your code folder on your **Desktop**.
2.  In the dashboard, click **Local Review**.
3.  Enter the folder name.
4.  The system will analyze the files and display the results in your history.

## Development & Security

*   **Zero-Token Cost**: All AI inference is handled locally via Ollama.
*   **Privacy**: Your code never leaves your machine.
*   **Docker Isolation**: All tools (Bandit, Pylint) run inside isolated containers.
*   **Secure Environment**: Credentials are managed via `.env` (ignored by Git).

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

*   **PR review dashboard**: Manage and track all code reviews.
*   **Local Desktop Review**: Analyze code folders directly from your computer's Desktop.
*   **Repository management**: Connect and monitor GitHub repositories.
*   **AI review history**: Searchable archive of all previous analysis results.
- **Multi-Agent Review**: 5+ specialized agents for security, performance, clean code, etc.
- **Repository-Aware RAG**: Uses Qdrant to retrieve context from your codebase.
- **Streaming Responses**: Real-time AI feedback in the dashboard.
- **GitHub Integration**: Automatic PR reviews via webhooks.
- **Static Analysis**: Integrated Pylint, Bandit, and ESLint.
