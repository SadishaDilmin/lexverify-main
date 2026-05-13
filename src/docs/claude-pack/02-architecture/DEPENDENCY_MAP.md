# Dependency Map

> **AI Reader Notes**: Key external dependencies and internal library dependencies.

## External Services

| Service | Purpose | Secret(s) | Status |
|---|---|---|---|
| Supabase | Database, auth, storage, edge functions | `SUPABASE_*` (auto-provided) | CURRENT |
| Google Vertex AI | EU-resident AI model hosting | `VERTEX_PROJECT_ID`, `VERTEX_SA_CREDENTIALS` | CURRENT |
| Lovable AI Gateway | AI model routing (OpenAI, fallback) | `LOVABLE_API_KEY` | CURRENT |
| Stripe | Payment processing | Configured via `create-checkout` | CURRENT |
| Resend | Transactional email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | CURRENT |
| Cloudflare Turnstile | Bot protection | `TURNSTILE_SECRET_KEY` | CURRENT |
| Firecrawl | Web scraping (connector) | `FIRECRAWL_API_KEY` | CURRENT |
| Companies House API | Corporate data lookup | Public API | CURRENT |
| FCA Register API | Financial conduct authority | Public API | CURRENT |

## Key NPM Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | ^2.98.0 | Supabase client |
| `react` | ^18.3.1 | UI framework |
| `react-router-dom` | ^6.30.1 | Routing |
| `@tanstack/react-query` | ^5.83.0 | Server state management |
| `framer-motion` | ^12.34.3 | Animations |
| `react-markdown` | ^10.1.0 | Markdown rendering |
| `jspdf` | ^4.2.0 | PDF generation |
| `docx` | ^9.6.0 | DOCX generation |
| `pdfjs-dist` | ^5.5.207 | PDF viewing |
| `dompurify` | ^3.3.3 | HTML sanitisation |
| `zod` | ^3.25.76 | Schema validation |
| `recharts` | ^2.15.4 | Charts |
| `sonner` | ^1.7.4 | Toast notifications |
