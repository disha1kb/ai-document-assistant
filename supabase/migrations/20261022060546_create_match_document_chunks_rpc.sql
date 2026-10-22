/*
# Create match_document_chunks RPC function

1. Purpose
   Provides a vector similarity search function that finds the top-k most
   semantically similar document chunks to a given query embedding, filtered
   by session_id so users only search their own documents.

2. New Functions
   - `match_document_chunks(query_embedding vector(768), match_count int, filter_session_id text)`
     Returns: table of (id uuid, document_id uuid, session_id text, chunk_index int,
              content text, page_number int, similarity float)
     Uses cosine distance operator (<=>) from pgvector.
     Filters by session_id to enforce document isolation between sessions.

3. Security
   This function is SECURITY DEFINER to allow access to the vector index.
   It runs with the owner's privileges and only reads from document_chunks.
   Accessible by anon and authenticated roles.
*/

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  filter_session_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  session_id text,
  chunk_index int,
  content text,
  page_number int,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.session_id,
    dc.chunk_index,
    dc.content,
    dc.page_number,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND (filter_session_id IS NULL OR dc.session_id = filter_session_id)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_document_chunks TO anon, authenticated;
