import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, FileText, BookOpen, Trash2, User, Bot } from 'lucide-react';
import { queryDocument, type QuerySource } from '@/lib/rag-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: QuerySource[];
  retrievedCount?: number;
  error?: boolean;
}

interface Props {
  sessionId: string;
  isDocumentReady: boolean;
}

export function ChatPanel({ sessionId, isDocumentReady }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  async function handleSend() {
    const question = input.trim();
    if (!question || isLoading || !isDocumentReady) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await queryDocument(sessionId, question);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          retrievedCount: result.retrieved_count,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: err instanceof Error ? err.message : 'An unexpected error occurred.',
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleClearChat() {
    setMessages([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-slate-800">Ask Questions</h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear chat
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-full bg-slate-100 p-4">
              <Bot className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Ask a question about your document</p>
            <p className="mt-1 text-xs text-slate-400">
              The AI will search your document for relevant passages and answer based on them.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-full bg-blue-100 p-2">
              <Bot className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              <span className="text-sm text-slate-500">Searching document and generating answer…</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isDocumentReady || isLoading}
            placeholder={
              isDocumentReady
                ? 'Type your question…'
                : 'Upload and process a document first…'
            }
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !isDocumentReady}
            className="flex-shrink-0 rounded-xl bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex-shrink-0 rounded-full p-2 ${
          isUser ? 'bg-slate-200' : message.error ? 'bg-red-100' : 'bg-blue-100'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-slate-600" />
        ) : (
          <Bot className={`h-4 w-4 ${message.error ? 'text-red-600' : 'text-blue-600'}`} />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'rounded-tr-sm bg-blue-600 text-white'
            : message.error
              ? 'rounded-tl-sm bg-red-50 border border-red-200 text-red-700'
              : 'rounded-tl-sm bg-slate-100 text-slate-800'
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <FileText className="h-3.5 w-3.5" />
              Source passages ({message.sources.length})
            </div>
            {message.sources.map((source, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-medium text-slate-600">{source.filename}</span>
                  <div className="flex items-center gap-2">
                    {source.page_number && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                        Page {source.page_number}
                      </span>
                    )}
                    <span className="text-slate-400">
                      {Math.round(source.similarity * 100)}% match
                    </span>
                  </div>
                </div>
                <p className="leading-relaxed text-slate-600 line-clamp-4">
                  {source.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
