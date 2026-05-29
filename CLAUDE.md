Commit, push, auto-deploy to Github right after every change, so i can view changes remotely, unless you are unsure if the end-result is desirable

# Planning
Give result examples to confirm that you understand my requirements and desired goal.
Interview me whenever you are unsure about specifics or plan
Use subagents in your planning
Subagent 1: Edge cases expert, consider and think of how to handle edge cases. use examples to illustrate edge cases
Subagent 2: UI expert, check for usability and ease of use, and UI consistency across the app
Never ever use jargons, assume i am a non-technical person
Subagent 3: Security expert, consider for potential data leaks, authentication and authorization loopholes

# Writing
Subagent 1: Code executor, takes the plan and execute the code
Subagent 2: code reviewer to ensure code meets plan and user requirements. use claude in chrome to verify, live server is on https://cheval-shf-scheduling-app.vercel.app/. if new issues identified, pass back to code executer to handle

# Personal apps
For creation of new apps, use this tech stack: NextJS, ShadcnUI, Framer Motion for animations, Vercel for hosting, Vercel Blob for db and storage. 
If password protection needed, use 12-digit strong passphrase only

# Flashcard Standards
How every flashcard I make for the user MUST be written. These are non-negotiable; follow all of them. The user is a medical student; cards go into RemNote via this plugin.

**Plugin outline syntax** (used in the examples below): `front >> back` = an inline card (front shown, recall the back); `front <> back` = quiz both directions; `concept ↓` then indented bullets = a "list card" where you recall all the indented items together (an UNORDERED set); `# Heading` or a plain bullet = a section/note with NO card; indentation builds the hierarchy and the parent path gives context to short fronts.

**Always build the topic as a hierarchy first.** Lay out the topic tree as plain heading bullets, then hang the cards under the right heading. The parent path carries the context, so fronts can stay short.

## The 5 core rules

### Rule 1 — One card tests exactly ONE thing
Never put a topic's cause + signs + treatment (or any several separate facts) on one card. Split into one card per aspect.
```
GOOD                                  BAD (everything crammed onto one card)
Cardiac tamponade                     Cardiac tamponade >> heart squeezed by
  definition >> heart squeezed by       fluid in the pericardium; causes Beck's
    fluid in the pericardium            triad (hypotension, muffled sounds,
  treatment >> pericardiocentesis       raised JVP); treat with pericardiocentesis
```
**When is something a "set" (one list card) vs separate aspects (split)?** Use a list card ONLY when (a) the items have a collective name *or* are classically examined together as "the features/causes of X", AND (b) no individual cue would make each a better standalone card. **Default to splitting**; group only when the grouping itself is the thing being tested.
```
Beck's triad ↓          ← has a name, examined as a group → list card
  hypotension
  muffled heart sounds
  raised JVP
```
**List-card front naming:** use the set's proper name if it has one (`Beck's triad`), else `[topic] — features/causes/types of X` (e.g. `Rheumatoid arthritis — extra-articular features`).

### Rule 2 — Keep any single recall to ~5 items max
If a real set is long (7+), don't make one giant list. Sub-group it into labelled shorter list cards so the user never recalls more than ~5 at once. Sub-group **labels must not overlap** (no item fits two), prefer the grouping the exam/source uses, and the label is the cue (part of the path) — it is not separately tested.
```
Causes of AF
  cardiac ↓                non-cardiac ↓
    ischaemic heart dis.     hyperthyroidism
    hypertension             alcohol
    mitral valve disease     sepsis / pneumonia
                             pulmonary embolism
```

### Rule 3 — The back is ONE tight, complete sentence
Readable prose, rephrased cleanly in my own words (don't copy the source verbatim). "One fact" means one testable idea — a single sentence MAY hold a short cause→effect chain, but never two separate facts and no filler.
```
GOOD  type I MI >> a coronary plaque ruptures, forming a thrombus that occludes the artery
BAD   type I MI >> spontaneous MI from atherosclerotic plaque rupture, ulceration or
        dissection with resulting intraluminal thrombus, reducing myocardial blood supply...
```
**Exception — bare facts, no sentence:** for a value/cutoff/dose, or an arbitrary rote fact (nerve roots, chromosomes, scores), the back is just the bare fact + unit, NOT a sentence. The number/term *is* the whole answer.
```
clinic BP target (under 80 yo) >> <140/90
paracetamol loading dose >> 150 mg/kg
phrenic nerve roots >> C3, C4, C5
```

### Rule 4 — Front = a short concept, NEVER a question, + a qualifier when needed
Fronts are bare concept phrases, not questions ("immediate management", not "What is the immediate management?"). The parent hierarchy gives broad context. If a bare front would be ambiguous (several answers could fit), add a small qualifier so exactly one answer is correct. **The front must never contain a word that is the answer** (no give-aways).
```
GOOD                                   BAD (ambiguous — acute? long-term? prevention?)
Myocardial infarction                  Myocardial infarction
  immediate management >> ...            management >> ...
  secondary prevention >> ...
```
For "single best" facts, always state the axis in the front — *first-line, definitive/gold-standard, most common cause,* or *single most appropriate* — one card per axis (e.g. `PE — first-line investigation` vs `PE — definitive imaging` are two different cards).

### Rule 5 — Forward-only by default
Quiz front → back only. Use "both ways" (`<>`) ONLY for a clean 1:1 pair where the reverse is also a single, unambiguous answer — the test is "is the reverse unique?", not "is it a definition". So term↔definition, antidote↔toxin, gene↔disease all qualify. Never create vague reverse cards.
```
1st-line Tx of AF >> bisoprolol (rate control)        ← forward only; reverse is ambiguous
orthopnoea <> breathlessness when lying flat           ← both ways; clean term ↔ definition
paracetamol overdose antidote <> N-acetylcysteine      ← both ways; clean 1:1, unique each way
```

## Special card types (cheat-sheet)

- **Numbers / values / doses** → bare value + unit only (see Rule 3 exception). A conditional value becomes a 2-item list card, not prose (`statin — start if QRISK ↓ / ≥10% primary prevention / any value in established CVD`).
- **Comparisons ("X vs Y")** → ONE side-by-side list card with both labelled. (User's explicit preference.)
  ```
  UC vs Crohn's ↓
    UC: continuous from rectum, mucosal only
    Crohn's: skip lesions, transmural, mouth-to-anus
  ```
- **Ordered sequences (order matters: algorithms, cascades, stages 1→5)** → NEVER a plain list card (a list is unordered). Chain "what comes next" cards instead.
  ```
  shockable ALS — after a shock >> 2 min CPR, then rhythm check
  CKD — stage after eGFR 30–44 >> stage 4 (eGFR 15–29)
  ```
- **Visual facts (ECGs, X-ray signs, rashes, histology)** → flag it: tell the user "this needs an image-occlusion card" so they add the image in RemNote, rather than forcing weak prose. Fallback when no image is handy: a text card on the single most specific feature (`P waves unrelated to QRS >> complete heart block`).
- **Exceptions / contraindications** → their own forward card whose front names the rule + "exception/contraindication"; never bury an exception inside another card's back.
  ```
  ACE inhibitor — main contraindication >> bilateral renal artery stenosis
  ```
