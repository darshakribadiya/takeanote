-- Quick Notes: initial schema
-- Every table is owned by a user (auth.users.id); RLS enforces ownership.
-- Shared-link access never goes through table RLS; it goes through the
-- security-definer RPCs at the bottom so a token is the only key needed.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Folders
-- ---------------------------------------------------------------------------

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index folders_user_id_idx on public.folders (user_id);
create index folders_parent_id_idx on public.folders (parent_id);

create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  title text not null default '' check (char_length(title) <= 500),
  content text not null default '' check (char_length(content) <= 1000000),
  is_favorite boolean not null default false,
  is_pinned boolean not null default false,
  /*
   * Optimistic-concurrency counter. Bumped only when title/content change
   * so toggling favorite or opening a note never causes a false conflict.
   * Clients save with: update ... where id = $1 and version = $expected.
   */
  version integer not null default 1,
  content_updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- First 200 chars so the list can show title + preview without full bodies.
  excerpt text generated always as (left(content, 200)) stored,
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) stored
);

-- Main list query: a user's live notes, most recently edited first.
create index notes_user_live_idx on public.notes (user_id, is_pinned desc, content_updated_at desc)
  where deleted_at is null and archived_at is null;
create index notes_user_recent_idx on public.notes (user_id, last_accessed_at desc)
  where deleted_at is null;
create index notes_folder_id_idx on public.notes (folder_id);
create index notes_search_idx on public.notes using gin (search);
create index notes_title_trgm_idx on public.notes using gin (title extensions.gin_trgm_ops);

create or replace function public.notes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.title is distinct from old.title or new.content is distinct from old.content then
    new.version = old.version + 1;
    new.content_updated_at = now();
  else
    -- Clients cannot move the version counter on their own.
    new.version = old.version;
  end if;
  -- Ownership is immutable.
  new.user_id = old.user_id;
  return new;
end;
$$;

create trigger notes_before_update
  before update on public.notes
  for each row execute function public.notes_before_update();

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  color text,
  created_at timestamptz not null default now()
);

create unique index tags_user_name_key on public.tags (user_id, lower(name));

create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create index note_tags_tag_id_idx on public.note_tags (tag_id);
create index note_tags_user_id_idx on public.note_tags (user_id);

-- ---------------------------------------------------------------------------
-- Share links
-- ---------------------------------------------------------------------------

create type public.share_permission as enum ('view', 'edit');

create table public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 32 random bytes, URL-safe. Example: /s/Zk3v...Q (43 chars)
  token text not null unique default
    replace(replace(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+', '-'), '/', '_'),
  permission public.share_permission not null default 'view',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index note_shares_note_id_idx on public.note_shares (note_id);
create index note_shares_user_id_idx on public.note_shares (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.folders enable row level security;
alter table public.notes enable row level security;
alter table public.tags enable row level security;
alter table public.note_tags enable row level security;
alter table public.note_shares enable row level security;

-- (select auth.uid()) is evaluated once per statement instead of per row.
create policy "owner all" on public.folders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "owner all" on public.notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = (select auth.uid())
    ))
  );

create policy "owner all" on public.tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "owner all" on public.note_tags for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid()))
  );

create policy "owner all" on public.note_shares for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Shared-link RPCs (callable by anon and authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_note(p_token text)
returns table (
  id uuid,
  title text,
  content text,
  version integer,
  content_updated_at timestamptz,
  permission public.share_permission
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.title, n.content, n.version, n.content_updated_at, s.permission
  from public.note_shares s
  join public.notes n on n.id = s.note_id
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and n.deleted_at is null;
$$;

/*
 * Compare-and-swap save for edit links. Returns the new version on
 * success, or null when the version moved (someone else saved first)
 * so the client can fetch the latest and resolve the conflict.
 */
create or replace function public.update_shared_note(
  p_token text,
  p_title text,
  p_content text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note_id uuid;
  v_version integer;
begin
  select s.note_id into v_note_id
  from public.note_shares s
  join public.notes n on n.id = s.note_id
  where s.token = p_token
    and s.permission = 'edit'
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and n.deleted_at is null;

  if v_note_id is null then
    raise exception 'share link is invalid, expired, or read-only' using errcode = '42501';
  end if;

  update public.notes
  set title = p_title, content = p_content
  where id = v_note_id and version = p_expected_version
  returning version into v_version;

  return v_version;
end;
$$;

revoke all on function public.get_shared_note(text) from public;
revoke all on function public.update_shared_note(text, text, text, integer) from public;
grant execute on function public.get_shared_note(text) to anon, authenticated;
grant execute on function public.update_shared_note(text, text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

/*
 * With RLS on, DELETE events carry only the primary key, which is enough:
 * notes -> id, note_tags -> (note_id, tag_id).
 */
alter publication supabase_realtime add table public.notes, public.folders, public.tags, public.note_tags;
