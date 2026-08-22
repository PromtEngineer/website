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

Loop engineering means designing systems that prompt your agents instead of prompting them yourself. It matters because the people building the leading coding agents now describe their own work this way. Peter Steinberger [posted on X](https://x.com/steipete/status/2063697162748260627): "you shouldn't be prompting coding agents anymore. You should be designing loops that prompt your agents." Boris Cherny, who leads Claude Code, says the same about his workflow: he doesn't prompt Claude anymore, loops do, and his job is to write the loops. In this post I want to pin down what a loop is, what a serious one needs, when it's the right call, and when it will hurt you.

## What a loop is

A loop removes you from the middle of the agent workflow. In the turn-by-turn setup, you are the bottleneck: the agent finishes, and everything stops until you read the output and type the next instruction. That works for a twenty-minute task. It falls apart on anything long-running, because the work stalls every time it reaches you.

Reduced to its floor, a loop is three parts: you set a goal and a stopping condition (passing unit tests, a maximum number of iterations, whatever criteria you define), an orchestrator prompts the agent based on the current state of the work, and the cycle repeats until the stopping condition is met. That's it. The orchestrator does the job you used to do at the keyboard: look at where things stand, decide what to say next, say it.

<figure>
  <img src="/writing/loop-engineering/loop-anatomy.svg" alt="Diagram of an agentic loop: a seed with goal, specs, and stopping criteria feeds an orchestrator, which prompts an agent; an independent verifier checks the work and a decision step either stops the loop or returns to the orchestrator. Below sit the supporting parts: worktrees, skills, connectors, and memory on disk" width="1200" height="700" />
  <figcaption>The loop replaces your turn-by-turn prompting. The verifier is what makes it trustworthy.</figcaption>
</figure>

Your job doesn't disappear. It moves up a level, and it moves to the front. Someone still decides what to build and whether the result is any good. Even a fully automated loop is still being prompted; the prompt is your initial command and your specs, written once, consumed hundreds of times. Prompting didn't die. It moved to the very start, which makes it matter more, not less.

## Old idea, new discipline

The oldest version of a loop is a while loop with a model inside it. From there the timeline is short. In 2022, the [ReAct paper](https://arxiv.org/abs/2210.03629) described an agent that reasons, acts, reads the result, and repeats. In 2023, [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) took the next step and gave the loop a goal, letting it prompt itself. It became famous for running in circles for hours, burning tokens, and shipping nothing. That failure is a big part of why people wrote agents off as a toy.

What changed between AutoGPT and now is discipline, not invention. The modern version is a tiny loop that feeds the same instructions over and over but resets the context each run, so it doesn't drift the way AutoGPT did. Claude Code and Codex both ship commands that run a loop until a separate check says the work is done.

The sharpest pushback you'll hear is that this is just a cron job with a new name. That's half right. The scheduling is cron. What cron never had is the middle: a cron job runs a fixed script, while a loop runs a model that looks at the state, decides the next move, executes it, checks it, and decides whether to continue. A loop is cron plus a decision maker in the body.

## What a serious loop needs

Starting a loop can be as simple as one command: something like `/loop` on your pull requests, where you write the intent and the stopping condition but not the steps. That gets you a loop. A loop you can trust needs more parts around it:

- **Worktrees.** Isolated copies of the repository. Parallel agents will step on each other's files, so each one gets its own copy.
- **Skills.** Reusable, named instructions, which at the floor are just files of advice the agent reads. Without them the agent re-learns your conventions every run. I covered these in [the harness anatomy essay](/writing/what-is-an-agent-harness/).
- **Connectors.** The loop's hands. Without them it stops at text; with them it can open a pull request and update a ticket.
- **A verifier.** An independent check, so the thing writing the code is not grading itself.
- **Memory on disk.** The model forgets between runs, so durable state, a file the next run can read, gives a failed run something to recover from.

The verifier is the most important item on that list. A loop that writes code and never checks itself is the fastest way to generate confident mistakes and learn nothing per token. Think about what the loop is doing all night: making calls, judging its own output, moving on. If the judge and the worker are the same model, every mistake gets stamped approved. A great loop runs the tests, reads the results, and passes the work to an independent verifier before it counts anything as progress. That feedback mechanism is the difference between a loop and a token furnace.

One more recent addition: dynamic workflows let a single loop fan a task out across many agents at once instead of one at a time. It's powerful, and it's exactly where cost runs away from you.

## When a loop is the right call

The pattern earns its keep when the task fits, and the fit comes down to four things. The task is long-running, the kind that would otherwise stall on your turn-by-turn attention. The outcome is objectively checkable: tests, a build, a measurable target, so the stopping condition writes itself. The specs are solid enough that a system can act on them hundreds of times without asking you anything. And the work can run in isolation, a worktree or a sandbox, where a wrong path costs compute rather than production. If all four hold, a loop will feel like magic.

## When to stay away

Every failure below looks like success while it's happening, which is why this section matters more than people think.

- **You can't verify automatically.** There are no tests, measurable criteria, or independent checks. The loop grades its own homework and confidently passes itself.
- **The specs are vague.** The loop runs on a prompt built from your specs. Leave it vague and the loop doesn't guess once; it guesses confidently in the same direction, over and over, for the whole run. For long-running loops this is disastrous.
- **You must understand the result.** On a small throwaway project, shipping code you don't understand can work. On a large or critical one, somebody has to be responsible for what merged, and that somebody is you.
- **Your review bandwidth is already the bottleneck.** A loop that produces more output makes that worse, not better.
- **The budget is uncapped.** Every token costs money. A loop needs a progress check and a hard spending limit, or the romantic version (write loops, go to sleep) ends with a hole in your wallet.

## The orchestration tax

The middle three items in that list share one root cause: you. A loop will happily start hundreds of parallel agents, but none of that removes the one ceiling that matters. You review, understand, and merge what comes back. The number of loops you can honestly run is set by your review bandwidth, not by the tool.

<figure>
  <img src="/writing/loop-engineering/orchestration-tax.svg" alt="Diagram of the orchestration tax: many parallel agents each producing finished work converge through a narrow gate labeled your review bandwidth into a single human who must review, understand, merge, and stay responsible" width="1200" height="560" />
  <figcaption>More agents do not give you more of you.</figcaption>
</figure>

Even if you push past the review ceiling, your understanding breaks next. When a loop runs on its own, you see final results. The gap between what shipped and what you understand grows in silence. The danger isn't a loop failing loudly. It's a loop succeeding quietly, in a way you stopped following 300 commits ago. The loop can't tell the difference between a person who moves fast on code they understand and a person who avoids understanding entirely. The responsibility lands on you either way.

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
- run more parallel loops than you can review
- treat passing checks as the same thing as understanding
- leave the budget uncapped because the demo went well

## What compounds

After all this machinery, the loop itself is mostly plumbing. Verification is what makes it trustworthy. The thing that compounds is neither. It's the skills. Every iteration that teaches you something about your system should end up encoded as a skill the agent uses on the next run. That's how the learnings accumulate instead of evaporating when the context resets.

That is also the honest answer to what Steinberger and Cherny built. Not a way to stop prompting. A way to prompt once, well, and let a system replay that prompt with verification attached. Loops sit at the center of the harness: in [the anatomy essay](/writing/what-is-an-agent-harness/), the loop is component one of nine. Loop engineering is the discipline of designing that component deliberately: solid guardrails, real verification, explicit stopping conditions, and above all a well-engineered seed prompt. Spend quality engineering time at the start and the loop pays you back. Skip it, and you can run the loop as long as you like; the output will be confident garbage.

## Sources

- [Peter Steinberger's post on X](https://x.com/steipete/status/2063697162748260627) that popularized the term
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629), Yao et al., 2022
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT), the 2023 self-prompting loop
- [What is an agent harness? The nine components of a great one](/writing/what-is-an-agent-harness/), where the loop is component one
- [How to evaluate an agent harness](/writing/evaluating-harnesses/), for measuring whether your loop earns its cost
