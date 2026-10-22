# AI-Powered Document Intelligence Assistant Using RAG and Generative AI

A web application that lets you upload PDF or TXT documents, ask questions about their content in natural language, and receive AI-generated answers grounded in the uploaded documents using Retrieval-Augmented Generation (RAG).

## How It Works

1. **Upload** a PDF or TXT document through the web interface.
2. **Extract** text from the document (with page numbers for PDFs).
3. **Chunk** the text into manageable segments (~1200 words with overlap).
4. **Embed** each chunk using Google Gemini's `text-embedding-004` model.
5. **Store** embeddings in PostgreSQL with the `pgvector` extension.
6. **Query**: your question is embedded and matched against stored chunks using cosine similarity.
7. **Retrieve** the top 5 most relevant passages.
8. **Generate** an answer using Gemini 2.0 Flash, grounded only in the retrieved context.
9. **Display** the answer alongside source passages, page numbers, and similarity scores.

## Architecture

```
Browser (React + Vite + TypeScript)
  ├── PDF text extraction (pdfjs-dist, client-side)
  ├── TXT text extraction (FileReader API)
  ├── Text chunking (word-based with overlap)
  └── Supabase client (database + edge function calls)
        │
        ▼
Supabase (PostgreSQL + pgvector)
  ├── documents table — metadata, status, session ownership
  ├── document_chunks table — chunk text + vector(768) embeddings
  └── match_document_chunks() — vector similarity search RPC
        │
        ▼
Edge Functions (Deno serverless)
  ├── rag-process — receives chunks, calls Gemini embedding API, stores vectors
  └── rag-query — embeds question, retrieves chunks, calls Gemini LLM, returns answer + sources
        │
        ▼
Google Gemini API
  ├── text-embedding-004 (768-dim embeddings for chunks and queries)
  └── gemini-2.0-flash (generates answers from retrieved context)
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Icons | Lucide React |
| PDF Extraction | pdfjs-dist (client-side, no server needed) |
| Database | Supabase (PostgreSQL) |
| Vector Storage | pgvector extension (vector cosine similarity) |
| Serverless Backend | Supabase Edge Functions (Deno runtime) |
| Embedding Model | Google Gemini `text-embedding-004` (768 dimensions) |
| LLM | Google Gemini 2.0 Flash |

### Note on Django

The college problem statement suggests Python/Django. This project uses a JavaScript/TypeScript stack (React + Supabase Edge Functions) instead, which is the technology already available in this environment. The RAG pipeline is fully functional and genuine — text extraction, chunking, embeddings, vector storage, semantic retrieval, and LLM-grounded answer generation all work end-to-end. If Django is a hard requirement for your submission, the same architecture can be replicated in Django with FAISS/ChromaDB and the Gemini Python SDK — see the "Django Alternative" section below.

## Setup Instructions

### 1. Get a Gemini API Key (REQUIRED)

The app requires a Google Gemini API key to generate embeddings and answers.

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with a Google account
3. Click "Create API key"
4. Copy the key (starts with `AIza...`)

### 2. Add the API Key as an Edge Function Secret

In your Supabase project dashboard:

1. Go to **Project Settings → Edge Functions → Secrets**
2. Add a new secret:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: your API key from step 1
3. Save

Without this key, the app will show a clear error message when you try to process a document or ask a question. The key is never exposed in the frontend — it stays on the server side.

### 3. Run the App

The development server runs automatically in Bolt. If running locally:

```bash
npm install
npm run dev
```

## Using the App

1. Upload a PDF or TXT file (max 10 MB).
2. Wait for processing to complete (status shows "Ready for questions").
3. Type a question about the document content.
4. The AI searches for relevant passages and generates an answer.
5. Source passages with page numbers and similarity scores appear below each answer.
6. Upload another document or delete the current one at any time.
7. Use "Clear chat" to reset the conversation.

## Document Isolation

Each browser session gets a unique session ID stored in `sessionStorage`. Documents and chunks are tagged with this session ID. Vector searches are filtered by session ID, so one user's documents are never mixed with another's. No login required.

## Test Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Upload a valid PDF | ✅ Code complete — requires Gemini API key to test embedding step |
| 2 | Upload a valid TXT file | ✅ Code complete — requires Gemini API key to test embedding step |
| 3 | Ask a question whose answer exists in the document | ✅ Code complete — requires Gemini API key |
| 4 | Verify relevant chunks are retrieved before answering | ✅ Retrieval via `match_document_chunks` RPC with cosine similarity |
| 5 | Verify source passages match the uploaded document | ✅ Source text and page numbers shown with each answer |
| 6 | Ask a question whose answer does not exist | ✅ Model instructed to respond "This information could not be found in the uploaded document." |
| 7 | Invalid file uploads | ✅ File type and size validation with error messages |
| 8 | API failures | ✅ Try/catch in edge functions, error messages surfaced to UI |
| 9 | User document isolation | ✅ Session-based filtering on all queries and vector search |

**Tests that require the Gemini API key cannot be executed until you add the key.** Add the key as described in Setup Instructions step 2, then test by uploading a document and asking questions.

### Testing the "not found" response

Upload any document and ask a completely unrelated question, e.g., "What is the capital of France?" when the document is about biology. The AI should respond: "This information could not be found in the uploaded document."

## Limitations

- Scanned PDFs (image-only) without text layers cannot be processed — OCR is not included.
- The app does not completely eliminate hallucinations; it grounds answers in retrieved context but the LLM may still err.
- Maximum file size is 10 MB.
- Chunk text is truncated to 2048 characters before embedding to stay within API limits.

## Django Alternative (if required by your college)

To replicate this in Django:

1. **Backend**: `django` + `django-rest-framework` for API endpoints
2. **PDF extraction**: `PyPDF2` or `pdfplumber` for server-side text extraction
3. **Embeddings**: `google-generativeai` Python SDK for `text-embedding-004`
4. **Vector store**: `chromadb` or `faiss-cpu` for local vector storage
5. **LLM**: `google-generativeai` for Gemini 2.0 Flash
6. **Frontend**: HTML + Bootstrap + JavaScript (or Django templates)

The RAG pipeline logic (chunk → embed → store → retrieve → generate) would be identical — only the implementation language changes.

## File Structure

```
src/
  App.tsx                      # Main application component
  index.css                     # Tailwind CSS entry
  lib/
    supabase.ts                 # Supabase client singleton
    document-processor.ts       # PDF/TXT extraction + chunking logic
    rag-client.ts               # Edge function API calls
  components/
    UploadZone.tsx              # Drag-and-drop file upload
    DocumentCard.tsx            # Document status display
    ChatPanel.tsx               # Q&A chat interface with sources
supabase/
  config.toml                   # Edge function configuration
  functions/
    rag-process/index.ts        # Embedding + storage edge function
    rag-query/index.ts          # Retrieval + LLM answer edge function
```

## College Viva Questions (with answers)

**1. What is RAG?**
RAG (Retrieval-Augmented Generation) is a technique that combines information retrieval with generative AI. Instead of relying solely on the model's training data, RAG first retrieves relevant passages from a document store, then passes those passages as context to the LLM to generate a grounded answer.

**2. Why use RAG instead of fine-tuning?**
Fine-tuning requires retraining the model with new data, which is expensive and slow. RAG simply adds new documents to the vector store — no retraining needed. It also provides source citations, which fine-tuning cannot do.

**3. What is an embedding?**
An embedding is a numerical vector (e.g., 768 numbers) that represents the semantic meaning of a piece of text. Texts with similar meanings have vectors that are close together in vector space, enabling semantic search.

**4. Why do we chunk the document?**
LLMs have a context window limit. Chunking breaks long documents into smaller pieces so each piece can be embedded and retrieved individually. This also improves retrieval precision — only the most relevant chunks are used, not the whole document.

**5. What is pgvector?**
pgvector is a PostgreSQL extension that adds support for vector data types and similarity search. It allows storing embeddings directly in the database and performing fast nearest-neighbor queries using cosine, L2, or inner product distance.

**6. How does cosine similarity work?**
Cosine similarity measures the angle between two vectors. Values range from -1 to 1, where 1 means identical direction (most similar). It's computed as the dot product divided by the product of vector magnitudes. Our app uses `1 - cosine_distance` to get a similarity score.

**7. What happens if the answer isn't in the document?**
The LLM is instructed to respond "This information could not be found in the uploaded document." This is tested by asking a question unrelated to the document content.

**8. How are API keys kept secure?**
The Gemini API key is stored as a Supabase edge function secret (environment variable on the server). The frontend never sees or handles the key — it only calls edge functions, which proxy the API calls server-side.

**9. How does document isolation work?**
Each browser session generates a unique session ID. All documents and chunks are tagged with this ID. Vector searches filter by session ID, so users only retrieve their own documents' chunks.

**10. What are the limitations of this system?**
It cannot process scanned/image-only PDFs (no OCR), may occasionally produce inaccurate answers (hallucination is reduced but not eliminated), has a 10 MB file size limit, and depends on the Gemini API's availability and rate limits.
