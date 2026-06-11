---
title: 'Harness engineering: why agent performance now lives outside the model'
description: 'Same model, same benchmark, six times the performance difference. Two March 2026 papers show the code around the model now matters more than the model. Here is what they found.'
date: 2026-06-10
video: 'Xxuxg8PcBvc'
videoLength: '11 min'
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>An agent is a model plus a harness: the orchestration code, prompts, tools, memory, and verification around the weights. The harness now drives more performance variation than the model.</li>
    <li>Tsinghua's Natural-Language Agent Harness makes that logic explicit and ablatable. Rewriting one harness from code into natural language moved a benchmark 16.8 points with the same model and strategy.</li>
    <li>Stanford's Meta-Harness optimizes the harness automatically. Its top configuration put a smaller model above a larger one, and a harness tuned on one model transferred gains to five others.</li>
    <li>The recurring lesson is subtraction: most added structure hurt. The only module that consistently helped was the one that narrowed the agent's attempt loop.</li>
  </ul>
</aside>

Same model. Same benchmark. Six times the performance difference.

Stanford researchers found that the orchestration code wrapping a language model now drives more performance variation than the model itself. LangChain saw the same thing in practice: by modifying only harness infrastructure, their coding agent jumped from outside the top 30 to rank five on Terminal-Bench 2. And in March 2026, two papers formalized the discipline from complementary directions: [Natural-Language Agent Harnesses](https://arxiv.org/abs/2603.25723) from Tsinghua and [Meta-Harness](https://arxiv.org/abs/2603.28052) from Stanford.

What they found redefines what we should actually be optimizing when we build agents.

## An agent is a model plus a harness

LangChain frames it with the sharpest line in the field: if you're not the model, you're the harness.

The operating system analogy captures what that means. A raw LLM is a CPU: powerful but inert. No RAM, no disk, no IO. The context window acts as RAM, fast but limited. External databases serve as disk. Tool integrations are device drivers. The harness is the operating system, coordinating what the CPU sees and when.

<figure>
  <img src="/writing/harness-engineering/agent-anatomy.svg" alt="Diagram showing an agent as a small model core surrounded by a larger harness layer containing system prompts, tools, orchestration, memory, verification, and guardrails, mapped to an operating system analogy" width="1200" height="660" />
  <figcaption>The anatomy of an agent. The weights are the smallest part of the system.</figcaption>
</figure>

Concretely, the harness is everything that isn't model weights: system prompts, tool definitions, orchestration logic, memory management, verification loops, safety guardrails. Anthropic identified [five canonical patterns](https://www.anthropic.com/research/building-effective-agents) for it: prompt chaining, routing, parallelization, orchestrator-workers, and evaluator-optimizer loops. Each is a different strategy for when and how the model gets called, and every production agent combines them.

Those architectural choices, not the model underneath, drive the six-times performance gaps.

## The messy state of the art

If harnesses matter this much, how are people building them? Messily.

Harness logic today is scattered across controller code, framework defaults, and verifier scripts. The Tsinghua authors note that two systems which nominally differed by one design choice actually differed in prompts, tools, verification gates, and state semantics simultaneously. Nobody could run a controlled experiment.

Anthropic's own evolution exposes the pattern. Naive harnesses suffer two failure modes: one-shotting, where the agent tries everything at once and exhausts its context, and premature completion, where a later session sees partial progress and declares victory. Their fix evolved into a three-agent, GAN-inspired architecture: a planner, a generator, and an evaluator that clicks through the running app like a real user. It was twenty times more expensive, roughly $200 per run instead of $9. But the core thing worked instead of being broken.

OpenAI converged independently. One internal effort produced a million lines of application logic, tests, CI, and tooling in five months with zero lines written by hand. Their discovery was that the engineering team's primary job became enabling agents to do useful work. Productive, but ad hoc, non-portable, and impossible to ablate.

Standards did emerge. [AGENTS.md](https://agents.md) reached 60,000 repositories. Anthropic's agent skills added reusable procedures. But both package components, conventions, and snippets, not the full harness itself. The field needed harness logic made explicit and executable.

## Writing the harness in natural language

What if you could write an agent's entire control logic, not in Python, not in YAML, but in structured natural language?

The [Tsinghua team](https://arxiv.org/abs/2603.25723) builds exactly this. Their Natural-Language Agent Harness (NLAH) separates an agent into three layers: the backend (infrastructure and tools), a runtime charter (the universal physics: how contracts bind, how state persists, how child agents are managed), and the NLAH itself (task-specific control logic: contracts, roles, state structure, failure taxonomies).

Why does the separation matter? It gives harness engineering something it never had: controlled experiments. Swap the NLAH while fixing the charter and you're testing harness design. Fix the NLAH while swapping the charter and you're testing runtime policy. Clean ablation, at last.

Two mechanisms underpin it. Execution contracts turn fuzzy LLM completions into bounded agent calls with five elements: required inputs, budgets, permissions, completion conditions, and output paths. Think function signatures for agents. And file-backed state externalizes memory to path-addressable files that survive truncation, restarts, and delegation.

Does all this structure actually help? Here the results get uncomfortable. On SWE-bench Verified with GPT-5.4 at maximum reasoning, resolve rates clustered between 74% and 76% regardless of configuration. But the full harness burned 16.3 million prompt tokens per sample across 642 tool calls and 32 minutes. Stripped down: 1.2 million tokens, 51 calls, under 7 minutes. Same destination, fourteen times the compute.

Then the module-by-module ablation found something stranger.

<figure>
  <img src="/writing/harness-engineering/ablation.svg" alt="Diverging bar chart of harness module ablations on SWE-bench Verified and OSWorld: self-evolution helps by 4.8 and 2.7 points, verifiers hurt by 0.8 and 8.4 points, multi-candidate search hurts by 2.4 and 5.6 points" width="1200" height="620" />
  <figcaption>Module ablations from the NLAH paper. More structure is not always better.</figcaption>
</figure>

Self-evolution was the only consistently helpful module: plus 4.8 points on SWE-bench Verified and plus 2.7 on OSWorld, via an acceptance-gated attempt loop that stays narrow until failure signals justify broadening. Verifiers actively hurt: minus 0.8 and minus 8.4. Multi-candidate search: minus 2.4 and minus 5.6.

The headline finding came from a different experiment. The researchers took OS-Symphony, a native code harness for desktop automation, and migrated its logic into NLAH representation. Same strategy, same model, different representation. Performance jumped from 30.4% to 47.2%. Runtime dropped from 361 minutes to 141. LLM calls collapsed from 1,200 to 34. The representation itself drove the gain, replacing brittle GUI repair loops with durable runtime state and artifact-backed completion.

Two patterns crystallized from the full results. Roughly 90% of all compute flows through delegated child agents, not the parent: the harness is an orchestration pattern, not a reasoning pattern. It decomposes, delegates, and verifies. And the only module that consistently helps is the one that narrows the agent's own attempt loop. Disciplined narrowing beats expensive broadening, every time.

## Optimizing the harness automatically

If representation alone can move a benchmark 16.8 points, can we find the right harness automatically?

[Meta-Harness](https://arxiv.org/abs/2603.28052), from a Stanford team including Omar Khattab, the creator of DSPy, treats the harness as an optimization target. DSPy tunes prompts within a fixed pipeline. Meta-Harness rewrites the pipeline itself: structure, retrieval, memory, orchestration topology.

The loop works like this. An agentic proposer (Claude Code running Opus 4.6) reads the failed execution traces of prior candidates, diagnoses what broke, and writes a complete new harness. Scores and raw traces accumulate in a growing file system. An evaluator tests each proposal. Repeat.

The scale is striking: about 10 million tokens per iteration, 400 times more feedback than prior text-optimization methods, 82 files read per round. And those traces are irreplaceable. Remove them and accuracy drops from 50% to 34.6%. Replace them with summaries: 34.9%. The signal lives in the raw details.

The results change the calculus of model choice. On Terminal-Bench 2, Meta-Harness scored 76.4%, the only automatically optimized system in a field of hand-engineered entries. It reached rank two with Opus and rank one with Haiku: a smaller model outranking larger ones through harness optimization alone. On a 215-class text classification task it hit 48.6% accuracy, 7.7 points above the prior state of the art, using four times fewer tokens. And a harness optimized on one model transferred to five others, improving all of them.

The reusable asset isn't the model. It's the harness.

## Constraints and safety complete the picture

Two more systems round out the moment. DeepMind's AutoHarness compiles game rules into code harnesses, eliminating 100% of illegal moves across 145 games; one variant replaces the LLM entirely and runs the decision policy as pure code. And AgentSpec provides safety constraints as a domain-specific language, preventing over 90% of unsafe executions in evaluation.

Four systems, four facets of the same discipline: representation, optimization, constraints, safety.

## Three eras, and a craft of subtraction

Prompt engineering. Context engineering. Harness engineering. Three eras in four years, each one swallowing the last. Harness engineering absorbs the prior two and adds what the model can't do on its own: orchestration, memory, verification, safety.

<figure>
  <img src="/writing/harness-engineering/three-eras.svg" alt="Nested diagram showing prompt engineering inside context engineering inside harness engineering, labeled with the capability each era adds" width="1200" height="480" />
  <figcaption>Each era absorbs the one before it.</figcaption>
</figure>

In practice the discipline takes on an odd shape. Anthropic named the dynamic: every harness component encodes an assumption about what the model can't do alone, and those assumptions expire. When Opus 4.6 stopped needing context resets, Anthropic dropped them entirely. Manus rewrote their harness five times in six months. Vercel removed 80% of an agent's tools and got better results.

The harness space doesn't shrink as models improve. It moves. Which is why mature harness work looks less like building structure up and more like pruning it down: a craft of subtraction as much as addition.

## If you build agents, you are a harness engineer

The practical takeaway is unambiguous. Investing in your harness yields larger, faster, and more reliable gains than waiting for the next model upgrade. It's no longer a question of which model to pick. It's a question of which structure to remove.

Open problems remain. Portable harness logic lowers the barrier to spreading risky workflows: prompt injection buried in harness text, malicious tools grafted into shared artifacts. One audit found that one in four community-contributed agent skills contains a vulnerability. And the most consequential open question: can harness and model weights be co-evolved, letting strategy shape what the model learns and the model reshape the strategy that wraps it?

The field is moving from artisanal construction to systematic science. What sits between a language model and useful work has always mattered. We're finally learning how to engineer it.

## Sources

- [Natural-Language Agent Harnesses](https://arxiv.org/abs/2603.25723), Pan et al., Tsinghua University, March 2026
- [Meta-Harness: End-to-End Optimization of Model Harnesses](https://arxiv.org/abs/2603.28052), Lee, Nair, Zhang, Lee, Khattab, and Finn, March 2026 ([code](https://github.com/stanford-iris-lab/meta-harness))
- [Building effective agents](https://www.anthropic.com/research/building-effective-agents), Anthropic
- [AGENTS.md](https://agents.md), the emerging convention for agent-readable project instructions
