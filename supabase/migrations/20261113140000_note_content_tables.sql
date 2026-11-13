-- Separate storage for the two kinds of note.
--
-- `notes` keeps what every note shares: owner, kind, folder, title and
-- plain-text projection, flags, timestamps, search. Tags, share links,
-- members and the Yjs update log keep pointing at notes.id.
--
-- The content moves to one 1:1 child table per kind:
--   note_documents  Yjs snapshot + paper settings (size, margins, header…)
--   note_canvases   Yjs snapshot + board stats (node / edge counts)
--
-- A composite foreign key (note_id, kind) -> notes (id, kind), plus a
-- CHECK pinning each child's kind, makes it impossible for a document
-- note to own a canvas row or the reverse. A trigger creates the matching
-- child row whenever a note is inserted.
--
-- Clients never write the child tables directly: the snapshot is written
-- by compact_note(), the settings columns by update_note_text().
-- The Yjs document stays the source of truth while editing, so paper
-- settings still sync live between collaborators; the columns mirror it
-- for queries, exports and server-side features.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.notes add constraint notes_id_kind_key unique (id, kind);

create table public.note_documents (
  note_id uuid primary key,
  kind public.note_kind not null default 'document' check (kind = 'document'),
  -- Compacted Yjs state (base64) covering every update with id <= ydoc_seq.
  ydoc text,
  ydoc_seq bigint not null default 0,
  paper_size text not null default 'a4'
    check (paper_size in ('a4', 'a5', 'a6', 'letter', 'legal', 'custom')),
  -- Only used when paper_size = 'custom'. Example: 210 x 297 (A4)
  paper_width_mm numeric(6, 1) not null default 210 check (paper_width_mm between 50 and 1000),
  paper_height_mm numeric(6, 1) not null default 297 check (paper_height_mm between 50 and 1000),
  orientation text not null default 'portrait' check (orientation in ('portrait', 'landscape')),
  layout text not null default 'paged' check (layout in ('paged', 'continuous')),
  pattern text not null default 'plain' check (pattern in ('plain', 'ruled', 'grid', 'dotted')),
  margin_mm numeric(5, 1) not null default 25.4 check (margin_mm between 0 and 100),
  line_height numeric(3, 2) not null default 1.6 check (line_height between 1 and 3),
  header text not null default '' check (char_length(header) <= 120),
  footer text not null default '' check (char_length(footer) <= 120),
  page_numbers boolean not null default true,
  updated_at timestamptz not null default now(),
  foreign key (note_id, kind) references public.notes (id, kind) on delete cascade
);

create table public.note_canvases (
  note_id uuid primary key,
  kind public.note_kind not null default 'canvas' check (kind = 'canvas'),
  ydoc text,
  ydoc_seq bigint not null default 0,
  node_count integer not null default 0 check (node_count >= 0),
  edge_count integer not null default 0 check (edge_count >= 0),
  updated_at timestamptz not null default now(),
  foreign key (note_id, kind) references public.notes (id, kind) on delete cascade
);

create trigger note_documents_set_updated_at
  before update on public.note_documents
  for each row execute function public.set_updated_at();

create trigger note_canvases_set_updated_at
  before update on public.note_canvases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Move existing content, then drop it from notes
-- ---------------------------------------------------------------------------

insert into public.note_documents (note_id, ydoc, ydoc_seq)
select id, ydoc, ydoc_seq from public.notes where kind = 'document';

insert into public.note_canvases (note_id, ydoc, ydoc_seq)
select id, ydoc, ydoc_seq from public.notes where kind = 'canvas';

alter table public.notes drop column ydoc, drop column ydoc_seq;

-- ---------------------------------------------------------------------------
-- Every note gets exactly the child row its kind calls for
-- ---------------------------------------------------------------------------

create or replace function public.notes_create_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'canvas' then
    insert into public.note_canvases (note_id) values (new.id);
  else
    insert into public.note_documents (note_id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger notes_create_content
  after insert on public.notes
  for each row execute function public.notes_create_content();

-- ---------------------------------------------------------------------------
-- Row Level Security: readable by anyone with access, written only by
-- the trigger and the RPCs below.
-- ---------------------------------------------------------------------------

alter table public.note_documents enable row level security;
alter table public.note_canvases enable row level security;

create policy "note members read" on public.note_documents for select to authenticated
  using (public.note_role(note_id) is not null);

create policy "note members read" on public.note_canvases for select to authenticated
  using (public.note_role(note_id) is not null);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

/*
 * Folds updates with id <= p_upto into the snapshot of the note's
 * content table. Older compactions never overwrite newer ones.
 */
create or replace function public.compact_note(p_note uuid, p_snapshot text, p_upto bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.note_kind;
begin
  -- Owner only: a snapshot replaces history, so link editors can't wipe it.
  if public.note_role(p_note) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select kind into v_kind from public.notes where id = p_note;

  if v_kind = 'canvas' then
    update public.note_canvases set ydoc = p_snapshot, ydoc_seq = p_upto
    where note_id = p_note and ydoc_seq < p_upto;
  else
    update public.note_documents set ydoc = p_snapshot, ydoc_seq = p_upto
    where note_id = p_note and ydoc_seq < p_upto;
  end if;

  if not found then
    return false;
  end if;
  delete from public.note_updates where note_id = p_note and id <= p_upto;
  return true;
end;
$$;

/*
 * Plain-text projection (list + search) plus the kind-specific summary
 * columns, written by owners and editors after they change the note.
 * Missing or null keys in p_meta leave the column as it is.
 *
 * Example p_meta for a document: {"paper_size": "a5", "orientation": "landscape", "page_numbers": false}
 * Example p_meta for a canvas:   {"node_count": 12, "edge_count": 4}
 */
drop function if exists public.update_note_text(uuid, text, text);

create function public.update_note_text(p_note uuid, p_title text, p_content text, p_meta jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.note_kind;
begin
  -- coalesce: no access means note_role() is null, and `null not in (...)`
  -- is null (not true), which would let anyone through.
  if coalesce(public.note_role(p_note), '') not in ('owner', 'edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.notes set title = left(p_title, 500), content = left(p_content, 2000000)
  where id = p_note
    and (title is distinct from left(p_title, 500) or content is distinct from left(p_content, 2000000))
  returning kind into v_kind;

  if p_meta is null then
    return;
  end if;
  if v_kind is null then
    select kind into v_kind from public.notes where id = p_note;
  end if;

  if v_kind = 'canvas' then
    update public.note_canvases set
      node_count = coalesce((p_meta ->> 'node_count')::integer, node_count),
      edge_count = coalesce((p_meta ->> 'edge_count')::integer, edge_count)
    where note_id = p_note;
  else
    update public.note_documents set
      paper_size = coalesce(p_meta ->> 'paper_size', paper_size),
      paper_width_mm = coalesce((p_meta ->> 'paper_width_mm')::numeric, paper_width_mm),
      paper_height_mm = coalesce((p_meta ->> 'paper_height_mm')::numeric, paper_height_mm),
      orientation = coalesce(p_meta ->> 'orientation', orientation),
      layout = coalesce(p_meta ->> 'layout', layout),
      pattern = coalesce(p_meta ->> 'pattern', pattern),
      margin_mm = coalesce((p_meta ->> 'margin_mm')::numeric, margin_mm),
      line_height = coalesce((p_meta ->> 'line_height')::numeric, line_height),
      header = coalesce(left(p_meta ->> 'header', 120), header),
      footer = coalesce(left(p_meta ->> 'footer', 120), footer),
      page_numbers = coalesce((p_meta ->> 'page_numbers')::boolean, page_numbers)
    where note_id = p_note;
  end if;
end;
$$;

revoke all on function public.notes_create_content() from public;
revoke all on function public.update_note_text(uuid, text, text, jsonb) from public;
grant execute on function public.update_note_text(uuid, text, text, jsonb) to authenticated;
