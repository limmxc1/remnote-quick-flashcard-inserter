# Quick Flashcard Inserter — RemNote Plugin

Add flashcards (a question and an answer) to RemNote from a small popup, without
breaking your flow. Open it once and keep adding card after card.

## What it does

- Run the **Insert Flashcard** command (type `/card` in the editor, or open the
  command palette and search for "Insert Flashcard").
- The popup has two tabs: **Single card** and **Bulk paste**.

### Single card

- A **Question** box and one or more **Answer** boxes:
  - **One answer** makes a simple inline card (`question >> answer`).
  - **Two or more answers** (press *+ Add another answer*) make a **list card** —
    the question with each answer as a child bullet you recall together.
- You also choose how you want to be quizzed:
  - Question → Answer
  - Answer → Question
  - Both ways
- Click **Add Card** (or press **⌘/Ctrl + Enter**). The flashcard is added to the
  document you were in, the boxes clear, and you can immediately type the next one.
- A running count shows how many cards you've added in this session.

### Bulk paste

Paste a whole indented outline and create many cards (and list cards) in one go.
A live preview shows what will be created before you commit, and the cards land
under whatever you had focused — so focus the section you want first.

| You type | You get |
| --- | --- |
| `# Heading` | a plain section bullet (no card) |
| `front >> back` | an inline card, quizzed Question → Answer |
| `front << back` | an inline card, quizzed Answer → Question |
| `front <> back` | an inline card, quizzed both ways |
| `concept ↓` + indented bullets | a **list card** — recall the bullets together |
| anything else | a plain bullet (handy for background notes) |

Indent with **2 spaces (or a tab) per level** to nest things. Example:

```
# Diagnosis
Pulse in AF >> Irregularly irregular
Signs on ECG ↓
  Irregular R-R interval
  No clear P-waves
  Narrow QRS (<0.12 s)
```

## Where cards go

The card is placed under whatever you had focused when you opened the popup — the
exact bullet your cursor was on, or, if nothing was focused, the document open in
the current pane. The popup shows "Adding to: …" so you always know where the card
will land.

## Settings

- **Default flashcard direction** — pick the direction new cards start with. You
  can still change it for any individual card in the popup.

## Develop / run locally

```bash
npm install
npm run dev
```

Then in RemNote: **Settings → Plugins → Build → Develop from localhost**, and enter
`http://localhost:8080`.

## Build for upload

```bash
npm run build
```

This validates the manifest and produces `PluginZip.zip`, which can be uploaded to
the RemNote plugin store.
