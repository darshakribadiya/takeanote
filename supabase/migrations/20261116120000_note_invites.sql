-- ---------------------------------------------------------------------------
-- Share a note with a specific email address.
--
-- An invite is waiting until an account with that email exists, then it is
-- claimed (invitee_id set) and that account can open the note with the
-- invite's permission. One active invite per email per note: inviting the
-- same email again updates permission and expiry.
--
-- Clients never read this table directly (RLS on, no policies): owners and
-- invitees go through the security definer functions below, which hide
-- whether an email already has an account until the invite is opened.
-- ---------------------------------------------------------------------------

create table public.note_invites (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  -- The note owner who sent the invite.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Lower-cased. Example: 'ada@example.com'
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invitee_id uuid references auth.users (id) on delete set null,
  permission public.share_permission not null default 'view',
  expires_at timestamptz,
  revoked_at timestamptz,
  opened_at timestamptz,
  last_opened_at timestamptz,
  last_edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index note_invites_active_email_idx on public.note_invites (note_id, email) where revoked_at is null;
create index note_invites_invitee_idx on public.note_invites (invitee_id, note_id);
create index note_invites_unclaimed_email_idx on public.note_invites (email) where invitee_id is null;
create index note_invites_user_id_idx on public.note_invites (user_id);

alter table public.note_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Access: invited users join owners and link members in note_role(), so
-- RLS on notes, note_updates, Realtime and Storage admits them too.
-- ---------------------------------------------------------------------------

create or replace function public.note_role(p_note uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with grants as (
    select s.permission
    from public.note_members m
    join public.note_shares s on s.id = m.share_id
    where m.note_id = p_note
      and m.user_id = (select auth.uid())
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
    union all
    select i.permission
    from public.note_invites i
    where i.note_id = p_note
      and i.invitee_id = (select auth.uid())
      and i.revoked_at is null
      and (i.expires_at is null or i.expires_at > now())
  )
  select case
    when exists (
      select 1 from public.notes n where n.id = p_note and n.user_id = (select auth.uid())
    ) then 'owner'
    when not exists (select 1 from public.notes n where n.id = p_note and n.deleted_at is null) then null
    when exists (select 1 from grants where permission = 'edit') then 'edit'
    when exists (select 1 from grants) then 'view'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Claiming: an account with a confirmed email picks up its waiting invites.
-- ---------------------------------------------------------------------------

create or replace function public.claim_note_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update public.note_invites
    set invitee_id = new.id, updated_at = now()
    where invitee_id is null
      and email = lower(new.email)
      and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.claim_note_invites() from public, anon, authenticated;

create trigger claim_note_invites
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.claim_note_invites();

-- ---------------------------------------------------------------------------
-- "Edited" status: stamped when the invitee saves changes, at most once a
-- minute so typing doesn't rewrite the row on every update.
-- ---------------------------------------------------------------------------

create or replace function public.note_invites_mark_edited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.note_invites
  set last_edited_at = now()
  where note_id = new.note_id
    and invitee_id = new.user_id
    and revoked_at is null
    and (last_edited_at is null or last_edited_at < now() - interval '1 minute');
  return new;
end;
$$;

revoke execute on function public.note_invites_mark_edited() from public, anon, authenticated;

create trigger note_invites_mark_edited
  after insert on public.note_updates
  for each row execute function public.note_invites_mark_edited();

-- ---------------------------------------------------------------------------
-- Owner RPCs
-- ---------------------------------------------------------------------------

-- Invite (or update the invite of) one email. Returns the invite id.
create or replace function public.share_note_with_email(
  p_note uuid,
  p_email text,
  p_permission public.share_permission,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if v_me is null or not exists (
    select 1 from public.notes n where n.id = p_note and n.user_id = v_me and n.deleted_at is null
  ) then
    raise exception 'Only the owner can share this note' using errcode = '42501';
  end if;

  if v_email = (select lower(u.email) from auth.users u where u.id = v_me) then
    raise exception 'That is your own email' using errcode = '22023';
  end if;

  insert into public.note_invites (note_id, user_id, email, permission, expires_at, invitee_id)
  values (
    p_note, v_me, v_email, p_permission, p_expires_at,
    (select u.id from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null)
  )
  on conflict (note_id, email) where revoked_at is null do update
    set permission = excluded.permission,
        expires_at = excluded.expires_at,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

/*
 * The note's active invites with their status. Names and ids appear only
 * once the invite was opened, so the list never reveals which emails
 * already have an account.
 */
create or replace function public.list_note_invites(p_note uuid)
returns table (
  id uuid,
  email text,
  permission public.share_permission,
  expires_at timestamptz,
  created_at timestamptz,
  opened_at timestamptz,
  last_opened_at timestamptz,
  last_edited_at timestamptz,
  invitee_id uuid,
  full_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.email, i.permission, i.expires_at, i.created_at,
    i.opened_at, i.last_opened_at, i.last_edited_at,
    case when i.opened_at is not null then i.invitee_id end,
    case when i.opened_at is not null then p.full_name end
  from public.note_invites i
  join public.notes n on n.id = i.note_id
  left join public.profiles p on p.id = i.invitee_id
  where i.note_id = p_note
    and n.user_id = (select auth.uid())
    and i.revoked_at is null
  order by i.created_at desc;
$$;

create or replace function public.revoke_note_invite(p_invite uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.note_invites i
  set revoked_at = now(), updated_at = now()
  where i.id = p_invite
    and i.revoked_at is null
    and i.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Invitee RPCs
-- ---------------------------------------------------------------------------

/*
 * Opens a note shared with the caller's email and records the visit.
 * Returns the note to open, or nothing when there is no working invite.
 * Example row: (note_id, 'document', 'Plan', 'edit')
 */
create or replace function public.open_invited_note(p_note uuid)
returns table (note_id uuid, kind public.note_kind, title text, permission public.share_permission)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;

  -- The owner opening the personal link just edits their own note.
  if exists (select 1 from public.notes n where n.id = p_note and n.user_id = v_me and n.deleted_at is null) then
    return query select n.id, n.kind, n.title, 'edit'::public.share_permission from public.notes n where n.id = p_note;
    return;
  end if;

  update public.note_invites i
  set opened_at = coalesce(i.opened_at, now()), last_opened_at = now()
  where i.note_id = p_note
    and i.invitee_id = v_me
    and i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now());

  return query
    select n.id, n.kind, n.title,
      (case when public.note_role(p_note) = 'edit' then 'edit' else 'view' end)::public.share_permission
    from public.notes n
    where n.id = p_note
      and n.deleted_at is null
      and exists (
        select 1 from public.note_invites i
        where i.note_id = p_note
          and i.invitee_id = v_me
          and i.revoked_at is null
          and (i.expires_at is null or i.expires_at > now())
      );
end;
$$;

-- Notes shared with the caller's email, newest content first.
create or replace function public.shared_with_me()
returns table (
  note_id uuid,
  kind public.note_kind,
  title text,
  excerpt text,
  permission public.share_permission,
  owner_name text,
  shared_at timestamptz,
  expires_at timestamptz,
  content_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select distinct on (n.id)
      n.id, n.kind, n.title, n.excerpt, i.permission,
      coalesce(p.full_name, owner.email::text), i.created_at, i.expires_at, n.content_updated_at
    from public.note_invites i
    join public.notes n on n.id = i.note_id
    join auth.users owner on owner.id = n.user_id
    left join public.profiles p on p.id = n.user_id
    where i.invitee_id = (select auth.uid())
      and i.revoked_at is null
      and (i.expires_at is null or i.expires_at > now())
      and n.deleted_at is null
    order by n.id, (i.permission = 'edit') desc
  ) shared
  order by shared.content_updated_at desc;
$$;

revoke execute on function public.share_note_with_email(uuid, text, public.share_permission, timestamptz) from public, anon;
revoke execute on function public.list_note_invites(uuid) from public, anon;
revoke execute on function public.revoke_note_invite(uuid) from public, anon;
revoke execute on function public.open_invited_note(uuid) from public, anon;
revoke execute on function public.shared_with_me() from public, anon;
grant execute on function public.share_note_with_email(uuid, text, public.share_permission, timestamptz) to authenticated;
grant execute on function public.list_note_invites(uuid) to authenticated;
grant execute on function public.revoke_note_invite(uuid) to authenticated;
grant execute on function public.open_invited_note(uuid) to authenticated;
grant execute on function public.shared_with_me() to authenticated;
