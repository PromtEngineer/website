---
title: 'What is an agent harness? The nine components of a great one'
description: 'Everybody talks about agent harnesses, but few can define one. A harness is the fixed architecture that turns a model into an agent. Here is what goes inside, component by component.'
date: 2026-06-10
video: 'nWzXyjXCoCE'
videoLength: '21 min'
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>A harness is a fixed architecture that turns a model into an agent. The model is the engine; the harness is the car.</li>
    <li>Frameworks (LangChain, AutoGen, CrewAI) are not harnesses. A framework gives you pieces for a human to assemble. A harness ships a working agent and asks only for the goal.</li>
    <li>Nine components make a modern harness: the loop, context management, tools and skills, sub-agents, built-in skills, session persistence, prompt assembly, hooks, and permissions.</li>
    <li>The fastest way to understand all nine is to build a tiny one. The companion video walks through a minimal Python reference implementation.</li>
  </ul>
</aside>

Everybody talks about agent harnesses. But even people actively building agents can't always give you a clean answer to what a harness actually is. The word gets thrown around constantly, and nobody quite agrees on what it means.

So let's do three things: define what a harness is (and just as importantly, what it's not), walk through the nine components that make up a modern harness, and look at how you'd build a tiny one in Python.

## A harness turns a model into an agent

In the simplest terms: a harness is a fixed architecture that turns a model into an agent.

A modern LLM on its own is a one-shot text generator. You ask a question, it answers, and it stops. The harness is what gives the model the ability to take action, see the consequences, and keep going until the problem is actually solved. Think of the model as the engine and the harness as the car around it. Together, they make an agent.

The clearest examples are the agentic coding tools: Claude Code, Codex, Cursor, Windsurf. Each one is a harness. Each started from a concrete problem (making a model write and edit code across a real repository) and, notably, they have converged on remarkably similar architectures.

## A harness is not a framework

This distinction is worth making explicitly, because the terms get used interchangeably and it's causing real confusion.

LangChain, LangGraph, AutoGen, CrewAI: these are frameworks, not harnesses. A framework gives you abstractions (state graphs, chains, memory connectors, retrievers) and assumes that you, the human architect, will wire them together.

A harness comes from the opposite direction. There is no assembly step. It ships a working agent: at its core, a while loop with a tool registry and a permission layer, everything already wired. A framework is built for a human to assemble an agent. A harness is built for the agent itself to do a task. You provide the goal; the harness handles the rest.

<figure>
  <img src="/writing/what-is-an-agent-harness/harness-vs-framework.svg" alt="Two-column comparison: a framework provides parts like chains, state graphs, memory, and retrievers for a human to assemble; a harness ships an assembled agent consisting of a loop, tool registry, and permission layer, and asks only for a goal" width="1200" height="540" />
  <figcaption>Frameworks hand you parts. Harnesses hand you a working agent.</figcaption>
</figure>

## The nine components of a modern harness

This is an opinionated architecture, but it's one I've seen work in practice, and it maps closely onto how the best harness I know, Claude Code, is put together.

<figure>
  <img src="/writing/what-is-an-agent-harness/nine-components.svg" alt="Architecture diagram of a harness: the model sits inside an agent loop, surrounded by eight supporting components: context management, tools and skills, sub-agents, built-in skills, session persistence, prompt assembly, lifecycle hooks, and permissions" width="1200" height="700" />
  <figcaption>The loop is the engine. Everything else exists to support it.</figcaption>
</figure>

**1. The loop.** The foundation. A harness is, at its core, a while loop: the model reads its system prompt, decides which tool to call, the harness runs the tool and feeds the result back into context, and the cycle repeats until the model produces a text-only response or hits an iteration cap. Everything else in the architecture exists to support these few lines.

**2. Context management.** Every turn grows the conversation: more messages, more tool results. Eventually you hit the model's context limit, so the harness has to decide what to keep verbatim, what to summarize, and what to throw away. Claude Code's budget was around 200,000 tokens (now up to a million with Opus); when usage approaches the threshold, it triggers compaction. Recent messages stay in full, older ones get summarized. Done badly, compaction quietly destroys sessions, so treat this component with respect.

**3. Tools and skills.** Tools are the primitives: read a file, edit a file, run bash, search code. Skills are a layer on top: how organizational knowledge gets encoded, usually as markdown files. Tools are universal; skills are specific to your team and your workflow. Binding them together is the registry, which knows what's available, what permission each entry needs, and how calls get dispatched.

**4. Sub-agent management.** At some point a task gets too big or too parallel for a single conversation thread. The harness spawns sub-agents that work in isolation: each gets its own session, a restricted set of tools, and a focused system prompt scoped to one specific task. The pattern is spawn, restrict, collect.

**5. Built-in skills.** Beyond what users add, every harness ships a baseline that works out of the box: file operations, shell execution, code navigation. For a coding agent these are non-negotiable. Modern harnesses also ship higher-level built-ins: how to make a git commit, how to open a pull request, how to run the tests and read the results.

**6. Session persistence.** A long agent session is stateful, and if the process crashes you lose everything unless the harness writes state to disk. The modern approach is elegant: an append-only JSONL log, one line per event (every message, tool result, and compaction event), flushed immediately on write. If the harness dies, the file does not, and replaying the log reconstructs the session exactly where it left off.

**7. System prompt assembly.** The component that surprises people most: the system prompt is not a static string. It's a pipeline that walks ancestor directories looking for instruction files like CLAUDE.md or AGENTS.md and injects them. One caution: order matters. Keep the static parts first and dynamic content second, or you'll break prefix caching and pay for it on every request.

**8. Lifecycle hooks.** The extensibility seam. Hooks inject custom logic around tool execution without touching the harness itself: a pre-tool hook fires before execution and can allow, deny, or modify the call; a post-tool hook inspects results for auditing, logging, and observability. Hooks are how enterprises actually adopt harnesses, wrapping their own policy around someone else's agent.

**9. Permissions and safety.** The layer that separates a useful tool from a dangerous one. The harness defines permission modes (read-only, workspace, full access), each tool declares the minimum it requires, and the harness enforces that at dispatch time, before anything runs. For a tool like bash, the harness classifies commands dynamically: listing files stays read-only, deleting things requires full access, and the harness figures that out by parsing the command. On top of the static rules sit interactive approvals: the agent pauses and asks before doing anything destructive.

## Build one to understand one

The easiest way to internalize all nine components is to write a minimal harness yourself. Nothing fancy: a main loop that assembles the system prompt and iterates with a cap, simple compaction once history grows past a threshold, a registry that maps tool names to small records (name, permission, handler, description), three sub-agent archetypes (exploration, general, verification) with their own restricted tool lists, crash-safe JSONL session logging, dynamic prompt assembly from files on disk, pre- and post-tool hooks with allow/deny semantics, and dispatch-time permission checks with dynamic bash classification.

One design note that matters: the built-in primitives should use the standard library only. The moment your file-read tool depends on a framework, your harness inherits that framework's assumptions, and you've lost the thing that makes harnesses portable.

The video below walks through the full reference implementation line by line, which is hard to do justice in prose. If you want to see exactly how the pieces fit, that's the place to go.

## Where this fits

Once you've internalized what a harness is, the bigger question is how much it matters. The short answer: more than the model. I wrote a separate essay on [the research behind harness engineering](/writing/harness-engineering/), where two March 2026 papers quantify just how much of agent performance lives in this layer.

## Sources

- [Claude Code](https://www.anthropic.com/claude-code), the harness this architecture maps onto most directly
- [AGENTS.md](https://agents.md), the convention harnesses use for project instructions
- [Harness engineering: why agent performance now lives outside the model](/writing/harness-engineering/), the companion research essay on this site
