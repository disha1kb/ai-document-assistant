import { supabase } from './supabase';

const EDGE_FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const EDGE_FUNCTION_HEADERS = {
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export interface StoredChunk {
  content: string;
  page_number: number | null;
  chunk_index: number;
}

export async function createDocumentRecord(
  sessionId: string,
  filename: string,
  fileType: 'pdf' | 'txt',
  pageCount: number | null
): Promise<string> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      session_id: sessionId,
      filename,
      file_type: fileType,
      page_count: pageCount,
      status: 'processing',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create document record: ${error.message}`);
  return data.id;
}

export async function processChunks(
  documentId: string,
  sessionId: string,
  chunks: StoredChunk[]
): Promise<void> {
  const response = await fetch(`${EDGE_FUNCTION_BASE}/rag-process`, {
    method: 'POST',
    headers: EDGE_FUNCTION_HEADERS,
    body: JSON.stringify({ document_id: documentId, session_id: sessionId, chunks }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errBody.error || `Processing failed (${response.status})`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
}

export interface QuerySource {
  content: string;
  page_number: number | null;
  filename: string;
  similarity: number;
}

export interface QueryResult {
  answer: string;
  sources: QuerySource[];
  retrieved_count: number;
  error?: string;
}

export async function queryDocument(sessionId: string, question: string): Promise<QueryResult> {
  const response = await fetch(`${EDGE_FUNCTION_BASE}/rag-query`, {
    method: 'POST',
    headers: EDGE_FUNCTION_HEADERS,
    body: JSON.stringify({ session_id: sessionId, question }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errBody.error || `Query failed (${response.status})`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return {
    answer: data.answer,
    sources: data.sources ?? [],
    retrieved_count: data.retrieved_count ?? 0,
  };
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', documentId);
  if (error) throw new Error(`Failed to delete document: ${error.message}`);
}

export async function getDocuments(sessionId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, filename, file_type, page_count, chunk_count, status, error_message, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch documents: ${error.message}`);
  return data;
}
