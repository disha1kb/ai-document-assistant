import { FileText, Trash2, CheckCircle2, AlertCircle, Loader2, FileUp } from 'lucide-react';

export interface DocumentInfo {
  id: string;
  filename: string;
  file_type: string;
  page_count: number | null;
  chunk_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface Props {
  document: DocumentInfo;
  onDelete: () => void;
  onReplace: () => void;
}

export function DocumentCard({ document, onDelete, onReplace }: Props) {
  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    processing: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      label: 'Processing document…',
    },
    ready: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      label: 'Ready for questions',
    },
    error: {
      icon: <AlertCircle className="h-4 w-4" />,
      color: 'text-red-600 bg-red-50 border-red-200',
      label: 'Processing failed',
    },
  };

  const config = statusConfig[document.status] ?? statusConfig.processing;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 rounded-lg bg-blue-50 p-2">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-800">{document.filename}</p>
            <p className="text-sm text-slate-500">
              {document.file_type.toUpperCase()}
              {document.page_count ? ` · ${document.page_count} pages` : ''}
              {document.chunk_count > 0 ? ` · ${document.chunk_count} chunks` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onReplace}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Upload another document"
          >
            <FileUp className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            title="Remove document"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${config.color}`}>
        {config.icon}
        <span>{config.label}</span>
        {document.status === 'error' && document.error_message && (
          <span className="ml-auto truncate text-xs opacity-80" title={document.error_message}>
            {document.error_message}
          </span>
        )}
      </div>
    </div>
  );
}
