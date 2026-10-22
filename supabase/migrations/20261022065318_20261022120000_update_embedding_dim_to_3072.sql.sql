/*
# Update embedding dimension from 768 to 3072

1. Purpose
   Gemini's text-embedding-004 model returns 3072-dimensional vectors, not 768.
   The document_chunks.embedding column and the match_document_chunks RPC
   function parameter were both defined as vector(768), causing a dimension
   mismatch error whenever the edge function tried to insert embeddings.

2. Changes
   - Delete all old data (768-dim embeddings are incompatible with 3072).
   - Drop the old IVFFlat index on document_chunks.embedding.
   - Alter document_chunks.embedding column type from vector(768) to vector(3072).
   - No vector similarity index: both IVFFlat and HNSW have a 2000-dimension
     limit in pgvector, so 3072-dim vectors cannot use either index type.
     Vector search falls back to exact nearest neighbor (sequential scan with
     cosine distance), which is correct and fast enough for this app's scale.
   - Recreate the match_document_chunks RPC with vector(3072) parameter.

3. Data
   All existing rows in document_chunks and documents are deleted because
   old 768-dim embeddings cannot be cast to 3072. Users will re-upload documents.

4. Security
   No RLS policy changes. Existing policies remain in place.
*/

-- Delete old data with incompatible embeddings
DELETE FROM document_chunks;
DELETE FROM documents;

-- Drop old vector index (was built for 768 dims, incompatible with 3072)
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Change embedding column to 3072 dimensions
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(3072);

-- No vector index: pgvector's IVFFlat and HNSW both cap at 2000 dimensions.
-- Exact nearest-neighbor search (sequential scan) is used instead.

-- Recreate the match RPC with 3072-dim parameter
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(3072),
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
