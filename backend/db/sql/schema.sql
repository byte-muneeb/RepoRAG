create extension if not exists vector;

create table if not exists public.repositories (
  id uuid primary key,
  repo_url text not null,
  owner text,
  name text,
  default_branch text,
  head_sha text,
  status text not null default 'queued',
  total_files int not null default 0,
  indexed_files int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repo_files (
  id bigserial primary key,
  repository_id uuid not null references public.repositories(id) on delete cascade,
  path text not null,
  language text,
  sha text,
  size_bytes int not null default 0,
  is_binary boolean not null default false,
  unique (repository_id, path)
);

create table if not exists public.code_chunks (
  id bigserial primary key,
  repository_id uuid not null references public.repositories(id) on delete cascade,
  file_id bigint not null references public.repo_files(id) on delete cascade,
  chunk_index int not null,
  symbol text,
  content text not null,
  token_count int not null default 0,
  start_line int,
  end_line int,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768)
);

create index if not exists idx_repo_files_repository_id on public.repo_files(repository_id);
create index if not exists idx_code_chunks_repository_id on public.code_chunks(repository_id);
create index if not exists idx_code_chunks_file_id on public.code_chunks(file_id);

create index if not exists idx_code_chunks_embedding
on public.code_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create or replace function public.match_documents(
  query_embedding vector(768),
  match_repo_id uuid,
  match_count int default 8,
  min_score float default 0.20
)
returns table (
  chunk_id bigint,
  file_path text,
  content text,
  score float,
  start_line int,
  end_line int,
  metadata jsonb
)
language sql
stable
as $$
  select
    c.id as chunk_id,
    f.path as file_path,
    c.content,
    (1 - (c.embedding <=> query_embedding))::float as score,
    c.start_line,
    c.end_line,
    c.metadata
  from public.code_chunks c
  join public.repo_files f on f.id = c.file_id
  where c.repository_id = match_repo_id
    and (1 - (c.embedding <=> query_embedding)) >= min_score
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
