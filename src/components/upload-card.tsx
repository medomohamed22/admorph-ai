'use client';
import { useRef } from 'react';

type UploadCardProps = {
  testId?: string;
  title: string;
  hint: string;
  preview?: string | null;
  state: 'idle' | 'busy' | 'done';
  busyText: string;
  chooseText: string;
  changeText: string;
  inputLabel: string;
  accept?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
};

/**
 * One clearly labelled upload slot: a big tap target with an icon, a
 * title, a hint and a preview — instead of a bare file input whose
 * purpose only an aria-label knew. The native input stays in the DOM
 * with its exact aria-label so automated uploads keep working; the
 * visible button forwards clicks to it.
 */
export default function UploadCard({ testId, title, hint, preview, state, busyText, chooseText, changeText, inputLabel, accept = 'image/png,image/jpeg,image/webp', disabled, onFile }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className={`upload-card ${state}`} data-testid={testId}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={inputLabel}
        disabled={disabled}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      {preview
        ? <img className="upload-preview" src={preview} alt="" />
        : <span className="upload-glyph" aria-hidden="true">＋</span>}
      <strong>{title}</strong>
      <small>{hint}</small>
      <button type="button" className="button secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {state === 'busy' ? busyText : state === 'done' ? changeText : chooseText}
      </button>
    </div>
  );
}
