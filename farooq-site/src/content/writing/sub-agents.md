---
title: 'Sub-agents: when one context window is not enough'
description: 'Why single-context agents hit a wall, how harnesses isolate work in child agents with the spawn, restrict, collect pattern, and when delegation backfires.'
date: 2026-06-11
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>Sub-agents are isolated processes, not shared threads. Each child gets its own session, a restricted tool set, and a focused prompt. The pattern is spawn, restrict, collect.</li>
    <li>The child does the heavy reading and returns a compact summary or artifact. The parent's context stays small, which is the entire point.</li>
    <li>Anthropic's multi-agent research system beat single-agent Claude Opus 4 by 90.2% on their internal eval, at roughly 15 times the tokens of a chat.</li>
    <li>Skip sub-agents when tasks share state or depend on each other. Most coding tasks parallelize less than research does.</li>
  </ul>
</aside>

Sub-agents are how a harness escapes the limits of a single context window. Instead of running everything through one conversation thread, the parent agent spawns child agents that work in isolation. Each child gets its own session, a restricted set of tools, and a focused prompt scoped to one task.

This post covers why single-context agents hit a wall, how the isolation model works, the spawn, restrict, collect pattern, what comes back to the parent, and when delegation is the wrong call. It expands component four from my essay on [the anatomy of a harness](/writing/what-is-an-agent-harness/).

## Why one window is not enough

A single-context agent fails in two ways.

The first is exhaustion. Every turn adds messages and tool results. One file read can be tens of thousands of tokens. Grep output, search results, and command logs pile up, because every tool call writes another object into the transcript. Long before the hard limit, quality degrades: the model is no longer reasoning over the task. It is swimming through its own transcript.

The second is interference. When one thread carries several pieces of work, the residue of one step pollutes the next. The fifty files the agent read to answer question A are still sitting in context while it works on question B, competing for attention with the details that actually matter.

Some tasks also simply will not fit. Anthropic built their research system around delegation precisely because serious research involves "information that exceeds single context windows." No amount of careful pruning fixes that. You need more windows.

## Isolation, not sharing

The fix harnesses converged on is isolation. A sub-agent is closer to an isolated process than to a shared thread.

Look at how the major harnesses spawn children:

- Pi starts a fresh process with just the task string.
- OpenClaw starts a fresh session by default and passes only filtered workspace context.
- Claude Code's typed-agent path starts blank: the delegated prompt becomes the first user message, with restricted tools and permissions.

Nobody copies the parent's conversation into the child. The child gets the task, the permissions, and the workspace slice it needs. Not the parent's whole mental state.

The isolation has three parts:

- **Own session.** A clean context window, with the full budget available for one task.
- **Restricted tools.** An exploration agent gets read and search, not edit and bash. Restriction keeps the child focused and limits the damage if it goes wrong.
- **Scoped prompt.** The child has no memory of the parent's conversation, so the prompt must stand alone: the task, the constraints, and what to return.

## Spawn, restrict, collect

The whole lifecycle fits in three verbs.

**Spawn.** The parent breaks the task down and writes a self-contained description for each piece. This is the hard part, and it is a prompting problem: a vague delegation produces a child that wanders.

**Restrict.** The harness gives the child only the tools its archetype needs. In the minimal harness from the anatomy essay, that means a few archetypes (exploration, general, verification), each with its own tool list.

**Collect.** The child runs its own loop to completion and hands back one compact result. The parent integrates it and moves on. The child's session ends, and its context is discarded.

<figure>
  <img src="/writing/sub-agents/spawn-restrict-collect.svg" alt="Diagram of the spawn, restrict, collect pattern: a dark parent agent box with a mostly empty context bar sends scoped prompts to three isolated sub-agents (explore, general, verify), each with its own nearly full context bar and restricted tool list, and each returns a compact summary arrow to the parent" width="1200" height="700" />
  <figcaption>The parent's window stays clean. The children's windows fill up and get thrown away.</figcaption>
</figure>

## Orchestrator and workers

Anthropic names this the orchestrator-workers pattern: "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results." The key word is dynamically. The parent decides the subtasks at runtime, based on the task in front of it, not from a predetermined fan-out.

Their multi-agent research system is the clearest production example. A lead agent running Claude Opus 4 plans the research and spawns subagents running Claude Sonnet 4. Each subagent searches in its own context window, with its own tools and its own trajectory, then feeds the essential findings back. The lead agent synthesizes and decides whether to spawn more.

The numbers are striking. The multi-agent system outperformed single-agent Claude Opus 4 by 90.2% on Anthropic's internal research eval. And parallelizing the work, three to five subagents at once with three or more tool calls inside each, cut research time by up to 90% for complex queries.

## What comes back

The child returns a summary or an artifact. Never its transcript.

This is the detail that makes the pattern work. A child might burn hundreds of thousands of tokens reading files and running searches. If all of that flowed back, the parent would inherit exactly the debris the child was spawned to absorb. So the harness collapses the child's entire run into a few hundred tokens of result: the findings, the file paths, the pass or fail.

For large outputs, even a summary is the wrong channel. Anthropic has subagents write their output to a filesystem and pass back a pointer, to avoid what they call a game of telephone: results degrading as they get copied through conversation history.

The accounting is asymmetric by design. The child spends a full window. The parent pays a paragraph.

## When not to use sub-agents

Isolation has costs, and they are not small.

- **Tokens.** Multi-agent systems use about 15 times more tokens than a chat interaction, by Anthropic's measurement. The task has to be valuable enough to justify that.
- **Latency.** Every delegation is a full agent loop. In Anthropic's current system the lead agent executes subagents synchronously, waiting on each batch before it can proceed.
- **Lost shared state.** Isolation cuts both ways. A child cannot see what the parent learned unless the prompt says it. Siblings cannot see each other at all. Two children can duplicate work or reach conflicting conclusions without knowing it.

Anthropic's guidance on poor fits is direct: domains where every agent needs the same context, tasks with many dependencies between agents, and most coding work, which involves "fewer truly parallelizable tasks than research." They also note that LLM agents "are not yet great at coordinating and delegating to other agents in real time."

My rule of thumb: delegate work that is self-contained and read-heavy. Keep tightly coupled edits in the parent.

## The research signal

One number from the Tsinghua harness paper puts the pattern in perspective: roughly 90% of all compute flows through delegated child agents, not the parent. A modern harness is an orchestration pattern, not a reasoning pattern. It decomposes, delegates, and verifies. I covered that paper in [the harness engineering essay](/writing/harness-engineering/).

Anthropic's variance analysis points the same way. On the BrowseComp eval, token usage alone explained 80% of the performance variance. Spending more tokens wins, and once a task outgrows one window, sub-agents are the mechanism for spending them well.

Sub-agent isolation is process management: the harness acting as an operating system, again. The other half of that story is what happens inside a single window: capping file reads, compacting history, paging tool results to disk. That is the subject of the [companion post on context management](/writing/agent-context-management/).

## Sources

- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), Anthropic
- [Building effective agents](https://www.anthropic.com/research/building-effective-agents), Anthropic, where the orchestrator-workers pattern is defined
- [Natural-Language Agent Harnesses](https://arxiv.org/abs/2603.25723), Pan et al., Tsinghua University, March 2026
- [What is an agent harness? The nine components of a great one](/writing/what-is-an-agent-harness/), the anatomy essay on this site
- [Harness engineering: why agent performance now lives outside the model](/writing/harness-engineering/), the research companion
- [Agent context management](/writing/agent-context-management/), the companion post on the single-window half of the problem
