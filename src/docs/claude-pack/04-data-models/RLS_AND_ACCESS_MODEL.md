# RLS and Access Model

> **AI Reader Notes**: Security model overview.

## Authentication

- Supabase Auth with email/password
- Google OAuth supported
- Email verification required (no auto-confirm)
- Session managed via `AuthContext` with 30-second cache

## Role Checking

- Roles stored in `user_roles` table (NOT on profiles)
- Checked via `has_role(_user_id uuid, _role app_role)` — SECURITY DEFINER function
- `super_admin` implicitly has all roles (checked in function)
- Client-side: `AdminRoute` component wraps admin pages
- Server-side: RLS policies use `has_role()` for access control

## RLS Strategy

- All tables have RLS enabled
- Typical policies:
  - Users can read their own data (`auth.uid() = user_id`)
  - Users can read cases where they are the conveyancer
  - Admins can read/write all data via `has_role(auth.uid(), 'admin')`
  - Some tables are read-only for non-admin roles

## Security Functions

| Function | Purpose |
|---|---|
| `has_role(uuid, app_role)` | Check if user has a role (SECURITY DEFINER) |
| `owns_case_document(text)` | Check if user owns a case document |
| `deduct_credits_atomic(uuid, int, text, uuid)` | Atomic credit deduction with row locking |
| `sanitize_profile_position()` | Strip HTML from position field (defense-in-depth) |
| `cms_encrypt_api_key(text)` | Encrypt CMS API keys via vault |
| `cms_decrypt_api_key(text)` | Decrypt CMS API keys via vault |

## Important Security Notes

1. Roles MUST be in `user_roles` table — never on `profiles`
2. Admin status NEVER checked via client-side storage
3. RLS policies enforce server-side access control
4. All admin routes have both client-side (AdminRoute) and server-side (RLS) protection
5. Credit deduction uses row-level locking to prevent race conditions
6. Profile position field sanitised at DB level (trigger)
