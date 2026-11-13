-- Notes become collaborative documents (Yjs) with two kinds: paper
-- documents and canvas boards.
--
-- Every note's real content is a Yjs document (CRDT), stored as a
-- compacted snapshot on `notes.ydoc` plus an append-only log of small
-- updates in `note_updates`. Concurrent edits merge automatically, so the
-- compare-and-swap `version` column and its RPCs go away.
--
-- `notes.title` / `notes.content` stay as plain-text projections written
-- by clients for the list preview and full-text search. Existing notes
-- keep them; the app copies that text into a Yjs document the first time
-- the owner opens such a note.
--
-- Access: the owner, plus anyone who joined through a live share link
-- (`note_members`). One function, `note_role()`, answers "what may the
-- current user do with this note?" for tables, storage and realtime.

-- ---------------------------------------------------------------------------
-- Old compare-and-swap model
-- ---------------------------------------------------------------------------

drop function if exists public.get_shared_note(text);
drop function if exists public.update_shared_note(text, text, text, integer);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------

create type public.note_kind as enum ('document', 'canvas');

alter table public.notes
  add column kind public.note_kind not null default 'document',
  -- Compacted Yjs state (base64) covering every update with id <= ydoc_seq.
  add column ydoc text,
  add column ydoc_seq bigint not null default 0,
  drop column version;

-- Plain-text projections of large documents can be longer than before.
alter table public.notes drop constraint if exists notes_content_check;
alter table public.notes add constraint notes_content_check check (char_length(content) <= 2000000);

create or replace function public.notes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.title is distinct from old.title or new.content is distinct from old.content then
    new.content_updated_at = now();
  end if;
  new.user_id = old.user_id;
  new.kind = old.kind;
  return new;
end;
$$;

-- Append-only Yjs update log; compaction folds it into notes.ydoc.
create table public.note_updates (
  id bigint generated always as identity primary key,
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- base64 Yjs update. Example: "AQLN0r..." (usually well under 1 KB)
  update text not null check (char_length(update) <= 5000000),
  created_at timestamptz not null default now()
);

create index note_updates_note_id_idx on public.note_updates (note_id, id);
create index note_updates_user_id_idx on public.note_updates (user_id);

-- ---------------------------------------------------------------------------
-- Share-link members
-- ---------------------------------------------------------------------------

/*
 * A visitor (usually a silent anonymous session) who opened a share link.
 * Rights are never stored here: they are read live from the share row,
 * so revoking or expiring the link cuts access immediately.
 */
create table public.note_members (
  share_id uuid not null references public.note_shares (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

create index note_members_user_note_idx on public.note_members (user_id, note_id);
create index note_members_note_id_idx on public.note_members (note_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

/*
 * 'owner' | 'edit' | 'view' | null for the current user.
 * Security definer so policies can call it without recursing into RLS.
 */
create or replace function public.note_role(p_note uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.notes n where n.id = p_note and n.user_id = (select auth.uid())
    ) then 'owner'
    when exists (
      select 1
      from public.note_members m
      join public.note_shares s on s.id = m.share_id
      join public.notes n on n.id = m.note_id
      where m.note_id = p_note
        and m.user_id = (select auth.uid())
        and s.permission = 'edit'
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
        and n.deleted_at is null
    ) then 'edit'
    when exists (
      select 1
      from public.note_members m
      join public.note_shares s on s.id = m.share_id
      join public.notes n on n.id = m.note_id
      where m.note_id = p_note
        and m.user_id = (select auth.uid())
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
        and n.deleted_at is null
    ) then 'view'
  end;
$$;

-- Realtime topics look like "note:<uuid>"; anything else yields null.
create or replace function public.note_id_from_topic(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^note:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(p_topic, 6)::uuid
  end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.note_updates enable row level security;
alter table public.note_members enable row level security;

-- Members can read the row (title, kind, snapshot); only owners change it.
drop policy "owner all" on public.notes;
create policy "owner or member read" on public.notes for select to authenticated
  using (user_id = (select auth.uid()) or public.note_role(id) is not null);
create policy "owner insert" on public.notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = (select auth.uid())
    ))
  );
create policy "owner update" on public.notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = (select auth.uid())
    ))
  );
create policy "owner delete" on public.notes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "members read" on public.note_updates for select to authenticated
  using (public.note_role(note_id) is not null);
create policy "editors append" on public.note_updates for insert to authenticated
  with check (user_id = (select auth.uid()) and public.note_role(note_id) in ('owner', 'edit'));

-- Members see their own memberships; owners see who joined their notes.
create policy "member or owner read" on public.note_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

/*
 * Exchanges a share token for membership. Returns the note to open, or
 * nothing when the link is invalid, revoked or expired.
 */
create or replace function public.join_share(p_token text)
returns table (note_id uuid, kind public.note_kind, title text, permission public.share_permission)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.note_shares%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;

  select s.* into v_share
  from public.note_shares s
  join public.notes n on n.id = s.note_id
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and n.deleted_at is null;

  if not found then
    return;
  end if;

  -- The owner opening their own link needs no membership.
  if v_share.user_id <> auth.uid() then
    insert into public.note_members (share_id, user_id, note_id)
    values (v_share.id, auth.uid(), v_share.note_id)
    on conflict do nothing;
  end if;

  return query
    select n.id, n.kind, n.title,
      case when v_share.user_id = auth.uid() then 'edit'::public.share_permission else v_share.permission end
    from public.notes n
    where n.id = v_share.note_id;
end;
$$;

-- Plain-text projection for list/search, callable by owners and editors.
create or replace function public.update_note_text(p_note uuid, p_title text, p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.note_role(p_note) not in ('owner', 'edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.notes set title = left(p_title, 500), content = left(p_content, 2000000)
  where id = p_note and (title is distinct from left(p_title, 500) or content is distinct from left(p_content, 2000000));
end;
$$;

/*
 * Folds updates with id <= p_upto into the snapshot. The snapshot must
 * contain every one of those updates (it may contain more: Yjs merges
 * are idempotent). Older compactions never overwrite newer ones.
 */
create or replace function public.compact_note(p_note uuid, p_snapshot text, p_upto bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Owner only: a snapshot replaces history, so link editors can't wipe it.
  if public.note_role(p_note) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.notes set ydoc = p_snapshot, ydoc_seq = p_upto
  where id = p_note and ydoc_seq < p_upto;
  if not found then
    return false;
  end if;
  delete from public.note_updates where note_id = p_note and id <= p_upto;
  return true;
end;
$$;

revoke all on function public.note_role(uuid) from public;
revoke all on function public.join_share(text) from public;
revoke all on function public.update_note_text(uuid, text, text) from public;
revoke all on function public.compact_note(uuid, text, bigint) from public;
grant execute on function public.note_role(uuid) to authenticated;
grant execute on function public.join_share(text) to authenticated;
grant execute on function public.update_note_text(uuid, text, text) to authenticated;
grant execute on function public.compact_note(uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live Yjs updates and cursors
-- ---------------------------------------------------------------------------

/*
 * Updates and cursors travel over private broadcast channels
 * "note:<uuid>". Anyone with access may listen; only editors may send.
 */
create policy "note members receive" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.note_role(public.note_id_from_topic((select realtime.topic()))) is not null
  );

/*
 * Viewers must not send: a forged update applied by an editor's client
 * would end up in that editor's next snapshot.
 */
create policy "note editors send" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.note_role(public.note_id_from_topic((select realtime.topic()))) in ('owner', 'edit')
  );

-- ---------------------------------------------------------------------------
-- Attachments (Storage)
-- ---------------------------------------------------------------------------

-- Path: <note_id>/<uuid>/<file name>. 25 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;

create policy "note members read attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.note_role((storage.foldername(name))[1]::uuid) is not null
  );

create policy "note editors upload attachments" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.note_role((storage.foldername(name))[1]::uuid) in ('owner', 'edit')
  );

create policy "note owners delete attachments" on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.note_role((storage.foldername(name))[1]::uuid) = 'owner'
  );
