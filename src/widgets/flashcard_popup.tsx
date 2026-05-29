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
  // One or more answers. One answer => an inline "question >> answer" card.
  // Two or more answers => a list card (question with child bullets).
  const [answers, setAnswers] = useState<string[]>(['']);
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

  const setAnswerAt = (i: number, value: string) => {
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  };

  const addAnswerLine = () => {
    setAnswers((prev) => [...prev, '']);
  };

  const removeAnswerLine = (i: number) => {
    setAnswers((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  };

  const addCard = async () => {
    const q = front.trim();
    const cleanAnswers = answers.map((a) => a.trim()).filter((a) => a.length > 0);

    if (!q) {
      setMessage({ kind: 'error', text: 'Please type a question first.' });
      frontRef.current?.focus();
      return;
    }
    if (cleanAnswers.length === 0) {
      setMessage({
        kind: 'error',
        text: 'Please type at least one answer — a flashcard needs both sides.',
      });
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
      if (parentRemId) {
        await rem.setParent(parentRemId);
      }

      if (cleanAnswers.length === 1) {
        // Simple inline card: question >> answer.
        await rem.setBackText([cleanAnswers[0]]);
      } else {
        // List card: the question, with each answer as a child bullet to recall.
        for (const ans of cleanAnswers) {
          const child = await plugin.rem.createRem();
          if (!child) continue;
          await child.setText([ans]);
          await child.setParent(rem._id);
          await child.setIsCardItem(true);
        }
      }

      await rem.setPracticeDirection(direction);

      const next = addedCount + 1;
      setAddedCount(next);
      const kind = cleanAnswers.length === 1 ? 'card' : 'list card';
      setMessage({ kind: 'ok', text: `Added ${kind} ✓  (${next} this session)` });

      // Clear for the next card and return focus to the question box.
      setFront('');
      setAnswers(['']);
      frontRef.current?.focus();
    } catch (e) {
      setMessage({ kind: 'error', text: 'Something went wrong while saving. Please try again.' });
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

  const isList = answers.filter((a) => a.trim().length > 0).length > 1;

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
        placeholder="e.g. What are the primary colors?"
        className={inputClass}
        onChange={(e) => setFront(e.target.value)}
      />

      <div className="flex items-baseline justify-between mb-1 mt-3">
        <label className="block text-xs font-medium rn-clr-content-secondary">
          {isList ? 'Answers (a list to recall)' : 'Answer (back)'}
        </label>
      </div>

      {answers.map((ans, i) => (
        <div key={i} className="flex items-start gap-2 mb-2">
          <textarea
            value={ans}
            rows={1}
            placeholder={answers.length > 1 ? `Answer ${i + 1}` : 'e.g. Red, yellow, blue'}
            className={inputClass}
            onChange={(e) => setAnswerAt(i, e.target.value)}
          />
          {answers.length > 1 && (
            <button
              type="button"
              title="Remove this answer"
              onClick={() => removeAnswerLine(i)}
              className="px-2 py-2 rounded-md cursor-pointer border border-solid rn-clr-border-opaque rn-clr-background-primary rn-clr-content-secondary"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addAnswerLine}
        className="text-xs cursor-pointer border-0 bg-transparent rn-clr-content-accent p-0 mt-1"
      >
        + Add another answer
      </button>
      <p className="text-xs rn-clr-content-tertiary mt-1 mb-0">
        One answer makes a simple card. Two or more make a list card (recall them all).
      </p>

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
            (message.kind === 'error' ? 'rn-clr-content-negative' : 'rn-clr-content-positive')
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
