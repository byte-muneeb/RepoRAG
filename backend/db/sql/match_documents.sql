create extension if not exists vector;

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
