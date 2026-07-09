# pinfactory — web preview

`index.html` is a self-contained static landing page that showcases what
pinfactory generates (the five pin templates + the real generated copy for a
sample book). It has no build step and no dependencies — it's one HTML file.

> pinfactory itself is a **local command-line tool** (persistent SQLite, local
> image files, a months-long publish scheduler) — that shape doesn't run on
> serverless platforms like Vercel. This page is a hosted **preview/showcase**,
> not the running app.

## Deploy to Vercel (any one of these)

**Easiest — no install:** go to <https://vercel.com/new>, and either import this
GitHub repo (set the **Root Directory** to `pinfactory/web`) or drag-and-drop
this `web/` folder onto the page.

**CLI:**

```bash
cd pinfactory/web
npx vercel        # preview deploy — follow the prompts
npx vercel --prod # promote to production
```

Because it's a plain static file, no framework preset or build command is
needed — Vercel serves `index.html` at the root automatically.

## Deploy anywhere else

It's just static HTML — GitHub Pages, Netlify, Cloudflare Pages, or any static
host works the same way. Point the host at this `web/` directory.
