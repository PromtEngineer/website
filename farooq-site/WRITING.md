# Writing style guide

Every essay on this site tells a story. It does not dump ideas. The goal: a reader who starts a post cannot find a clean place to stop until the wrap-up, and a reader who finishes one could re-explain the concept to a friend in plain English.

This guide covers the prose. Diagrams have their own rules in [DIAGRAMS.md](./DIAGRAMS.md); nothing here overrides them. The TL;DR aside, figures, code blocks, and Sources sections are visual furniture with fixed formats. The story happens in the paragraphs between them.

## The one-sentence test

Before writing anything, answer: what is the single question this post exists to answer, framed as a situation the reader is in?

Not "compaction is the summarize-and-prune step" but "your agent has been working for an hour and suddenly acts like a stranger to its own session. What happened?" The driving question opens the post, stays open through the middle, and closes explicitly near the end. If you cannot state it, the post is a reference doc, not an essay, and it will read like one.

## Structure of a post

1. **Frontmatter** — title, description, date, tags. Optional: `pinned`, `video`, `videoLength`.
2. **TL;DR aside** — `<aside class="tldr">` with 3-5 `<li>` bullets. Written last, after the essay is done. This is the only place where dumping ideas is the job.
3. **Opening** — the driving question as a situation ("you hand an agent a real task, it works fine for twenty minutes, then..."). Plant 1-2 open loops: things you name now and resolve later ("there are two places this quietly breaks, and we'll get to both").
4. **Body sections** — the concept spine, walked in dependency order (see below).
5. **Wrap-up** — close the driving question by name ("back to the gap we started with").
6. **Sources** — plain bullet list of links, one line each.

## The concept spine

List the concepts a reader must hold to follow the post. Cut anything not load-bearing. Sort them in dependency order: a concept appears only after everything it relies on already exists in the reader's head. No forward references. Then walk the spine, running the routine below on every concept.

## The routine (run it on every concept)

1. **Locate** — introduce it as the next step in the story, never floating in the abstract ("the next thing the harness has to deal with is...").
2. **Name + reduce** — say the term, then immediately collapse it to its simplest true form, ending on a noun a beginner already owns ("a harness is basically a while loop with a memory").
3. **Anchor** — one concrete analogy, only if the idea is abstract ("the model is the engine, the harness is the car").
4. **Instantiate** — one small, specific number or case ("say the budget is 200,000 tokens and you're at 190,000...").
5. **Motivate** — the problem it solves BEFORE the mechanism, hinged on "so" ("the transcript grows every turn and the window doesn't, so something has to give").
6. **Hand off** — end by pointing at the next concept, so units chain.

Two laws override everything:

- **Reduction law.** Never leave a jargon term unpaid. Every term lands on a plain-English floor: "numbers," "a database," "a summary," "a file on disk." If the sentence doesn't end on a noun a beginner owns, it isn't reduced yet.
- **Why-before-how law.** Never present a mechanism before naming the pain it removes. Problem, then "so," then solution.

If an explanation feels generic, the fix is almost always a missing reduce or a missing motivate.

## Story mechanics

- **Open loops.** Plant 1-2 early, pay them off explicitly, and say so when you do: "remember the summary that dropped the file paths? this is where it bites." The named callback is the reward.
- **No flat section endings.** Every section closes on a sentence that hands off to the next. If a section could be the last one and the reader wouldn't notice, it ends flat. A flat ending is where readers leave.
- **An early payoff.** One vivid "here's what this looks like in practice" moment before the halfway point. Don't backload all the reward to the end.
- **Stakes.** Keep the naive-version failure visible in the background so each idea has something to beat.
- **The shuffle test.** Pick any two adjacent paragraphs and swap them. If the post still reads fine, the chain is broken; each paragraph must need the one before it.

## Voice

First person, calm, conversational. Write like you're explaining to a smart friend who can code but hasn't heard the jargon. When in doubt, explain down to that person.

- Contractions. Short clauses chained with "and... so... now...". "You" for the reader's situation; "we/let's" sparingly.
- Signpost transitions: "now," "next," "so," "the catch is," "here's the problem." Vary the openers; never start consecutive paragraphs the same way.
- Honest limitations stay in ("compaction done badly can quietly ruin a session"). The honesty is part of the voice and is what earns trust.
- Attach a "because" to every concrete choice (a parameter, a threshold, a design).
- Read every sentence aloud in your head. If it doesn't sound like a calm person talking, rewrite it.

## Bans (these read as machine-written)

- **No em dashes, no spaced-hyphen asides.** Use a "which/that" clause, a comma, a colon, or two sentences. Hyphenated words ("sub-agent," "read-only") are fine. This matches the diagram rule: no em dashes anywhere on the site.
- **No anaphora** ("no X, no Y, no Z"), no reflexive rule-of-three, no mirrored antithesis.
- **Intensifiers** ("actually," "really," "genuinely," "quietly," "honestly") at most twice per post.
- **Bullet lists never carry the argument.** Keep them only for genuinely enumerable facts (a component list, a checklist, sources). Everything else is prose. A numbered component list may stay as bolded numbered paragraphs, but each item runs the routine inside, and the lead-in and exit are narrative.

## Before and after

Reference-doc style (what we moved away from):

> Compaction is the step where an agent harness summarizes older conversation history to make room for new work. Every long session needs it.

Story style (what we write now):

> Your agent has been working for an hour. It knows the codebase, it knows what failed, it knows what you rejected. Then, mid-task, it re-reads a file it already read and proposes the approach you killed twenty minutes ago. Nothing crashed. Something between two turns threw its memory away, and that something is called compaction.

Same facts. The first defines a term; the second puts the reader inside the failure the term exists to explain, so the definition arrives as an answer instead of an assertion.

## Checklist (run before publishing)

- [ ] Driving question stated in the opening as a situation, closed explicitly near the end.
- [ ] Concept spine is dependency-ordered; no concept used before it's introduced.
- [ ] Every concept runs the routine; every jargon term reduced to a plain-English floor.
- [ ] Every mechanism preceded by its problem (why before how).
- [ ] 1-2 open loops planted early, paid off by name.
- [ ] One concrete payoff before the halfway point.
- [ ] No flat section endings; passes the shuffle test.
- [ ] No em dashes; no anaphora or mirrored antithesis; intensifiers ≤ 2.
- [ ] Bullet lists only for enumerable facts; the argument lives in prose.
- [ ] TL;DR aside written last, 3-5 bullets.
- [ ] Figures follow [DIAGRAMS.md](./DIAGRAMS.md); one green accent idea per diagram.
- [ ] Sources section present, plain links.
