# Quick Flashcard Inserter — RemNote Plugin

Add flashcards (a question and an answer) to RemNote from a small popup, without
breaking your flow. Open it once and keep adding card after card.

## What it does

- Run the **Insert Flashcard** command (type `/card` in the editor, or open the
  command palette and search for "Insert Flashcard").
- A popup appears with two boxes — **Question** and **Answer** — and a choice of
  how you want to be quizzed:
  - Question → Answer
  - Answer → Question
  - Both ways
- Click **Add Card** (or press **⌘/Ctrl + Enter**). The flashcard is added to the
  document you were in, the boxes clear, and you can immediately type the next one.
- A running count shows how many cards you've added in this session.

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
