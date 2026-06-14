---
title: 'Loop engineering: what it is, when to use it, and when to stay away'
description: 'Loop engineering means designing systems that prompt your agents instead of prompting them yourself. What a loop is, what a serious one needs, and the caveats that matter.'
date: 2026-06-11
video: '7BrxIBkX3mg'
videoLength: '11 min'
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>A loop replaces you as the prompter. You set the goal and the stopping criteria; an orchestrator prompts the agent from the current state until a check passes or a budget runs out.</li>
    <li>It is not a new idea (while loops, ReAct, AutoGPT) and it is not a cron job. Cron runs a fixed script. A loop has a decision maker in the body.</li>
    <li>The verifier is the most important part. A loop that grades its own work generates confident mistakes at scale.</li>
    <li>The real limits are the seed prompt, your review bandwidth, and cost. More agents do not give you more of you.</li>
  </ul>
</aside>

Loop engineering is the idea that you stop prompting coding agents directly and start designing loops that prompt them for you. The term took off when Peter Steinberger [posted on X](https://x.com/steipete/status/2063697162748260627): "you shouldn't be prompting coding agents anymore. You should be designing loops that prompt your agents." Boris Cherny, who leads Claude Code, says the same thing about his own workflow: he doesn't prompt Claude anymore, loops do, and his job is to write the loops.

There is a real shift here. There is also a lot of confusion about what a loop actually is, and very little honest discussion of when you should not use one. This post covers both: what loop engineering entails, what a serious loop needs, when it is the right call, and when it will quietly hurt you.

## What a loop actually is

In the traditional setup, you are the bottleneck. You prompt the agent, it produces output, you evaluate the output, and you write the next prompt. The work is sequential, and it stalls every time it reaches you. That setup does not survive long-running tasks.

The pattern that replaces it has three parts. You set the initial goal and a stopping condition: passing unit tests, a maximum number of iterations, or any criteria you define. An orchestrator prompts the agent based on the current state of the work. The loop runs until the stopping condition is met.

<figure>
  <img src="/writing/loop-engineering/loop-anatomy.svg" alt="Diagram of an agentic loop: a seed with goal, specs, and stopping criteria feeds an orchestrator, which prompts an agent; an independent verifier checks the work and a decision step either stops the loop or returns to the orchestrator. Below sit the supporting parts: worktrees, skills, connectors, and memory on disk" width="1200" height="700" />
  <figcaption>The loop replaces your turn-by-turn prompting. The verifier is what makes it trustworthy.</figcaption>
</figure>

Your job does not disappear. It moves up a level, and it moves to the front. Someone still decides what to build and whether the result is any good. Even a fully automated loop is still being prompted; the prompt is your initial command and your specs. Prompting did not die. It moved to the very start, which makes it matter more, not less.

## Old idea, new discipline

The loop is not a new invention, and it helps to see the timeline. The oldest version is a while loop with a model inside it. In 2022, the [ReAct paper](https://arxiv.org/abs/2210.03629) described an agent that reasons, acts, reads the result, and repeats. In 2023, [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) gave the loop a goal and let it prompt itself. It became famous for running in circles for hours, burning tokens, and shipping nothing. That failure is a big part of why people called agents a toy.

What changed is discipline. The modern version is a tiny loop that feeds the same instructions over and over but resets the context each run, so it does not drift. Claude Code and Codex both ship commands that run a loop until a separate check says the work is done.

The sharpest pushback is that this is just a cron job with a new name. That is half right. The scheduling is cron. What cron never had is the middle: a cron job runs a fixed script, while a loop runs a model that looks at the state, decides the next move, executes it, checks it, and decides whether to continue. A loop is cron plus a decision maker in the body.

## What a serious loop needs

Starting a loop can be as simple as one command: something like `/loop` on your pull requests, where you write the intent and the stopping condition but not the steps. A loop you can trust needs more parts around it:

- **Worktrees.** Isolated copies of the repository, so parallel agents do not collide.
- **Skills.** Reusable, named instructions, so the agent is not re-learning your conventions every run. I covered these in [the harness anatomy essay](/writing/what-is-an-agent-harness/).
- **Connectors.** So the loop can open a pull request and update a ticket instead of stopping at text.
- **A verifier.** An independent check, so the thing writing the code is not grading itself.
- **Memory on disk.** The model forgets between runs; durable state gives a failed run something to recover from.

The verifier deserves the emphasis. A loop that writes code and never checks itself is the fastest way to generate confident mistakes and learn nothing per token. A great loop runs the tests, reads the results, and passes the work to an independent verifier before it counts anything as progress. That feedback mechanism is the difference between a loop and a token furnace.

One more recent addition: dynamic workflows let a single loop fan a task out across many agents at once instead of one at a time. It is powerful, and it is exactly where cost runs away from you.

## When a loop is the right call

- The task is long-running and would otherwise stall on your turn-by-turn attention.
- The outcome is objectively checkable: tests, a build, a measurable target. The stopping condition writes itself.
- The specs are solid enough that a system can act on them hundreds of times without asking you anything.
- The work can run in isolation (a worktree, a sandbox) where a wrong path costs compute, not production.

## When to stay away

This part is more critical than people think.

- **You cannot verify automatically.** No tests, no measurable criteria, no independent check. The loop will grade its own homework and confidently pass itself.
- **The specs are vague.** The loop runs on a prompt built from your specs. Leave it vague and the loop does not guess once; it guesses confidently in the same direction, over and over, for the whole run. For long-running loops this is disastrous.
- **You must understand the result.** On a small throwaway project, shipping code you do not understand can work. On a large or critical one, somebody has to be responsible for what merged, and that somebody is you.
- **Your review bandwidth is already the bottleneck.** A loop that produces more output makes that worse, not better.
- **The budget is uncapped.** Every token costs money. A loop needs a progress check and a hard spending limit, or the romantic version (write loops, go to sleep) ends with a hole in your wallet.

## The orchestration tax

A loop will happily start hundreds of parallel agents. None of that removes the one ceiling that matters: you. You review, understand, and merge what comes back. The number of loops you can really run is set by your review bandwidth, not by the tool.

<figure>
  <img src="/writing/loop-engineering/orchestration-tax.svg" alt="Diagram of the orchestration tax: many parallel agents each producing finished work converge through a narrow gate labeled your review bandwidth into a single human who must review, understand, merge, and stay responsible" width="1200" height="560" />
  <figcaption>More agents do not give you more of you.</figcaption>
</figure>

And even if you push past the review ceiling, your understanding breaks next. When a loop runs on its own, you see final results. The gap between what shipped and what you understand grows quietly. The danger is not that the loop fails loudly. It is that it succeeds quietly, in a way you stopped following 300 commits ago. The loop cannot tell the difference between a person who moves fast on code they understand and a person who avoids understanding entirely. The responsibility lands on you either way.

## Do this, not that

Do:

- write the stopping condition before you write the loop
- give the verifier independence from the agent doing the work
- isolate runs in worktrees and persist state to disk
- set a hard spending limit and a progress check
- encode every learned correction as a skill, so the next run starts smarter
- start with one loop you can fully review, then scale

Don't:

- launch a loop on vague specs and hope
- let the loop grade its own work
- run more parallel loops than you can actually review
- treat passing checks as the same thing as understanding
- leave the budget uncapped because the demo went well

## What actually compounds

The loop itself is mostly plumbing. Verification is what makes it trustworthy. The thing that compounds is neither: it is the skills. Every iteration that teaches you something about your system should end up encoded as a skill the agent uses on the next run. That is how the learnings accumulate instead of evaporating when the context resets.

Loops sit at the center of the harness: in [the anatomy essay](/writing/what-is-an-agent-harness/), the loop is component one of nine. Loop engineering is the discipline of designing that component deliberately: solid guardrails, real verification, explicit stopping conditions, and above all a well-engineered seed prompt. Spend quality engineering time at the start and the loop pays you back. Skip it, and you can run the loop as long as you like; the output will be confident garbage.

## Sources

- [Peter Steinberger's post on X](https://x.com/steipete/status/2063697162748260627) that popularized the term
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629), Yao et al., 2022
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT), the 2023 self-prompting loop
- [What is an agent harness? The nine components of a great one](/writing/what-is-an-agent-harness/), where the loop is component one
- [How to evaluate an agent harness](/writing/evaluating-harnesses/), for measuring whether your loop earns its cost
