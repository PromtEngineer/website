---
title: 'How agent harnesses manage context: cap, slice, search, store'
description: 'What occupies an agent''s context window and the four moves harnesses use when content does not fit: cap it, slice it, search it, or store it elsewhere.'
date: 2026-06-11
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>The context window fills from all sides: a fixed system prompt and tool definitions, growing history, file reads, tool results, sub-agent output, and memory state. Only one slice is untouchable: room for the model to answer.</li>
    <li>When content does not fit, harnesses converge on four moves: cap it, slice it, search it, or store it somewhere else.</li>
    <li>Tool results are the quiet offender. Modern harnesses treat them as artifacts on disk, with a preview and a pointer in the transcript, not as messages.</li>
    <li>The right mental model is virtual memory. The harness pages context in and out so a fixed-size working set feels infinite.</li>
  </ul>
</aside>

Every serious agent eventually hits the same wall. Not model quality. Not reasoning. Not tools. Memory. The context window is too small for everything the model might want to see. A few long file reads, a grep result, a sub-agent response, a growing chat history, and the model is no longer reasoning about the task. It is swimming through its own transcript.

Modern harnesses no longer treat context as a passive chat log. They treat it as memory that has to be managed. In [the harness anatomy essay](/writing/what-is-an-agent-harness/) I listed context management as component two of nine. This post is the deep dive: what actually occupies the window, the four moves harnesses make when content does not fit, how file truncation works across four real harnesses, and why tool results deserve special treatment.

## What fills the context window

Think about what sits in the window on any given turn:

- **Fixed context.** The system prompt, tool definitions, policies, and skills. Loaded once at session start.
- **Conversation history.** Grows every turn, without bound.
- **File contents.** A single read can be ten thousand, fifty thousand, sometimes hundreds of thousands of tokens. Often the largest single occupant.
- **Tool results.** Grep, bash, search, database output. Every call writes another object into the transcript, so these accumulate fast.
- **Sub-agent responses, summaries, and memory state.** Forked task output and compaction artifacts.

All of it competes with the one budget you cannot touch: room for the model to answer.

<figure>
  <img src="/writing/agent-context-management/01-context-window-fill.svg" alt="Diagram of a context window stacked with system prompt and tool definitions, conversation history, file contents, tool results, sub-agent responses, and session memory, with file reads of 10K to 250K tokens flowing in and a column of harness countermeasures: cap file reads, truncate tool results, compact history, evict stale data, nudge to search, restore after compaction" width="2048" height="1440" />
  <figcaption>The window fills from all sides. The model sees only what the harness lets through.</figcaption>
</figure>

So the harness starts acting like an operating system. It decides what stays close to the model, what gets compressed, what gets paged out, and what can be retrieved later. The rest of this post is that decision process, piece by piece.

## Large files are the first stress test

Large files make the problem concrete. If the model asks to read a file bigger than the available context, somebody has to decide what happens. For the research behind this post I traced that decision through four harnesses: Pi, OpenClaw, Claude Code, and Letta. None of them just reads the file. The answer is always some combination of four moves:

- **Cap it.** Enforce a hard limit on lines or bytes and show the head of the file.
- **Slice it.** Let the model page through the rest with offset and limit parameters.
- **Search it.** Point the model at grep or semantic search instead of a full read.
- **Store it elsewhere.** Keep the full content on disk or in a vector store and show only a managed view.

Here is how each harness combines them:

- **Pi** is harness-first and simple. File reads are capped at 2,000 lines or 50 KB. The model sees the beginning of the file plus an explicit continuation nudge: use offset and limit to continue.
- **OpenClaw** layers defense on top of the same idea. It keeps Pi-style truncation, adds character budgets for bootstrap files, caps tool results, and uses head-plus-tail truncation when the end of the output looks important.
- **Claude Code** is the most aggressive. It checks file size before opening. If the file is too large, the read is rejected outright and the model is pointed toward offset, limit, or grep. After a successful read it token-counts the output, truncates long lines, deduplicates repeated reads of the same file, and can tune all of these limits remotely.
- **Letta** takes a different path. It parses, chunks, and embeds files into a vector store. The model gets direct viewing, exact search, and semantic search, and the window only ever shows a managed view of the file.

<figure>
  <img src="/writing/agent-context-management/02-large-file-handling.svg" alt="Four-column comparison of how Pi, OpenClaw, Claude Code, and Letta handle large files: Pi caps reads at 2K lines or 50KB with a continuation nudge, OpenClaw adds bootstrap file caps and head plus tail truncation, Claude Code gates reads by size, budgets tokens, and dedupes repeated reads with remotely tunable limits, and Letta chunks and embeds files into a vector store with semantic search" width="2048" height="1210" />
  <figcaption>Four harnesses, four mixes of cap, slice, search, and store. None of them dumps the file into the model.</figcaption>
</figure>

Different architectures, same lesson: file context is not dumped into the model. It is mediated.

## Tool results are context pollution

The same pattern shows up with tool calls. Tool results feel harmless because each one looks useful in isolation. But a few large grep outputs, JSON payloads, logs, or dataframe previews can consume the working set faster than the conversation itself.

That is why harnesses increasingly treat tool outputs as artifacts, not messages:

- Oversized results are persisted to disk. The model sees a small preview and a pointer.
- Repeated previews are deduplicated.
- Long values are truncated head-and-tail.
- Search results are summarized, paginated, or capped per tool and per message.

Anthropic's [context engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) points the same way: treat context as a finite resource and clear raw tool outputs from history once they have served their purpose.

This is virtual memory thinking. The model does not need the entire payload in the prompt. It needs enough visible state to decide what to fetch next.

## Compaction handles old history

Long sessions add a deeper problem: deciding what old history still matters. When context pressure crosses a threshold, the harness keeps the recent tail of the conversation and summarizes the older transcript into a synthetic message. Each of the four harnesses does this differently. OpenClaw flushes important state to memory before compacting. Claude Code offloads oversized tool results before each call and can restore recently read files after compaction. Letta warns before the window is full, evicts with a sliding window, and falls back to stronger truncation if the summary itself overflows. Compaction done badly can quietly ruin a session, so I wrote [a separate deep dive](/writing/compaction/) on how each harness triggers, summarizes, and recovers.

## Sub-agents are isolated processes

Sub-agents reveal another convergence. Most harnesses do not copy the parent conversation into every child. Pi starts a fresh process with just the task string. OpenClaw starts a fresh session and passes only filtered workspace context. Claude Code's typed agents start blank: the delegated prompt becomes the first user message, with restricted tools and permissions. Letta mostly avoids forking and keeps execution inside the main loop, with history reachable through recall and archival tools. Sub-agents are closer to isolated processes than shared threads. They get the task, the permissions, and the workspace slice they need, not the parent's whole mental state. I cover the pattern properly in [the sub-agents essay](/writing/sub-agents/).

## The same primitives everywhere

None of this is a coding-agent quirk. A data exploration agent hits the same wall with tables, traces, JSON, notebooks, and charts. Arize's Alyx converged on near-identical answers: cap tool results, binary-search for the largest slice that fits, deduplicate repeated previews, keep full payloads server-side, expose drill-down tools, and force checkpoints when token pressure climbs. Cursor, Aider, Continue, LangGraph, and OpenAI's Agents SDK all point in the same direction.

<figure>
  <img src="/writing/agent-context-management/05-feature-matrix.svg" alt="Feature matrix comparing Pi, OpenClaw, Claude Code, and Letta across file context, tool context, sub-agent context, and session management, with rows for read caps, pagination, result offloading, deduplication, isolation, and summarization triggers" width="1400" height="2000" />
  <figcaption>The full feature matrix. Four very different architectures converge on the same context primitives.</figcaption>
</figure>

Bigger windows do not dissolve the problem either. [Lost in the Middle](https://arxiv.org/abs/2307.03172) showed that models use information at the start and end of a long context far better than information buried in the middle. Chroma's [Context Rot](https://www.trychroma.com/research/context-rot) report measured 18 models getting less reliable as input grows, even on simple tasks. Putting more tokens in the window does not guarantee the model uses them well.

## The mental model is virtual memory

The best frame for all of this is not prompt engineering. It is virtual memory:

- The prompt is registers and cache: what the model needs right now.
- Recent conversation is RAM.
- Summaries are compressed pages.
- Files, vector stores, databases, logs, and tool artifacts are disk.
- Grep, semantic search, offsets, limits, and recall tools are page lookup.
- Compaction is garbage collection.
- Sub-agent isolation is process management.

This analogy is not new. The [MemGPT paper](https://arxiv.org/abs/2310.08560), the research behind Letta, proposed exactly this in 2023: manage memory tiers inside and outside the window the way an operating system moves pages between RAM and disk. What has changed is that every serious harness now implements some version of it.

The agent looks like one continuous intelligence. Underneath, the harness is constantly moving memory around.

## Where this fits

The future of agents is not just better models with bigger windows. It is harnesses that make a fixed-size working set feel infinite. They cap, slice, search, store, summarize, restore, and isolate, and the model sees the right working set at the right time. [The research evidence](/writing/harness-engineering/) keeps finding that the harness drives more of an agent's performance than the model. Context management is a large part of where that gap comes from.

## Sources

- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172), Liu et al., 2023
- [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://www.trychroma.com/research/context-rot), Chroma research, 2025
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560), Packer et al., 2023, the paper behind Letta
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), Anthropic
- [What is an agent harness? The nine components of a great one](/writing/what-is-an-agent-harness/), the companion essay this post deepens
- [Harness engineering: why agent performance now lives outside the model](/writing/harness-engineering/), the research evidence
