# LINE AI Live Demo - Vercel Deploy Checklist

## Project path

- `C:\Users\user\Documents\New project 2\line-ai-live-demo`

## What was adjusted for Vercel

- Seed file default path changed to `./data/live-demo-seed`
- Vercel runtime logs default to `/tmp/line-ai-live-demo`
- API routes explicitly use `runtime = "nodejs"`

## One-time deployment steps

1. Login to Vercel
   - `npx vercel login`
2. Link or create the project
   - `npx vercel`
3. Add environment variables in Vercel Project Settings
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `LIVE_DEMO_SEND_REPLY=true`
   - `LIVE_DEMO_SKIP_SIGNATURE_VERIFY=false`
   - `LIVE_DEMO_INCLUDE_PENDING=false`
   - `LIVE_DEMO_DEBUG_TOKEN=<your token>`
4. Redeploy after env vars are saved
   - `npx vercel --prod`
5. Copy the stable production URL
   - Example: `https://your-project.vercel.app/api/line/webhook`
6. Paste that URL into LINE Developers webhook settings

## Verify after deploy

1. Open:
   - `https://your-project.vercel.app/api/health`
2. Expect:
   - `ok: true`
3. In LINE Developers, click `Verify`
4. Send a real LINE test message

## Current known limitation

- Audit log and webhook dedupe are still file-based, so on Vercel they are suitable for demo validation, not production persistence.
