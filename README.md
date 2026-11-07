## agenza 

agenza is a chat-based job search assistant. Instead of juggling five different job boards and a spreadsheet, you talk to it - "find me AI Engineer roles in India" - and it searches, ranks, and explains its results in the same conversation.

## Live Link 
https://agenza-jobs.vercel.app/

## Why

Job search tools tend to fall into two camps: aggregators that dump hundreds of unranked listings on you, or ATS-style trackers that assume you've already found the jobs. Neither actually helps you figure out *which* of the hundred postings are worth your time.

LeaderLab tries to close that gap. You describe what you want in plain language, it pulls listings from multiple sources in real time, and it scores each one against your saved preferences and resume - role match, location, skills, experience, salary, freshness - so the results are ranked by fit, not just recency. The same assistant can also just answer questions or search the web, so it doesn't feel like a bolted-on job widget.

## How it works

**Frontend** - A Next.js app (deployed on Vercel) handles the chat UI, saved jobs, resume upload, and settings. Auth is handled by Clerk; a middleware layer blocks every route except sign-in/sign-up for anyone without a session.

**Backend** - A FastAPI service verifies each request's Clerk session token (against Clerk's public JWKS, no shared secret needed) and exposes the chat, conversation, resume, and job-preferences endpoints. Chat responses stream back over SSE.

**Agent** - Each chat turn runs through a LangGraph agent. It isn't tied to a single LLM: it holds a fallback chain across Groq, Gemini, and Mistral, and rotates across multiple API keys per provider, so a rate limit on one key (or one provider) doesn't interrupt the conversation. Conversation state is checkpointed per thread in Postgres, so a chat picks up exactly where it left off.

**Job search** - The agent's `search_jobs` tool queries Adzuna, RemoteOK, Remotive, and any configured RSS/Greenhouse career feeds in parallel, merges and dedupes the results, then scores every listing against the signed-in user's saved preferences and parsed resume. A second tool, `web_search`, gives the agent general web access via Tavily for anything outside job search.

**Data** - Everything durable - usage limits, job preferences, parsed resumes, saved jobs, and conversation history - lives in the same PostgreSQL database as the agent's own checkpoints.

## Stack

Next.js · Clerk · FastAPI · LangGraph · Groq / Gemini / Mistral · Adzuna / RemoteOK / Remotive · Tavily · PostgreSQL

## Architecture
<img width="587" height="379" alt="image" src="https://github.com/user-attachments/assets/3fe86ccc-e9fb-4004-9afe-b3f87f7e39c7" />

## User Interface
<img width="958" height="533" alt="image" src="https://github.com/user-attachments/assets/e1e47fea-c808-48ad-8bff-41ef8d8c3b01" />

## Job Customization 
<img width="956" height="536" alt="image" src="https://github.com/user-attachments/assets/29340751-fd9c-4cfb-b66e-01df577ea56c" />

## Token Usage
<img width="959" height="535" alt="image" src="https://github.com/user-attachments/assets/aa3ff2aa-015b-4f0c-99be-9881c756bd6c" />

## Job Search 
<img width="958" height="532" alt="image" src="https://github.com/user-attachments/assets/53de231f-768c-40fb-a96a-66089658ef1c" />
<img width="956" height="536" alt="image" src="https://github.com/user-attachments/assets/4478eea4-771e-4886-a335-d2a19e9c227c" />
<img width="959" height="539" alt="image" src="https://github.com/user-attachments/assets/a8f1426b-2fed-4397-aa1a-2c77f55b7360" />


