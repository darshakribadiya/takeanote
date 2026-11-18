-- ---------------------------------------------------------------------------
-- Profiles: the name collaborators see on shared notes and live cursors.
--
-- The source of truth is auth.users.raw_user_meta_data->>'full_name', which
-- the app sets with supabase.auth.signUp / updateUser({ data }). A trigger
-- mirrors it here so other people's names can be read through RLS-checked
-- functions without exposing auth.users.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 80),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users read their own row. Writes only happen through the trigger below,
-- so there is no insert/update policy for clients.
create policy "self read" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Example: raw_user_meta_data {"full_name": "  John Doe "} -> 'John Doe'
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, updated_at)
  values (new.id, nullif(left(btrim(new.raw_user_meta_data ->> 'full_name'), 80), ''), now())
  on conflict (id) do update
    set full_name = excluded.full_name, updated_at = now()
    where public.profiles.full_name is distinct from excluded.full_name;
  return new;
end;
$$;

revoke execute on function public.sync_profile_from_auth() from public, anon, authenticated;

create trigger sync_profile_from_auth
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth();

-- Existing accounts.
insert into public.profiles (id, full_name)
select u.id, nullif(left(btrim(u.raw_user_meta_data ->> 'full_name'), 80), '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- People on a note: the owner, plus (for the owner only) everyone who
-- joined through a link that still works. Emails are shown to the owner
-- only; members just see the owner's name.
-- Example row: (user_id, 'John Doe', 'john@example.com', 'edit', '2026-11-16 10:00')
-- ---------------------------------------------------------------------------

create or replace function public.note_people(p_note uuid)
returns table (user_id uuid, full_name text, email text, role text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.note_role(p_note);
begin
  if v_role is null then
    return;
  end if;

  return query
    select n.user_id, p.full_name,
      case when v_role = 'owner' then u.email::text end,
      'owner'::text, n.created_at
    from public.notes n
    join auth.users u on u.id = n.user_id
    left join public.profiles p on p.id = n.user_id
    where n.id = p_note;

  if v_role <> 'owner' then
    return;
  end if;

  -- One row per member; edit wins when they joined through both kinds of link.
  return query
    select distinct on (m.user_id)
      m.user_id, p.full_name, u.email::text, s.permission::text, m.joined_at
    from public.note_members m
    join public.note_shares s on s.id = m.share_id
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.note_id = p_note
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
    order by m.user_id, (s.permission = 'edit') desc, m.joined_at;
end;
$$;

revoke execute on function public.note_people(uuid) from public, anon;
grant execute on function public.note_people(uuid) to authenticated;
