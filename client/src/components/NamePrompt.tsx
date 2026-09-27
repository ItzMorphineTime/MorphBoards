import { useState } from 'react';

export function NamePrompt({ onSubmit }: { onSubmit(name: string): Promise<void> | void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="editor-message">
      <div className="name-prompt">
        <img className="name-prompt-mark" src="/brand/morph-monogram-dark.svg" alt="Morph" draggable={false} />
        <div className="name-prompt-title">Join this board</div>
        <div className="name-prompt-sub">Pick a display name — it labels your cursor and comments.</div>
        <input
          className="panel-input"
          autoFocus
          maxLength={40}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <button className="primary-btn" disabled={!name.trim() || busy} onClick={() => void submit()}>
          Continue
        </button>
      </div>
    </div>
  );
}
