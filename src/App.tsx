import { useState, useCallback, useEffect } from 'react';
import { BrainCircuit, Sparkles, Github, AlertTriangle } from 'lucide-react';
import { UploadZone } from '@/components/UploadZone';
import { DocumentCard, type DocumentInfo } from '@/components/DocumentCard';
import { ChatPanel } from '@/components/ChatPanel';
import {
  extractTextFromPdf,
  extractTextFromTxt,
  chunkPages,
  generateSessionId,
} from '@/lib/document-processor';
import {
  createDocumentRecord,
  processChunks,
  deleteDocument,
  getDocuments,
} from '@/lib/rag-client';
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'rag_session_id';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type ProcessingState =
  | { stage: 'idle' }
  | { stage: 'extracting'; message: string }
  | { stage: 'chunking'; message: string }
  | { stage: 'embedding'; message: string }
  | { stage: 'done'; message: string }
  | { stage: 'error'; message: string };

export default function App() {
  const [sessionId] = useState(getSessionId);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [processing, setProcessing] = useState<ProcessingState>({ stage: 'idle' });
  const [globalError, setGlobalError] = useState<string | null>(null);

  const activeDocument = documents.find((d) => d.status === 'ready');
  const isDocumentReady = !!activeDocument;

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments(sessionId);
      setDocuments(docs as DocumentInfo[]);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load documents.');
    }
  }, [sessionId]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  // Poll for status updates while a document is processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(refreshDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents, refreshDocuments]);

  async function handleFileSelected(file: File) {
    setGlobalError(null);
    setProcessing({ stage: 'extracting', message: 'Extracting text from file…' });

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const fileType = isPdf ? 'pdf' : 'txt';

      // Extract text
      let pages;
      if (isPdf) {
        pages = await extractTextFromPdf(file, (page, total) => {
          setProcessing({
            stage: 'extracting',
            message: `Extracting page ${page} of ${total}…`,
          });
        });
      } else {
        pages = await extractTextFromTxt(file);
      }

      if (pages.every((p) => !p.text)) {
        throw new Error(
          'No text could be extracted from this file. It may be a scanned PDF without text layers.'
        );
      }

      // Chunk text
      setProcessing({ stage: 'chunking', message: 'Splitting text into chunks…' });
      const chunks = chunkPages(pages);

      if (chunks.length === 0) {
        throw new Error('No text chunks could be created from this document.');
      }

      // Create document record
      const pageCount = isPdf ? pages.length : null;
      const docId = await createDocumentRecord(sessionId, file.name, fileType, pageCount);

      // Refresh to show the new document with "processing" status
      await refreshDocuments();

      // Send chunks to edge function for embedding + storage
      setProcessing({
        stage: 'embedding',
        message: `Generating embeddings for ${chunks.length} chunks…`,
      });
      await processChunks(docId, sessionId, chunks);

      setProcessing({ stage: 'done', message: 'Document processed successfully!' });
      await refreshDocuments();

      // Reset processing state after a brief delay
      setTimeout(() => setProcessing({ stage: 'idle' }), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setProcessing({ stage: 'error', message });
      setGlobalError(message);
      await refreshDocuments();
    }
  }

  async function handleDeleteDocument(docId: string) {
    try {
      await deleteDocument(docId);
      await refreshDocuments();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to delete document.');
    }
  }

  function handleReplaceDocument() {
    // Scroll to upload zone
    document.getElementById('upload-zone-area')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 p-2.5 shadow-sm">
                <BrainCircuit className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">
                  AI Document Intelligence Assistant
                </h1>
                <p className="text-xs text-slate-500">
                  RAG-powered document Q&A using semantic retrieval and generative AI
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 sm:flex">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by Gemini + pgvector
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {globalError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="ml-auto text-amber-600 hover:text-amber-800 text-xs font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* Left column: Upload + Documents */}
          <div className="space-y-4">
            <div id="upload-zone-area" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
                <span className="text-sm">Upload Document</span>
              </h2>
              <UploadZone onFileSelected={handleFileSelected} disabled={processing.stage !== 'idle' && processing.stage !== 'error'} />

              {processing.stage !== 'idle' && processing.stage !== 'done' && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${
                    processing.stage === 'error'
                      ? 'border-red-200 bg-red-50 text-red-600'
                      : 'border-blue-200 bg-blue-50 text-blue-600'
                  }`}
                >
                  {processing.message}
                </div>
              )}

              {processing.stage === 'done' && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-600">
                  {processing.message}
                </div>
              )}
            </div>

            {documents.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-700">Your Documents</h2>
                {documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onDelete={() => handleDeleteDocument(doc.id)}
                    onReplace={handleReplaceDocument}
                  />
                ))}
              </div>
            )}

            {/* Info panel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">How it works</h3>
              <ol className="space-y-1.5 text-xs text-slate-500">
                <li>1. Upload a PDF or TXT document</li>
                <li>2. Text is extracted and split into chunks</li>
                <li>3. Chunks are embedded and stored as vectors</li>
                <li>4. Your question is matched to relevant chunks</li>
                <li>5. The AI generates an answer from those passages</li>
                <li>6. Source references are shown with each answer</li>
              </ol>
            </div>
          </div>

          {/* Right column: Chat */}
          <div className="h-[calc(100vh-200px)] min-h-[500px] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <ChatPanel sessionId={sessionId} isDocumentReady={isDocumentReady} />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-400">
          AI-Powered Document Intelligence Assistant · RAG with Gemini & pgvector · College Project
        </div>
      </footer>
    </div>
  );
}
