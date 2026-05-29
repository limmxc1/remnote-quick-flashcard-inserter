import { useState, useRef, useEffect, useMemo } from 'react';
import {
  usePlugin,
  renderWidget,
  useRunAsync,
  useTracker,
  WidgetLocation,
  SetRemType,
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
//   | Title | colA | colB -> a comparison table (see the table section below)
//   | DKA   | x    | y
//   anything else        -> a plain bullet (good for background notes)
//
// Indentation (2 spaces, or a tab, per level) decides what is nested under what.
//
// Comparison tables: two or more lines in a row that each start with "|" are
// read as one table. The top line is the headers (its first box is the table's
// title, the rest are the things you're comparing on); every line below is one
// thing being compared. Each filled box becomes its own little flashcard. Built
// in RemNote as a real table (a concept with columns/slots and tagged rows).
// ---------------------------------------------------------------------------

type NodeKind = 'heading' | 'text' | 'inline' | 'list' | 'table';

interface TableRow {
  name: string; // the thing being compared (e.g. "DKA") — becomes a tagged row
  values: string[]; // one value per column, aligned to `columns`
}

interface TableData {
  title: string; // the table's name — becomes the concept the rows are tagged with
  columns: string[]; // the things compared on — each becomes a column/slot
  rows: TableRow[]; // one per thing being compared
}

interface OutlineNode {
  kind: NodeKind;
  text: string; // display text (the front, for inline/list; the title for a table)
  back?: string; // inline cards only
  dir?: Direction; // inline cards only
  indent: number;
  level?: number; // heading level (number of leading #), headings only
  children: OutlineNode[];
  isListItem?: boolean; // true when this node is a recall item of a list card
  table?: TableData; // table nodes only
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
    const level = (t.match(/^#+/)?.[0].length) ?? 1;
    return { kind: 'heading', text: t.replace(/^#+\s*/, ''), level };
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

// --- Comparison-table helpers ----------------------------------------------
// A "table line" is any line that (ignoring indentation) starts with a pipe.
const isPipeLine = (line: string): boolean => line.trim().startsWith('|');

// Split one "| a | b | c" line into trimmed cells, tolerating missing/extra
// outer pipes and any spacing. "|DKA|type 1|" and "DKA | type 1" both work.
const splitCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

// A markdown separator row like "| --- | :--: |" carries no data — skip it.
const isSeparatorRow = (cells: string[]): boolean =>
  cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));

// Turn a run of consecutive pipe-lines into one table node.
const parseTableBlock = (
  blockLines: string[],
  headingText: string | undefined
): { node: OutlineNode; warnings: string[] } => {
  const warnings: string[] = [];
  const indent = Math.min(...blockLines.map(indentOf));

  // Drop markdown separator rows (e.g. the "|---|---|" under a header).
  const rows = blockLines.map(splitCells).filter((cells) => !isSeparatorRow(cells));

  const header = rows[0] ?? [];
  const title = header[0] || headingText?.trim() || 'Comparison';

  // Columns = the header cells after the title. Trim trailing empties (usually
  // a stray closing pipe); name any remaining blank header so cards stay clear.
  let columns = header.slice(1);
  while (columns.length && columns[columns.length - 1] === '') columns.pop();
  const seen = new Map<string, number>();
  columns = columns.map((c, k) => {
    let name = c || `Column ${k + 1}`;
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count > 0) {
      warnings.push(`The column “${name}” appears more than once — renamed the repeat to “${name} (${count + 1})”.`);
      name = `${name} (${count + 1})`;
    }
    return name;
  });

  const dataRows: TableRow[] = [];
  const usedNames = new Set<string>();
  for (const cells of rows.slice(1)) {
    const name = cells[0] ?? '';
    if (!name) {
      warnings.push('A table row had no name in its first box — skipped it.');
      continue;
    }
    const values = cells.slice(1);
    if (values.length > columns.length) {
      warnings.push(`The “${name}” row has more values than there are columns — used the first ${columns.length} and ignored the rest.`);
    }
    const lowered = name.toLowerCase();
    if (usedNames.has(lowered)) {
      warnings.push(`“${name}” appears more than once — both will be added.`);
    }
    usedNames.add(lowered);
    dataRows.push({ name, values: values.slice(0, columns.length) });
  }

  if (columns.length === 0) {
    warnings.push(`The table “${title}” has no columns to compare on — add headers after the title on the top line.`);
  }
  if (dataRows.length === 0) {
    warnings.push(`The table “${title}” has no rows to compare yet — add a line below for each thing you're comparing.`);
  }

  const node: OutlineNode = {
    kind: 'table',
    text: title,
    indent,
    children: [],
    table: { title, columns, rows: dataRows },
  };
  return { node, warnings };
};

interface ParseResult {
  roots: OutlineNode[];
  warnings: string[];
}

const parseOutline = (text: string): ParseResult => {
  const roots: OutlineNode[] = [];
  // Two kinds of nesting work together:
  //  - "# / ##" headings build the section tree by their level, and
  //  - within a section, indentation nests bullets (e.g. a list card's items).
  const headingStack: { level: number; node: OutlineNode }[] = [];
  let contentStack: { indent: number; node: OutlineNode }[] = [];
  let currentHeading: OutlineNode | undefined;
  const warnings: string[] = [];

  // Attach a body node (anything that isn't a heading) under the right parent,
  // chosen by indentation; at the section's base level it hangs off the heading.
  const attachByIndent = (node: OutlineNode, indent: number) => {
    while (contentStack.length && contentStack[contentStack.length - 1].indent >= indent)
      contentStack.pop();
    const parent = contentStack.length
      ? contentStack[contentStack.length - 1].node
      : currentHeading;
    if (parent) {
      if (parent.kind === 'list') node.isListItem = true;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    contentStack.push({ indent, node });
  };

  const lines = (text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue; // blank lines keep the current nesting

    // A comparison table = two or more pipe-lines in a row. A lone pipe-line
    // isn't treated as a table (so a stray "|" in prose stays a normal note).
    if (isPipeLine(rawLine)) {
      let j = i;
      while (j < lines.length && lines[j].trim() && isPipeLine(lines[j])) j++;
      if (j - i >= 2) {
        const { node, warnings: tw } = parseTableBlock(lines.slice(i, j), currentHeading?.text);
        warnings.push(...tw);
        attachByIndent(node, node.indent);
        contentStack.pop(); // a table is a leaf — don't nest later lines inside it
        i = j - 1;
        continue;
      }
    }

    const info = classify(rawLine);
    if (!info.text) continue; // nothing meaningful on this line

    if (info.kind === 'heading') {
      const level = info.level ?? 1;
      const node: OutlineNode = { ...info, indent: 0, children: [] };
      // A heading nests under the nearest earlier heading of a higher level.
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level)
        headingStack.pop();
      const parent = headingStack.length ? headingStack[headingStack.length - 1].node : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
      headingStack.push({ level, node });
      currentHeading = node;
      contentStack = []; // start a fresh body under this heading
      continue;
    }

    const indent = indentOf(rawLine);
    const node: OutlineNode = { ...info, indent, children: [] };
    attachByIndent(node, indent);
  }

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
  tables: number;
  tableCards: number; // flashcards generated from filled table boxes
  notes: number;
  total: number; // total rems that will be created
}

// How many filled boxes a table has (each becomes one flashcard).
const tableCellCount = (t: TableData): number =>
  t.rows.reduce((sum, r) => sum + r.values.filter((v) => v.trim()).length, 0);

const computeStats = (roots: OutlineNode[]): Stats => {
  const s: Stats = { sections: 0, listCards: 0, inlineCards: 0, tables: 0, tableCards: 0, notes: 0, total: 0 };
  walk(roots, (n) => {
    s.total += 1;
    if (n.isListItem) return; // recall items are counted in total only
    if (n.kind === 'table' && n.table) {
      s.tables += 1;
      const cells = tableCellCount(n.table);
      s.tableCards += cells;
      // The +1 above counted the concept; add its columns, rows and cell-cards.
      s.total += n.table.columns.length + n.table.rows.length + cells;
    } else if (n.kind === 'heading') s.sections += 1;
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

  // Build a real RemNote comparison table: the title is a concept, each column
  // is a slot under it, and each row is tagged with the concept. Every filled
  // box becomes its own forward flashcard (front = the column, back = the value).
  const createTable = async (
    t: TableData,
    parentId: string | undefined,
    onProgress: () => void
  ) => {
    const concept = await plugin.rem.createRem();
    if (!concept) return;
    await concept.setText([t.title]);
    if (parentId) await concept.setParent(parentId);
    await concept.setType(SetRemType.CONCEPT);
    onProgress();

    // Columns become slots (the shared properties the rows are compared on).
    const slotIds: string[] = [];
    for (const col of t.columns) {
      const slot = await plugin.rem.createRem();
      if (!slot) {
        slotIds.push('');
        continue;
      }
      await slot.setText([col]);
      await slot.setParent(concept._id);
      await slot.setType(SetRemType.DESCRIPTOR);
      await slot.setIsSlot(true);
      slotIds.push(slot._id);
      onProgress();
    }

    // Each row is one thing being compared, tagged with the concept.
    for (const row of t.rows) {
      const inst = await plugin.rem.createRem();
      if (!inst) continue;
      await inst.setText([row.name]);
      if (parentId) await inst.setParent(parentId);
      await inst.addTag(concept._id);
      onProgress();

      for (let k = 0; k < t.columns.length; k++) {
        const val = (row.values[k] ?? '').trim();
        if (!val) continue; // a blank box makes no card
        const cell = await plugin.rem.createRem();
        if (!cell) continue;
        // Front references the column slot; this is what makes it a table cell.
        const front = slotIds[k]
          ? await plugin.richText.rem(slotIds[k]).value()
          : [t.columns[k]];
        await cell.setText(front);
        await cell.setBackText([val]);
        await cell.setParent(inst._id);
        await cell.setPracticeDirection('forward');
        onProgress();
      }
    }
  };

  // Recursively create the rems for a list of outline nodes under `parentId`.
  const createNodes = async (
    nodes: OutlineNode[],
    parentId: string | undefined,
    onProgress: () => void
  ) => {
    for (const node of nodes) {
      if (node.kind === 'table' && node.table) {
        await createTable(node.table, parentId, onProgress);
        continue;
      }
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
        stats.tables &&
          `${stats.tables} comparison table${stats.tables > 1 ? 's' : ''}` +
            (stats.tableCards ? ` (${stats.tableCards} card${stats.tableCards > 1 ? 's' : ''})` : ''),
        stats.inlineCards && `${stats.inlineCards} card${stats.inlineCards > 1 ? 's' : ''}`,
        stats.notes && `${stats.notes} note${stats.notes > 1 ? 's' : ''}`,
      ].filter(Boolean).join(', ');
      const tip = stats.tables
        ? ' — open the comparison in RemNote and switch it to “Table” view to see the grid'
        : '';
      setBulkMessage({ kind: 'ok', text: `Added ${bits || `${stats.total} items`} ✓${tip}` });
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
              '  Narrow QRS (<0.12 s)\n' +
              '\n' +
              '| Emergency | ketones | acidosis\n' +
              '| DKA       | high    | present\n' +
              '| HHS       | minimal | absent'
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
              <div className="mt-2 font-medium rn-clr-content-secondary">Comparing two things? Start each line with “|”.</div>
              <div>• Top line — the title, then the details you're comparing on.</div>
              <div>• Each line below — one thing you're comparing.</div>
              <div>Every box turns into its own card. Spacing doesn't matter.</div>
              <pre className="mt-1 mb-0 whitespace-pre rn-clr-content-tertiary" style={{ margin: 0 }}>{
                '| Emergency | ketones | acidosis\n' +
                '| DKA       | high    | present\n' +
                '| HHS       | minimal | absent'
              }</pre>
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
                  stats.tables &&
                    `${stats.tables} comparison table${stats.tables > 1 ? 's' : ''}` +
                      (stats.tableCards ? ` (${stats.tableCards} card${stats.tableCards > 1 ? 's' : ''})` : ''),
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
