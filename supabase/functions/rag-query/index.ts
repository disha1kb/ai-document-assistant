import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const EMBEDDING_MODELS = ["text-embedding-004", "gemini-embedding-001", "embedding-001"];
const GEMINI_LLM_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-flash-latest"];
const GEMINI_EMBEDDING_API_BASE = "https://generativelanguage.googleapis.com/v1/models";
const GEMINI_LLM_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBEDDING_DIM = 3072;
const TOP_K = 5;
const FETCH_TIMEOUT_MS = 30000;

interface QueryPayload {
  session_id: string;
  question: string;
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId)
  );
}

async function embedText(text: string): Promise<number[]> {
  let lastError: Error | null = null;
  for (const model of EMBEDDING_MODELS) {
    try {
      const res = await fetchWithTimeout(
        `${GEMINI_EMBEDDING_API_BASE}/${model}:embedContent?key=${GEMINI_API_KEY}`,
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
        lastError = new Error(`Gemini embedding API error ${res.status}: ${errBody}`);
        continue;
      }
      const data = await res.json();
      return data.embedding.values;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("All embedding models failed");
}

async function generateAnswer(
  question: string,
  contextChunks: { content: string; page_number: number | null; filename: string }[]
): Promise<string> {
  const contextText = contextChunks
    .map((c, i) => {
      const pageRef = c.page_number ? ` [Page ${c.page_number}]` : "";
      return `Source ${i + 1}${pageRef}:\n${c.content}`;
    })
    .join("\n\n---\n\n");

  const prompt = `You are a document intelligence assistant. Answer the user's question based ONLY on the provided context from the uploaded document.

STRICT RULES:
1. Answer using only the information in the provided context passages.
2. If the context does not contain enough relevant information to answer the question, respond exactly: "This information could not be found in the uploaded document."
3. Do not make up information, invent facts, or use outside knowledge.
4. Keep your answer concise and directly address the question.
5. If multiple sources support the answer, synthesize them.

CONTEXT PASSAGES:
${contextText}

QUESTION: ${question}

ANSWER:`;

  let lastError: Error | null = null;
  let res: Response | null = null;

  for (const llmModel of GEMINI_LLM_MODELS) {
    try {
      res = await fetchWithTimeout(
        `${GEMINI_LLM_API_BASE}/${llmModel}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
            },
          }),
        },
        FETCH_TIMEOUT_MS
      );

      if (!res.ok) {
        const errBody = await res.text();
        lastError = new Error(`Gemini LLM API error ${res.status}: ${errBody}`);
        continue;
      }

      const data = await res.json();
      const answer =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        "This information could not be found in the uploaded document.";

      return answer.trim();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("All LLM models failed");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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

    const body: QueryPayload = await req.json();
    const { session_id, question } = body;

    if (!session_id || !question) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: session_id, question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Embed the question
    const questionEmbedding = await embedText(question);

    if (questionEmbedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${questionEmbedding.length}`
      );
    }

    // Step 2: Retrieve top-k chunks via cosine similarity
    const { data: chunks, error: chunksError } = await supabase.rpc("match_document_chunks", {
      query_embedding: questionEmbedding,
      match_count: TOP_K,
      filter_session_id: session_id,
    });

    if (chunksError) throw new Error(`Vector search failed: ${chunksError.message}`);

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({
          answer: "This information could not be found in the uploaded document.",
          sources: [],
          retrieved_count: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Fetch filenames for the matched chunks
    const documentIds = [...new Set(chunks.map((c: any) => c.document_id))];
    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, filename")
      .in("id", documentIds);

    if (docsError) throw new Error(`Failed to fetch document names: ${docsError.message}`);

    const docMap = new Map(docs?.map((d: any) => [d.id, d.filename]) ?? []);

    const sources = chunks.map((c: any) => ({
      content: c.content,
      page_number: c.page_number,
      filename: docMap.get(c.document_id) ?? "Unknown",
      similarity: c.similarity,
    }));

    // Step 4: Generate answer with context
    const answer = await generateAnswer(question, sources);

    return new Response(
      JSON.stringify({
        answer,
        sources,
        retrieved_count: chunks.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
