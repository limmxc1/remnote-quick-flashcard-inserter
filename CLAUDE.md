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
How every flashcard I make for the user MUST be written. These are non-negotiable; follow all of them. (Outline syntax below is the plugin's: `front >> back` = a card, `concept ↓` + indented bullets = a list card recalled together, `# Heading`/plain bullet = a section with no card, `<>` = quiz both ways.)

**Always build the topic as a hierarchy first.** Lay out the topic tree as plain heading bullets, then hang the cards under the right heading. The parent path carries the context, so fronts can stay short.

## Rule 1 — One card tests exactly ONE thing
Never put a topic's cause + signs + treatment (or any several separate facts) on a single card. Split it into one card per aspect.

```
GOOD                                  BAD (everything crammed onto one card)
Cardiac tamponade                     Cardiac tamponade >> heart squeezed by
  definition >> heart squeezed by       fluid in the pericardium; causes Beck's
    fluid in the pericardium            triad (hypotension, muffled sounds,
  treatment >> pericardiocentesis       raised JVP); treat with pericardiocentesis
```

A genuine set the user must recall *as a group* (a triad, a named list) is the one exception — that becomes ONE list card:
```
Beck's triad ↓
  hypotension
  muffled heart sounds
  raised JVP
```

## Rule 2 — Keep any single recall to ~5 items max
If a real set is long (7+), don't make one giant list. Sub-group it into labelled shorter list cards so the user never recalls more than ~5 at once.
```
Causes of AF
  cardiac ↓                non-cardiac ↓
    ischaemic heart dis.     hyperthyroidism
    hypertension             alcohol
    mitral valve disease     sepsis / pneumonia
                             pulmonary embolism
```

## Rule 3 — The back is ONE tight, complete sentence
Readable prose, rephrased cleanly in my own words (don't copy the source verbatim). Never more than one sentence, never more than one fact, no filler.
```
GOOD  type I MI >> a coronary plaque ruptures, forming a thrombus that occludes the artery
BAD   type I MI >> spontaneous MI from atherosclerotic plaque rupture, ulceration or
        dissection with resulting intraluminal thrombus, reducing myocardial blood supply...
```

## Rule 4 — Front = a short concept, NEVER a question, + a qualifier when needed
Fronts are bare concept phrases, not questions ("immediate management", not "What is the immediate management?"). The parent hierarchy gives broad context. BUT if a bare front would be ambiguous (several answers could fit), add a small qualifier so exactly one answer is correct.
```
GOOD                                   BAD (ambiguous — acute? long-term? prevention?)
Myocardial infarction                  Myocardial infarction
  immediate management >> ...            management >> ...
  secondary prevention >> ...
```

## Rule 5 — Forward-only by default
Quiz front → back only. Use "both ways" (`<>`) ONLY for a clean 1:1 pair where the reverse is also a single, unambiguous answer (a term and its definition). Never create vague reverse cards.
```
1st-line Tx of AF >> bisoprolol (rate control)   ← forward only; reverse would be ambiguous
orthopnoea <> breathlessness when lying flat      ← both ways; clean term ↔ definition
```