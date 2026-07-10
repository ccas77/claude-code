# services/ai

`llm.ts`, `image-gen.ts`, `prompts/`, `qa/`. Implemented starting in **M3**.

Rules:
- Every image prompt is wrapped with the no-text guard.
- Fallback chain configurable per workspace; default Gemini → Imagen → OpenAI.
- Copy prompts follow house rules: no em dashes, "exactly N" phrasing, drop empty source fields.
