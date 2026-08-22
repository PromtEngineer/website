---
title: 'Compaction is the hardest problem in agent engineering'
description: 'Why agent harnesses summarize old history, what a careless summary destroys, the failure modes that follow, and the patterns that make compaction safe.'
date: 2026-06-11
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>Compaction is the summarize-and-prune step that fires when a session nears its context budget. Recent turns stay verbatim; older turns become one synthetic summary.</li>
    <li>A naive summarize-everything pass destroys exactly what the agent needs next: file paths, error strings, tool arguments, and the reasons behind decisions.</li>
    <li>The patterns that work: keep the recent tail untouched, stage the summarization, flush critical state to files before summarizing, and keep durable state outside the transcript entirely.</li>
    <li>Compaction logic encodes assumptions about model limits, and those assumptions expire. As long-context handling improves, this code gets deleted, not refined.</li>
  </ul>
</aside>

Compaction is the step where an agent harness summarizes older conversation history to make room for new work. Every long session needs it, because the transcript grows each turn and the context window does not, so at some point something has to give. Done badly, it quietly ruins the session: an agent that worked well for an hour starts re-reading files it already read and proposing approaches it already rejected. In [my post on harness anatomy](/writing/what-is-an-agent-harness/) I flagged compaction with a one-line warning. This post is the full version of that warning.

I covered the whole context system in [a companion essay on agent context management](/writing/agent-context-management/): file read caps, tool result handling, paging, the virtual memory framing. In this post I want to stay on one step of that system, the summarize-and-prune move itself: why it exists, when it fires, what a careless pass destroys, and the patterns that make it safe.

## Why the window fills

During a real task the window holds more than the conversation:

- fixed context: the system prompt, tool definitions, instruction files, skills
- conversation history, growing every turn
- file contents, where a single read can run tens of thousands of tokens
- tool results: grep output, bash output, search results, each call appending another object
- sub-agent reports, memory state, and the artifacts of previous compactions

All of it competes with the one budget you cannot touch: room for the model to answer. Claude Code's budget was around 200,000 tokens, now up to a million with Opus. A bigger window delays the problem, but it doesn't remove it. Any session that runs long enough arrives at the same wall, and the harness has to decide what to do when it gets there.

## The trigger

The harness doesn't wait for a hard failure. It watches usage, and when it crosses a threshold near the budget, compaction fires.

The numbers vary, the shape doesn't. Anthropic's API ships compaction as a built-in feature with a default trigger of 150,000 input tokens. Letta warns before the window is full, evicts older messages with a sliding window, and falls back to stronger truncation if summarization itself overflows. Claude Code triggers when usage gets close to its limit and lets you fire early by hand.

What happens when it fires is LLM-powered summarization. The harness takes the older portion of the transcript, sends it to a model with a structured prompt, and gets back one synthetic message. Reduced to its floor, compaction is trading a pile of exact records for a paragraph of prose. Anthropic's default compaction prompt asks the model to write down "anything that would be helpful, including the state, next steps, learnings." The conversation is then rebuilt: summary first, recent turns after it, and the session continues. The summary is lossy, though, and the losses fall in a specific place.

## What a naive summary destroys

The obvious implementation is a single pass: summarize everything, swap it in, move on. This is the version that ruins sessions, and it's worth being precise about why.

A summary preserves narrative. It destroys specifics. And an agent mid-task runs on specifics:

- precise file paths, the difference between `config.py` and `config/settings.py`
- exact error strings, which the agent must recognize when the bug resurfaces
- tool arguments that worked: flags, offsets, query strings
- decisions and their reasons: what was tried, what failed, and why an approach was rejected

The last item is the most damaging. The decision usually survives summarization. The reason rarely does. "We chose approach B" compresses fine, but the three failed attempts that justified it disappear, and with them the agent's defense against trying approach A again.

You don't have to take this on intuition. In the Meta-Harness work I covered in [the harness engineering essay](/writing/harness-engineering/), an optimizer reading raw execution traces hit 50% accuracy. Replacing the traces with summaries dropped it to 34.9%, barely better than no traces at all. The signal lives in the exact text, and a summary is exact about nothing.

## How a session fails afterward

Nothing crashes after a bad compaction. The session keeps going and degrades in recognizable ways:

- **The agent repeats work.** It re-reads files and re-runs searches, because the results now exist only as "explored the codebase."
- **It contradicts earlier decisions.** The conclusion survived, the reasoning did not, so the agent re-litigates a settled question and picks the option it already rejected.
- **It loses the thread.** The goal got paraphrased one too many times, and the agent starts solving an adjacent problem.
- **It declares done too early.** The summary says tests were written. It does not say two of them are failing. A later turn reads partial progress as completion and stops.

The fourth failure is the premature completion problem Anthropic hit in its own agent work. Bad compaction manufactures the conditions for it.

## The patterns that work

Look at how production harnesses handle this (Claude Code, OpenClaw, Letta, Pi) and four patterns repeat.

<figure>
  <img src="/writing/compaction/compaction-pipeline.svg" alt="Pipeline diagram: a transcript bar grows toward a dashed context budget line and compaction fires near the threshold; step one flushes critical state like paths and decisions to files on disk, step two summarizes older turns into one synthetic message, step three keeps recent turns verbatim; the rebuilt context is a summary plus the recent tail with reclaimed headroom under the budget, while flushed files survive outside the transcript" width="1200" height="660" />
  <figcaption>The compaction pipeline: flush first, summarize the old, keep the recent tail exact.</figcaption>
</figure>

**Keep recent turns verbatim.** The near past is where the model's current state lives, so never summarize the active working set. Pi keeps the recent tail in full and summarizes only the older transcript. Letta's default sliding window summarizes about 30% of messages and keeps 70% untouched. Anthropic's API supports the same shape: pause after the summary, re-append the last few messages exactly, then continue. Touch the tail last, or never.

**Stage the summarization.** Not all tokens deserve equal treatment, so don't run one lossy pass over everything. Anthropic calls tool result clearing the safest, lightest-touch form of compaction: a raw grep result from forty turns ago can go long before any conversation text gets rewritten. OpenClaw stages its summarization and prunes tool results in memory without destroying the persistent conversation log. The transcript on disk stays complete. Only the model's view shrinks.

**Flush before you summarize.** If a summary is going to lose specifics, get the specifics out of its reach first. OpenClaw's pre-compaction flush gives the agent a chance to write important state to files before history disappears: the plan, key decisions, open problems, exact paths and commands. Anything on disk no longer depends on surviving the summary. Claude Code attacks the same gap from the other side: after compaction it restores the five most recently accessed files, so exact file contents reenter the window from disk rather than from a paraphrase.

**Keep durable state outside the transcript.** The strongest version of the flush is never keeping critical state in the conversation in the first place. A plan file, a notes file, a decision log: state on disk is safe by construction, because compaction only touches the transcript. Sub-agents are the same idea applied to whole workstreams. Delegate exploration to [an isolated sub-agent](/writing/sub-agents/) that returns a short report, and the thousand-line search never enters the parent's window at all. The best compaction is the one that fires later because the transcript stayed small.

## This code gets deleted, not refined

Every harness component encodes an assumption about what the model cannot do alone, and [those assumptions expire](/writing/harness-engineering/). Compaction encodes two: windows are small, and models lose the plot over long contexts. Both are weakening. Claude Code's budget went from roughly 200,000 tokens to a million with Opus. When Opus 4.6 stopped needing context resets, Anthropic deleted them from its harness.

That's the trajectory for compaction logic too. Not refinement into something baroque, but deletion on schedule, as bigger windows and better long-context behavior make each stage unnecessary. The elaborate summarization machinery will be the first thing to go.

The flush and the external state will outlive it. Writing decisions, plans, and exact paths to durable files isn't a workaround for a small window. It makes sessions resumable, auditable, and safe to interrupt, whatever the window size. So build compaction as if you will delete it next year, and put everything you cannot afford to lose somewhere compaction cannot reach.

## Sources

- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), Anthropic, on compaction, tool result clearing, and Claude Code's summarize-then-restore behavior
- [Context compaction](https://platform.claude.com/docs/en/build-with-claude/compaction), Claude API docs: trigger thresholds, the default summarization prompt, and preserving recent messages
- [Compaction](https://docs.letta.com/guides/core-concepts/messages/compaction/), Letta docs, on sliding window strategies and their defaults
- [Agent context management](/writing/agent-context-management/), the companion essay on the full context system
- [What is an agent harness?](/writing/what-is-an-agent-harness/) and [Harness engineering](/writing/harness-engineering/), the related essays on this site
