# AI Coding Session – AI Code Review System

## Project
AI Code Review System

## Repository
https://github.com/Abhaysriwastav/AI-Code-Review-System

## AI Tool Used
Google Gemini

## Context

This project was originally developed with assistance from
Google Gemini. The following document reconstructs the
AI-assisted development process and the major engineering
decisions made during development.

## What I Asked AI To Help With

### 1. System Architecture

I used Gemini to help design the architecture of the platform.

The resulting architecture consists of:

- Next.js frontend
- Django backend
- FastAPI AI service
- LangGraph-based multi-agent workflow
- Ollama for local LLM inference
- Qdrant for RAG/vector search
- PostgreSQL
- Redis
- Celery
- Docker

### 2. AI Review Pipeline

The AI-assisted workflow was designed to:

1. Receive a repository/code change
2. Analyze the code
3. Retrieve relevant repository context
4. Run specialized review agents
5. Perform static analysis
6. Generate structured review feedback
7. Stream results to the frontend

### 3. Engineering Decisions

AI was used as a development assistant for:

- Architecture exploration
- Python implementation
- API development
- LangGraph workflow design
- RAG implementation
- Docker configuration
- Debugging
- Frontend implementation
- Integration between services

### 4. Human Engineering Decisions

AI-generated suggestions were reviewed and modified before
being incorporated into the project.

Important decisions around architecture, security,
deployment, and implementation were validated manually.

## What I Learned

The project helped me explore:

- AI-assisted software development
- LLM application architecture
- Multi-agent systems
- RAG
- Streaming AI responses
- Dockerized microservices
- GitHub integration
- Static code analysis
- Full-stack development
