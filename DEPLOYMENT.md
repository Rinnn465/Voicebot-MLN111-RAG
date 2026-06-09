# Deployment

## Architecture

- Vercel serves the static frontend from `web/index.html` and `static/*`.
- The home server runs the FastAPI/RAG backend with CPU embeddings.
- The frontend calls the backend URL configured in `static/config.js`.

## Backend URL for Vercel

Edit `static/config.js` before deploying the frontend:

```js
window.VOICEBOT_API_BASE_URL = "https://your-backend-domain.example";
```

The backend URL must support HTTPS and WSS because browsers block microphone/WebSocket flows from insecure origins on production sites.

## Backend on Windows Server

Create `.env` on the server and fill real API keys. Keep these CPU embedding settings:

```env
CHROMA_DIR=chroma_db_qwen_06b
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B
EMBEDDING_DEVICE=cpu
EMBEDDING_BATCH_SIZE=1
SENTENCE_TRANSFORMERS_HOME=./models/sentence_transformers
```

Manual first deploy:

```powershell
.\scripts\deploy_backend_windows.ps1
.\scripts\run_backend.ps1
```

The backend will listen on port `8000` by default.

## CI/CD Backend

Install a GitHub Actions self-hosted runner on the home server and give it this label:

```text
voicebot-server
```

After that, `.github/workflows/deploy-backend.yml` deploys the backend on successful `main` CI runs.

For persistent hosting, register either:

- A Windows service named `VoicebotRAG`, or
- A scheduled task named `VoicebotRAG` that runs `scripts/run_backend.ps1`.

The deploy script restarts whichever one exists.

## Public Access

Use one of these in front of the backend:

- Cloudflare Tunnel: recommended for home demo, no router port-forward required.
- Router port-forward plus HTTPS reverse proxy: works, but needs more network setup.

Point `static/config.js` to that public HTTPS origin.
