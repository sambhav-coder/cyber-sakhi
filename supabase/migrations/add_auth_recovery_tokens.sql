-- Secure account recovery tokens (single-use, short-lived, hashed server-side).
create table if not exists auth_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- Only the bcrypt-sha256 hash of the token is ever stored, never the token itself.
create unique index if not exists idx_auth_recovery_tokens_hash on auth_recovery_tokens(token_hash);
create index if not exists idx_auth_recovery_tokens_profile on auth_recovery_tokens(profile_id);