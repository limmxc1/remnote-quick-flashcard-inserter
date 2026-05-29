import { useState, useRef, useEffect } from 'react';
import {
  usePlugin,
  renderWidget,
  useRunAsync,
  useTracker,
  WidgetLocation,
} from '@remnote/plugin-sdk';

type Direction = 'forward' | 'backward' | 'both';

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: 'forward', label: 'Question → Answer' },
  { value: 'backward', label: 'Answer → Question' },
  { value: 'both', label: 'Both ways' },
];

export const FlashcardPopup = () => {
  const plugin = usePlugin();

  // Where the new card should be placed, passed in when the popup was opened.
  const ctx = useRunAsync(
    () => plugin.widget.getWidgetContext<WidgetLocation.Popup>(),
    []
  );
  const parentRemId: string | undefined = ctx?.contextData?.parentRemId;
  const parentName: string = ctx?.contextData?.parentName ?? 'your notes';

  // The user's chosen default direction (from plugin settings).
  const defaultDirection = useTracker(
    (rp) => rp.settings.getSetting<Direction>('default-direction')
  );

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [direction, setDirection] = useState<Direction>('forward');
  const [addedCount, setAddedCount] = useState(0);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const frontRef = useRef<HTMLTextAreaElement>(null);

  // Apply the saved default direction once it loads.
  useEffect(() => {
    if (defaultDirection) setDirection(defaultDirection);
  }, [defaultDirection]);

  // Put the cursor in the question box as soon as the popup opens.
  useEffect(() => {
    frontRef.current?.focus();
  }, []);

  const addCard = async () => {
    const q = front.trim();
    const a = back.trim();

    if (!q) {
      setMessage({ kind: 'error', text: 'Please type a question first.' });
      frontRef.current?.focus();
      return;
    }
    if (!a) {
      setMessage({ kind: 'error', text: 'Please type an answer too — a flashcard needs both sides.' });
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const rem = await plugin.rem.createRem();
      if (!rem) {
        setMessage({ kind: 'error', text: "Couldn't create the card. Please try again." });
        return;
      }

      await rem.setText([q]);
      await rem.setBackText([a]);
      if (parentRemId) {
        await rem.setParent(parentRemId);
      }
      await rem.setPracticeDirection(direction);

      const next = addedCount + 1;
      setAddedCount(next);
      setMessage({ kind: 'ok', text: `Added ✓  (${next} this session)` });

      // Clear for the next card and return focus to the question box.
      setFront('');
      setBack('');
      frontRef.current?.focus();
    } catch (e) {
      setMessage({ kind: 'error', text: "Something went wrong while saving. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const close = async () => {
    await plugin.widget.closePopup();
  };

  // Cmd/Ctrl + Enter adds the card from anywhere in the form.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addCard();
    }
  };

  const inputClass =
    'w-full p-2 rounded-md resize-none rn-clr-background-primary rn-clr-content-primary ' +
    'border border-solid rn-clr-border-opaque focus:outline-none box-border';

  return (
    <div
      onKeyDown={onKeyDown}
      className="p-4 rn-clr-background-primary rn-clr-content-primary"
      style={{ width: '100%' }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-lg font-semibold m-0">Insert Flashcard</h1>
        {addedCount > 0 && (
          <span className="text-xs rn-clr-content-tertiary">{addedCount} added</span>
        )}
      </div>
      <p className="text-xs rn-clr-content-secondary mt-0 mb-3">
        Adding to: <span className="font-medium">{parentName}</span>
      </p>

      <label className="block text-xs font-medium rn-clr-content-secondary mb-1">
        Question (front)
      </label>
      <textarea
        ref={frontRef}
        value={front}
        rows={2}
        placeholder="e.g. What is the capital of France?"
        className={inputClass}
        onChange={(e) => setFront(e.target.value)}
      />

      <label className="block text-xs font-medium rn-clr-content-secondary mb-1 mt-3">
        Answer (back)
      </label>
      <textarea
        value={back}
        rows={2}
        placeholder="e.g. Paris"
        className={inputClass}
        onChange={(e) => setBack(e.target.value)}
      />

      <label className="block text-xs font-medium rn-clr-content-secondary mb-1 mt-3">
        How do you want to be quizzed?
      </label>
      <select
        value={direction}
        className={inputClass + ' cursor-pointer'}
        onChange={(e) => setDirection(e.target.value as Direction)}
      >
        {DIRECTION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {message && (
        <div
          className={
            'text-sm mt-3 ' +
            (message.kind === 'error'
              ? 'rn-clr-content-negative'
              : 'rn-clr-content-positive')
          }
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          disabled={saving}
          onClick={addCard}
          className="px-4 py-2 rounded-md font-medium cursor-pointer border-0 rn-clr-background-accent text-white disabled:opacity-60"
        >
          {saving ? 'Adding…' : 'Add Card'}
        </button>
        <button
          type="button"
          onClick={close}
          className="px-3 py-2 rounded-md cursor-pointer border border-solid rn-clr-border-opaque rn-clr-background-primary rn-clr-content-primary"
        >
          Done
        </button>
        <span className="text-xs rn-clr-content-tertiary ml-auto">⌘/Ctrl + Enter</span>
      </div>
    </div>
  );
};

renderWidget(FlashcardPopup);
