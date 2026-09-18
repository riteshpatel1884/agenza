# LeaderLab

An AI chat platform I'm building in phases - starting with a solid core chat experience and expanding from there.

**Live demo:** https://agenza-ai.vercel.app

---

## Phase 1 - Core Chat Experience (Completed)

The goal of this phase was to nail the fundamentals: a fast, clean chat interface backed by real LLMs, with enough customization to make it feel personal.

### Features
- Chat with an LLM in a clean, ChatGPT-style interface
- Switch between **GPT-OSS 120B** and **GPT-OSS 20B** models
- Model selection built right into the chat UI (no settings menu digging)
- Custom accent colors
- Custom chat backgrounds/themes
- Conversation sidebar with full chat history

### Tech Stack
- **Frontend:** Next.js
- **Backend:** FastAPI (Python)
- **Orchestration:** LangChain, LangGraph
- **Database:** SQLite

### AI Models
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`

### Tools & Hosting
- Workflow design: Eraser
- Version control: GitHub
- Frontend hosting: Vercel
- Backend hosting: Railway

---

## Notes

This README will be updated as each phase ships.
