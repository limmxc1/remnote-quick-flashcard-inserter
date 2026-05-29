import { useState, useRef, useEffect, useMemo } from 'react';
import {
  usePlugin,
  renderWidget,
  useRunAsync,
  useTracker,
  WidgetLocation,
} from '@remnote/plugin-sdk';

type Direction = 'forward' | 'backward' | 'both';
type Mode = 'single' | 'bulk';

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: 'forward', label: 'Question → Answer' },
  { value: 'backward', label: 'Answer → Question' },
  { value: 'both', label: 'Both ways' },
];

// ---------------------------------------------------------------------------
// Bulk-paste parser
//
// Turns an indented text outline into a tree of nodes the plugin can create.
// The format (kept deliberately simple and human-readable):
//
//   # Heading            -> a plain section bullet (no flashcard)
//   front >> back        -> inline card, quizzed Question → Answer
//   front << back        -> inline card, quizzed Answer → Question
//   front <> back        -> inline card, quizzed both ways
//   concept ↓            -> a list card; the indented bullets under it are the
//     item one             items you recall together
//     item two
//   anything else        -> a plain bullet (good for background notes)
//
// Indentation (2 spaces, or a tab, per level) decides what is nested under what.
// ---------------------------------------------------------------------------

type NodeKind = 'heading' | 'text' | 'inline' | 'list';

interface OutlineNode {
  kind: NodeKind;
  text: string; // display text (the front, for inline/list)
  back?: string; // inline cards only
  dir?: Direction; // inline cards only
  indent: number;
  children: OutlineNode[];
  isListItem?: boolean; // true when this node is a recall item of a list card
}

// How many "space units" a line is indented (a tab counts as 2 spaces).
const indentOf = (line: string): number => {
  const lead = line.match(/^[ \t]*/)?.[0] ?? '';
  let n = 0;
  for (const ch of lead) n += ch === '\t' ? 2 : 1;
  return n;
};

// Work out what a single line means.
const classify = (line: string): Omit<OutlineNode, 'indent' | 'children'> => {
  const t = line.trim();
  if (t.startsWith('#')) {
    return { kind: 'heading', text: t.replace(/^#+\s*/, '') };
  }
  const delims: [string, Direction][] = [
    ['<>', 'both'],
    ['>>', 'forward'],
    ['<<', 'backward'],
  ];
  for (const [delim, dir] of delims) {
    const idx = t.indexOf(delim);
    if (idx !== -1) {
      return {
        kind: 'inline',
        text: t.slice(0, idx).trim(),
        back: t.slice(idx + delim.length).trim(),
        dir,
      };
    }
  }
  if (t.endsWith('↓')) {
    return { kind: 'list', text: t.slice(0, -1).trim() };
  }
  return { kind: 'text', text: t };
};

const walk = (nodes: OutlineNode[], fn: (n: OutlineNode) => void) => {
  for (const n of nodes) {
    fn(n);
    walk(n.children, fn);
  }
};

interface ParseResult {
  roots: OutlineNode[];
  warnings: string[];
}

const parseOutline = (text: string): ParseResult => {
  const roots: OutlineNode[] = [];
  const stack: { indent: number; node: OutlineNode }[] = [];

  for (const rawLine of (text || '').split('\n')) {
    if (!rawLine.trim()) continue; // blank lines keep the current nesting
    const indent = indentOf(rawLine);
    const info = classify(rawLine);
    if (!info.text) continue; // nothing meaningful on this line

    const node: OutlineNode = { ...info, indent, children: [] };

    // Find this line's parent: the nearest earlier line indented less than it.
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].node : undefined;
    if (parent) {
      if (parent.kind === 'list') node.isListItem = true;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push({ indent, node });
  }

  const warnings: string[] = [];
  walk(roots, (n) => {
    if (n.kind === 'list' && n.children.length === 0)
      warnings.push(`“${n.text}” ends with ↓ but has no items under it — it'll be added as a plain bullet.`);
    if (n.kind === 'inline' && !n.back)
      warnings.push(`“${n.text}” has nothing after the arrow — it'll be added as a plain bullet.`);
  });

  return { roots, warnings };
};

interface Stats {
  sections: number;
  listCards: number;
  inlineCards: number;
  notes: number;
  total: number; // total rems that will be created
}

const computeStats = (roots: OutlineNode[]): Stats => {
  const s: Stats = { sections: 0, listCards: 0, inlineCards: 0, notes: 0, total: 0 };
  walk(roots, (n) => {
    s.total += 1;
    if (n.isListItem) return; // recall items are counted in total only
    if (n.kind === 'heading') s.sections += 1;
    else if (n.kind === 'list' && n.children.length > 0) s.listCards += 1;
    else if (n.kind === 'inline' && n.back) s.inlineCards += 1;
    else s.notes += 1; // plain text, empty list, or arrow-less inline
  });
  return s;
};

export const FlashcardPopup = () => {
  const plugin = usePlugin();

  // Where the new card(s) should be placed, passed in when the popup was opened.
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

  const [mode, setMode] = useState<Mode>('single');

  // --- Single-card state ---------------------------------------------------
  const [front, setFront] = useState('');
  // One or more answers. One answer => an inline "question >> answer" card.
  // Two or more answers => a list card (question with child bullets).
  const [answers, setAnswers] = useState<string[]>(['']);
  const [direction, setDirection] = useState<Direction>('forward');
  const [addedCount, setAddedCount] = useState(0);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Bulk-paste state ----------------------------------------------------
  const [bulkText, setBulkText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkMessage, setBulkMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const frontRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(() => parseOutline(bulkText), [bulkText]);
  const stats = useMemo(() => computeStats(parsed.roots), [parsed]);

  // Apply the saved default direction once it loads.
  useEffect(() => {
    if (defaultDirection) setDirection(defaultDirection);
  }, [defaultDirection]);

  // Put the cursor in the question box as soon as the single-card form opens.
  useEffect(() => {
    if (mode === 'single') frontRef.current?.focus();
  }, [mode]);

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

  // Recursively create the rems for a list of outline nodes under `parentId`.
  const createNodes = async (
    nodes: OutlineNode[],
    parentId: string | undefined,
    onProgress: () => void
  ) => {
    for (const node of nodes) {
      const rem = await plugin.rem.createRem();
      if (!rem) continue;
      await rem.setText([node.text]);
      if (parentId) await rem.setParent(parentId);

      if (node.kind === 'inline' && node.back) {
        await rem.setBackText([node.back]);
        await rem.setPracticeDirection(node.dir ?? 'forward');
      } else if (node.kind === 'list' && node.children.length > 0) {
        await rem.setPracticeDirection('forward');
      }
      onProgress();

      if (node.kind === 'list' && node.children.length > 0) {
        // The indented bullets become the recall items of this list card.
        for (const child of node.children) {
          const c = await plugin.rem.createRem();
          if (!c) continue;
          await c.setText([child.text]);
          await c.setParent(rem._id);
          await c.setIsCardItem(true);
          onProgress();
          if (child.children.length) await createNodes(child.children, c._id, onProgress);
        }
      } else if (node.children.length) {
        await createNodes(node.children, rem._id, onProgress);
      }
    }
  };

  const insertBulk = async () => {
    if (bulkBusy) return;
    if (stats.total === 0) {
      setBulkMessage({ kind: 'error', text: 'Nothing to add yet — paste an outline above.' });
      return;
    }
    setBulkBusy(true);
    setBulkProgress(0);
    setBulkMessage(null);
    try {
      let done = 0;
      await createNodes(parsed.roots, parentRemId, () => {
        done += 1;
        setBulkProgress(done);
      });
      const bits = [
        stats.sections && `${stats.sections} section${stats.sections > 1 ? 's' : ''}`,
        stats.listCards && `${stats.listCards} list card${stats.listCards > 1 ? 's' : ''}`,
        stats.inlineCards && `${stats.inlineCards} card${stats.inlineCards > 1 ? 's' : ''}`,
        stats.notes && `${stats.notes} note${stats.notes > 1 ? 's' : ''}`,
      ].filter(Boolean).join(', ');
      setBulkMessage({ kind: 'ok', text: `Added ${bits || `${stats.total} items`} ✓` });
      setBulkText('');
    } catch (e) {
      setBulkMessage({
        kind: 'error',
        text: 'Something went wrong partway through. Some bullets may have been added — please check your note.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const close = async () => {
    await plugin.widget.closePopup();
  };

  // Cmd/Ctrl + Enter adds from anywhere in the form (single = add card, bulk = insert all).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'single') addCard();
      else insertBulk();
    }
  };

  const inputClass =
    'w-full p-2 rounded-md resize-none rn-clr-background-primary rn-clr-content-primary ' +
    'border border-solid rn-clr-border-opaque focus:outline-none box-border';

  const isList = answers.filter((a) => a.trim().length > 0).length > 1;

  const tabClass = (active: boolean) =>
    'px-3 py-1 rounded-md cursor-pointer border border-solid text-sm ' +
    (active
      ? 'rn-clr-background-accent text-white border-transparent'
      : 'rn-clr-background-primary rn-clr-content-secondary rn-clr-border-opaque');

  return (
    <div
      onKeyDown={onKeyDown}
      className="p-4 box-border rn-clr-background-primary rn-clr-content-primary"
      style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}
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

      {/* Mode tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button type="button" className={tabClass(mode === 'single')} onClick={() => setMode('single')}>
          Single card
        </button>
        <button type="button" className={tabClass(mode === 'bulk')} onClick={() => setMode('bulk')}>
          Bulk paste
        </button>
      </div>

      {mode === 'single' ? (
        <>
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
        </>
      ) : (
        <>
          <label className="block text-xs font-medium rn-clr-content-secondary mb-1">
            Paste an outline — many cards at once
          </label>
          <textarea
            value={bulkText}
            rows={12}
            placeholder={
              '# Diagnosis\n' +
              'Pulse in AF >> Irregularly irregular\n' +
              'Signs on ECG ↓\n' +
              '  Irregular R-R interval\n' +
              '  No clear P-waves\n' +
              '  Narrow QRS (<0.12 s)'
            }
            className={inputClass + ' font-mono text-sm'}
            style={{ whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
            onChange={(e) => setBulkText(e.target.value)}
          />

          <details className="mt-2">
            <summary className="text-xs rn-clr-content-accent cursor-pointer">How to write the outline</summary>
            <div className="text-xs rn-clr-content-tertiary mt-1 leading-relaxed">
              <div><span className="font-medium"># Heading</span> — a section bullet (no card)</div>
              <div><span className="font-medium">front &gt;&gt; back</span> — a card (Q→A). Use &lt;&lt; for A→Q, &lt;&gt; for both ways</div>
              <div><span className="font-medium">concept ↓</span> with indented bullets under it — a list card you recall together</div>
              <div>Any other line — a plain bullet (good for background)</div>
              <div>Indent with 2 spaces (or a tab) to nest items.</div>
            </div>
          </details>

          {/* Live preview of what will be created */}
          {stats.total > 0 && (
            <p className="text-xs rn-clr-content-secondary mt-3 mb-0">
              Will add:{' '}
              <span className="font-medium">
                {[
                  stats.sections && `${stats.sections} section${stats.sections > 1 ? 's' : ''}`,
                  stats.listCards && `${stats.listCards} list card${stats.listCards > 1 ? 's' : ''}`,
                  stats.inlineCards && `${stats.inlineCards} card${stats.inlineCards > 1 ? 's' : ''}`,
                  stats.notes && `${stats.notes} note${stats.notes > 1 ? 's' : ''}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>{' '}
              <span className="rn-clr-content-tertiary">({stats.total} bullets total)</span>
            </p>
          )}

          {parsed.warnings.length > 0 && (
            <ul className="text-xs mt-2 mb-0 pl-4" style={{ color: '#b7791f' }}>
              {parsed.warnings.slice(0, 5).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {parsed.warnings.length > 5 && <li>…and {parsed.warnings.length - 5} more</li>}
            </ul>
          )}

          {bulkBusy && (
            <p className="text-xs rn-clr-content-secondary mt-2 mb-0">
              Adding… {bulkProgress} / {stats.total}
            </p>
          )}

          {bulkMessage && (
            <div
              className={
                'text-sm mt-3 ' +
                (bulkMessage.kind === 'error' ? 'rn-clr-content-negative' : 'rn-clr-content-positive')
              }
            >
              {bulkMessage.text}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              disabled={bulkBusy || stats.total === 0}
              onClick={insertBulk}
              className="px-4 py-2 rounded-md font-medium cursor-pointer border-0 rn-clr-background-accent text-white disabled:opacity-60"
            >
              {bulkBusy ? 'Adding…' : stats.total > 0 ? `Insert all (${stats.total})` : 'Insert all'}
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
        </>
      )}
    </div>
  );
};

renderWidget(FlashcardPopup);
