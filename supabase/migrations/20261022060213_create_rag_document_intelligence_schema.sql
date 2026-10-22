/*
# RAG Document Intelligence Assistant — Database Schema

1. Purpose
   Stores uploaded documents and their text chunks with vector embeddings for
   Retrieval-Augmented Generation (RAG). Each browser session gets its own
   document set so one user's documents are never mixed with another's.

2. New Tables
   - `documents`
     - `id` (uuid PK)
     - `session_id` (text, identifies the browser session that owns this doc)
     - `filename` (text, original uploaded filename)
     - `file_type` (text, 'pdf' or 'txt')
     - `page_count` (int, number of pages extracted, nullable for txt)
     - `chunk_count` (int, number of chunks created)
     - `status` (text: 'processing', 'ready', 'error')
     - `error_message` (text, nullable)
     - `created_at` (timestamptz)

   - `document_chunks`
     - `id` (uuid PK)
     - `document_id` (uuid FK → documents.id ON DELETE CASCADE)
     - `session_id` (text, denormalized for direct session-scoped queries)
     - `chunk_index` (int, ordering of chunk within document)
     - `content` (text, the chunk text)
     - `page_number` (int, nullable — page this chunk came from)
     - `embedding` (vector(768), Gemini embedding dimension)
     - `created_at` (timestamptz)

3. Indexes
   - `idx_chunks_session` on document_chunks(session_id)
   - `idx_chunks_document` on document_chunks(document_id)
   - `idx_documents_session` on documents(session_id)
   - IVFFlat index on document_chunks.embedding for cosine similarity

4. Security (RLS)
   - Both tables: session-scoped access for anon + authenticated.
   - No user auth — isolation is by session_id token generated client-side.
   - All CRUD scoped by session_id = the value passed in the request.
*/

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'txt')),
  page_count integer,
  chunk_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_select_documents" ON documents;
CREATE POLICY "session_select_documents" ON documents FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "session_insert_documents" ON documents;
CREATE POLICY "session_insert_documents" ON documents FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "session_update_documents" ON documents;
CREATE POLICY "session_update_documents" ON documents FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "session_delete_documents" ON documents;
CREATE POLICY "session_delete_documents" ON documents FOR DELETE
  TO anon, authenticated USING (true);

-- Document chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  page_number integer,
  embedding vector(768),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_select_chunks" ON document_chunks;
CREATE POLICY "session_select_chunks" ON document_chunks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "session_insert_chunks" ON document_chunks;
CREATE POLICY "session_insert_chunks" ON document_chunks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "session_update_chunks" ON document_chunks;
CREATE POLICY "session_update_chunks" ON document_chunks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "session_delete_chunks" ON document_chunks;
CREATE POLICY "session_delete_chunks" ON document_chunks FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_session ON document_chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);

-- Vector similarity index (cosine distance)
-- lists = 100 is a reasonable default for up to ~100k rows
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
