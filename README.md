# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## LexSentinel Platform Stability & QA Suite

### Overview

LexSentinel includes a comprehensive **Regression & Safety Suite** that baselines 10 critical/high-priority issues identified during the platform audit. The suite is non-destructive — it never modifies production data or schemas.

### Test Suites

| Suite | File | Coverage |
|---|---|---|
| **Refresh & Resume** | `src/tests/regression/refresh-resume.test.ts` | C3 (Disclaimer persistence), H1 (Settings reload) |
| **Integrity Guard** | `src/tests/regression/integrity-guard.test.ts` | H2 (Stale save), H4 (Document versioning), H7 (Optimistic locking) |
| **Fortress Auth** | `src/tests/regression/fortress-auth.test.ts` | C1/C2 (Admin route protection across 22+ routes) |
| **Observer Effect** | `src/tests/regression/observer-effect.test.ts` | H5/H6 (Read-only session enforcement) |
| **Phase 4 Final QA** | `src/tests/regression/phase4-final-qa.test.ts` | Auth caching, debounced sync, conflict resolution, shadow sync |

### Running the Test Suite

```sh
# Run all tests (including regression suite)
npm run test

# Run tests in watch mode during development
npm run test:watch

# Run only the regression suite
npx vitest run src/tests/regression/

# Run a specific suite
npx vitest run src/tests/regression/fortress-auth.test.ts
```

### Architecture Highlights

- **AdminRoute guard** (`src/components/AdminRoute.tsx`) — wraps all `/admin/*` routes with role-based access control
- **useSyncState hook** (`src/hooks/useSyncState.ts`) — DB → localStorage → default hydration priority with 300ms debounced writes
- **useOptimisticSave hook** (`src/hooks/useOptimisticSave.ts`) — version-gated updates that trigger a `ConflictResolutionModal` on 409 conflicts
- **ConflictResolutionModal** (`src/components/ConflictResolutionModal.tsx`) — presents "Keep My Version" or "Use Server Version" on data conflicts

### Safety Standards

- All admin routes are protected by server-side role checks — client-side UI hiding alone is never sufficient
- State persistence follows the **DB > localStorage > default** priority chain
- All data mutations use optimistic locking with version fields to prevent stale overwrites
- Read-only sessions (e.g. supervisor dashboards) must never fire POST/PUT/DELETE to sensitive tables
