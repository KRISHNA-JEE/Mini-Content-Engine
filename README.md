# Mini Content Engine

Takes a product name + description (+ optional product photo), writes an AI image-generation
prompt from it, generates a lifestyle-style image, and tracks the whole thing as a job you can
poll for status and view once it's done.

## How it works

1. `POST /generate` creates a `pending` job in Postgres and returns its id immediately.
2. In the background:
   - **Groq** (free-tier LLM, `llama-3.3-70b-versatile`) turns the product name + description into
     a vivid image-generation prompt. Job moves to `processing`.
   - **Pollinations.ai** (free, keyless image API) generates an image from that prompt.
     The server now retries transient failures with backoff, tries smaller fallback sizes,
     and finally falls back to a generic placeholder image provider if Pollinations keeps
     returning errors, so jobs are less likely to end in `failed` for temporary upstream issues.
   - The result is saved to disk and the job is marked `completed` (or `failed` with an error
     message if either call fails).
3. `GET /jobs/:id` returns the current status, the generated prompt, the reference image (if any),
   and the result image once ready. `GET /jobs` lists all jobs for the frontend's job list.
4. A single static HTML page (`public/`) provides the form, job list (polls every 2s), and result
   viewer.

## Stack

- Node.js + Express + TypeScript
- PostgreSQL (via `pg`), schema auto-created on boot
- Groq for prompt generation, Pollinations.ai for image generation
- Plain HTML/CSS/JS frontend, no build step

## Project layout

```
src/
  index.ts            Express app bootstrap
  db.ts                Postgres pool + schema init
  types.ts
  routes/
    generate.ts        POST /generate
    jobs.ts             GET /jobs, GET /jobs/:id
    health.ts           GET /health
  services/
    llm.ts              Groq prompt generation
    imageGen.ts          Pollinations image generation + reference image download
    jobProcessor.ts      Background pipeline that updates job status
public/                Frontend (index.html, app.js, style.css)
uploads/               Generated + reference images (served at /uploads/*)
```

## Local setup

### 1. Prerequisites

- Node.js 18+
- A PostgreSQL database. Easiest options if you don't have one running locally:
  - [Neon](https://neon.tech) - free serverless Postgres, takes ~1 minute to create a project
    and copy the connection string.
  - Or a local Postgres install / Docker container.
- A free Groq API key: sign up at [console.groq.com](https://console.groq.com/keys) and create
  an API key (no credit card required).

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

```
DATABASE_URL=<your postgres connection string>
DATABASE_SSL=true      # set to true for Neon/Render/Supabase, false for local Postgres
GROQ_API_KEY=<your groq key>
PORT=3000
```

### 3. Install and run

```bash
npm install
npm run dev      # starts with auto-reload on http://localhost:3000
```

Open `http://localhost:3000` - submit a product, watch it move through pending → processing →
completed, and view the generated image.

For a production-style run:

```bash
npm run build
npm start
```

## API

- `GET /health` → `{ "status": "ok" }`
- `POST /generate` (`multipart/form-data`)
  - `productName` (required)
  - `description` (required)
  - `productImageUrl` (optional) - URL of a reference product photo to download, **or**
  - `productImage` (optional) - direct file upload of a reference product photo
  - Returns `202 { "id": "...", "status": "pending" }`
- `GET /jobs` → array of jobs, most recent first
- `GET /jobs/:id` → single job:
  ```json
  {
    "id": "...",
    "productName": "Florentine Wooden Salad Bowl",
    "description": "...",
    "referenceImageUrl": "/uploads/reference-....jpg",
    "generatedPrompt": "A warm and inviting outdoor dinner setting...",
    "resultImageUrl": "/uploads/result-....jpg",
    "status": "completed",
    "error": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
  ```

### Example

```bash
curl -X POST http://localhost:3000/generate \
  -F "productName=Florentine Wooden Salad Bowl" \
  -F "description=A match made in summer - salads and wooden bowls. Handpainted on mango wood, this compact salad bowl serves a supper for two." \
  -F "productImageUrl=https://www.chumbak.com/cdn/shop/files/your-product-image.jpg"
```

## Deploying publicly (Vercel or Netlify)

This app is not a static site. It needs a Node.js server runtime for the Express API, background
job processing, and file writes under `uploads/`. That makes deployment on Vercel or Netlify a
bit different from a static frontend.

This repo now includes a Vercel function wrapper at `api/[...path].ts` and a `vercel.json`
rewrite config, so the app can be deployed to Vercel without adding a separate backend.

### Recommended approach

Use a hosted Node app for the API if you want the current repo to work with minimal changes.
Vercel and Netlify are best suited for the frontend or serverless endpoints, while this project
currently expects a long-lived server process.

### If you still want Vercel

1. Push this repo to GitHub.
2. Create a Vercel project from the repo.
3. Add environment variables in the Vercel dashboard (not just in your local `.env` file):
   - `DATABASE_URL`
   - `DATABASE_SSL=true`
   - `GROQ_API_KEY`
  - Make sure the `DATABASE_URL` is the live Neon connection string for production.
4. Deploy from Vercel.
5. Verify:
  - `GET /health` returns `{ "status": "ok" }`
  - `POST /generate` creates a job and eventually completes

On Vercel, generated/reference images are stored as data URLs in the database instead of writing
to a persistent local filesystem, so the app remains stateless.

### If you want Netlify

1. Push this repo to GitHub.
2. Create a Netlify site from the repo.
3. Add environment variables in Netlify:
   - `DATABASE_URL`
   - `DATABASE_SSL=true`
   - `GROQ_API_KEY`
4. Add Netlify Functions before deploying.
   - Convert the API routes to Netlify functions.
   - Keep the frontend static, but move `/generate`, `/jobs`, and `/health` into functions.
   - Replace disk writes for generated images with object storage.
5. Deploy from Netlify.

### Important caveats

- `uploads/` is not durable on serverless platforms.
- Background job processing with `setImmediate` is unreliable on serverless platforms, because
  the process may freeze or terminate after the request finishes.
- If you want reliable Vercel or Netlify deployment, the safest change is to split the app into:
  - a static frontend
  - API routes/functions
  - persistent storage for images
  - an external queue or worker for job processing

### Deploying updates

After code changes, redeploy by pushing to GitHub and triggering a new deployment in Vercel or
Netlify. Then verify:

1. `GET /health` returns `{ "status": "ok" }`
2. `POST /generate` creates a job
3. `GET /jobs/:id` eventually returns `completed`

## Design notes / trade-offs

- **Job processing** runs in-process (`setImmediate` after responding to `POST /generate`) rather
  than through a separate queue/worker - appropriate for this assignment's scale; a real product
  would use a queue (BullMQ, SQS, etc.) so jobs survive server restarts and can be retried.
- **Image generation** uses Pollinations' free text-to-image endpoint (prompt only). Pollinations'
  reference-image-conditioned model (`kontext`) now requires a paid tier, so the reference product
  photo is downloaded and shown alongside the result in the UI for context, rather than used as a
  true image-to-image input.
- **LLM** is Groq (`llama-3.3-70b-versatile`) - fast, free-tier, and reliable. An earlier attempt
  to use a fully keyless LLM proxy (Pollinations' text API) was dropped after it started returning
  `402`/`429` errors intermittently during testing.
