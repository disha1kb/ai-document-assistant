import { useRef, useState } from 'react';
import { UploadCloud, FileText } from 'lucide-react';

interface Props {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ['.pdf', '.txt', 'application/pdf', 'text/plain'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function UploadZone({ onFileSelected, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateFile(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isPdf = file.type === 'application/pdf' || ext === '.pdf';
    const isTxt = file.type === 'text/plain' || ext === '.txt';

    if (!isPdf && !isTxt) {
      return 'Only PDF and TXT files are supported.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File is too large. Maximum size is 10 MB.';
    }
    if (file.size === 0) {
      return 'File appears to be empty.';
    }
    return null;
  }

  function handleFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onFileSelected(file);
  }

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
            : isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <div className="mb-3 rounded-full bg-blue-100 p-3">
          <UploadCloud className="h-7 w-7 text-blue-600" />
        </div>
        <p className="text-sm font-medium text-slate-700">
          {isDragging ? 'Drop your file here' : 'Click to upload or drag & drop'}
        </p>
        <p className="mt-1 text-xs text-slate-400">PDF or TXT · Max 10 MB</p>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
