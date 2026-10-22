import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChunkPayload {
  document_id: string;
  session_id: string;
  chunks: { content: string; page_number: number | null; chunk_index: number }[];
}

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const EMBEDDING_MODELS = ["text-embedding-004", "gemini-embedding-001", "embedding-001"];
const EMBEDDING_DIM = 3072;
const EMBED_CONCURRENCY = 20;
const DB_INSERT_BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 30000;
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1/models";

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId)
  );
}

async function embedSingle(text: string, model: string): Promise<number[]> {
  const res = await fetchWithTimeout(
    `${GEMINI_API_BASE}/${model}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      }),
    },
    FETCH_TIMEOUT_MS
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini embedding API error ${res.status}: ${errBody}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

async function embedBatch(texts: string[], model: string): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  // Process in concurrency-limited parallel batches
  for (let i = 0; i < texts.length; i += EMBED_CONCURRENCY) {
    const slice = texts.slice(i, i + EMBED_CONCURRENCY);
    const startIndex = i;
    const embeddings = await Promise.all(
      slice.map((text) => embedSingle(text, model))
    );
    embeddings.forEach((emb, j) => {
      results[startIndex + j] = emb;
    });
  }
  return results;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_CONCURRENCY) {
    batches.push(texts.slice(i, i + EMBED_CONCURRENCY));
  }

  // Find a working model with the first batch, then parallelize the rest
  let activeModel = "";
  let firstResult: number[][] = [];

  for (const model of EMBEDDING_MODELS) {
    try {
      firstResult = await embedBatch(batches[0], model);
      activeModel = model;
      break;
    } catch (err) {
      if (model === EMBEDDING_MODELS[EMBEDDING_MODELS.length - 1]) {
        throw err;
      }
    }
  }

  if (batches.length === 1) {
    return firstResult;
  }

  // Process remaining batches in parallel
  const remainingBatches = batches.slice(1);
  const results: number[][][] = await Promise.all(
    remainingBatches.map((batch) => embedBatch(batch, activeModel))
  );

  return [...firstResult, ...results.flat()];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Parse body once up front so it's available in the catch block
  let body: ChunkPayload | null = null;

  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "GEMINI_API_KEY is not configured. Please add it as an edge function secret in your Supabase project settings.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    body = await req.json();
    const { document_id, session_id, chunks } = body;

    if (!document_id || !session_id || !chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: document_id, session_id, chunks" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const texts = chunks.map((c) => c.content.slice(0, 2048));
    const embeddings = await embedTexts(texts);

    // Validate embedding dimensions
    if (embeddings[0] && embeddings[0].length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embeddings[0].length}`
      );
    }

    const rows = chunks.map((c, i) => ({
      document_id,
      session_id,
      chunk_index: c.chunk_index,
      content: c.content,
      page_number: c.page_number,
      embedding: embeddings[i],
    }));

    // Insert in batches to avoid payload size limits
    for (let i = 0; i < rows.length; i += DB_INSERT_BATCH_SIZE) {
      const batch = rows.slice(i, i + DB_INSERT_BATCH_SIZE);
      const { error: insertError } = await supabase.from("document_chunks").insert(batch);
      if (insertError) throw new Error(`Failed to store chunks: ${insertError.message}`);
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", document_id);

    if (updateError) throw new Error(`Failed to update document status: ${updateError.message}`);

    return new Response(
      JSON.stringify({ success: true, chunk_count: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Mark the document as errored — body was parsed before the try block
    if (body?.document_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase
          .from("documents")
          .update({ status: "error", error_message: message })
          .eq("id", body.document_id);
      } catch {
        // ignore — can't do anything more
      }
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
