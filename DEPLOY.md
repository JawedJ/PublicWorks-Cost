# Deploying to Vercel

Vercel deploys `main` automatically; every other branch gets a preview deployment.

## First-time setup (once)

1. Sign in at <https://vercel.com> with GitHub.
2. **Add New… → Project**, import `JawedJ/PublicWorks-Cost`.
3. Framework preset: **Next.js** (auto-detected). Leave build and install commands as default; Vercel uses pnpm because of `pnpm-lock.yaml`.
4. **Environment Variables**: add the keys from `.env.example` that you have (at least `NEXT_PUBLIC_MAPTILER_KEY` and `GEMINI_API_KEY`, `AI_PROVIDER=gemini`). Missing keys are fine; the app falls back.
5. **Deploy.** Record the production URL in `PERSON_A.md` → Environment.

## After that

- Merge to `main` → production deploy.
- Push a branch → preview deploy.
- Changing env vars requires a redeploy (Deployments → ⋯ → Redeploy).

## Checks before merging to `main`

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
