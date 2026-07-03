---
title: 'How to evaluate an agent harness'
description: 'Harness configurations cluster at 74-76% resolve rate while cost varies fourteen times. A five-step method for judging harnesses on accuracy and cost.'
date: 2026-06-11
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>Resolve rate alone is a broken metric. On SWE-bench Verified, harness configurations clustered between 74% and 76% while compute varied fourteen times. Report accuracy and cost together.</li>
    <li>Evaluate a harness like any other system: fix the model, change one thing at a time, and rank configurations by cost per resolved task.</li>
    <li>Expect ablations to surprise you. Verifiers and multi-candidate search sound helpful and measurably hurt.</li>
    <li>A good harness transfers across models, and its assumptions expire. Re-run the evaluation on every model upgrade.</li>
  </ul>
</aside>

Say you're choosing between two agent harnesses. You run a benchmark, one scores 76%, the other scores 74%, and you pick the higher number. That's how most teams do it, and it's broken. The two papers that formalized harness engineering in March 2026 show why: across harness configurations, resolve rates barely move, while cost moves by an order of magnitude. So the question this post answers is simple: if the leaderboard number can't tell two harnesses apart, what can?

The answer is a method, not a metric. I'll walk through the five steps I would run on any harness, the benchmarks to run them on, and where those benchmarks fall short, with a checklist at the end. Along the way there are two results I want you to watch for: a pair of modules that everyone adds first and that turn out to hurt, and a set of assumptions that quietly expire under your feet. If you're new to this topic, the background lives in two earlier essays: [what a harness is](/writing/what-is-an-agent-harness/) and [the evidence that the harness now matters more than the model](/writing/harness-engineering/). Now let's start with why the number you're already using is only half of one.

## Why the leaderboard can't tell two harnesses apart

The clearest demonstration comes from the [Natural-Language Agent Harness paper](https://arxiv.org/abs/2603.25723) out of Tsinghua. On SWE-bench Verified with GPT-5.4 at maximum reasoning, every harness configuration they tested resolved between 74% and 76% of tasks. If all you read is the leaderboard, these systems are interchangeable.

They are not, and the gap is enormous once you look at what each one spent to get there. The full harness burned 16.3 million prompt tokens per sample, made 642 tool calls, and ran for 32 minutes. The stripped configuration used 1.2 million tokens, 51 calls, and finished in under 7 minutes. Same accuracy, fourteen times the compute.

<figure>
  <img src="/writing/evaluating-harnesses/accuracy-vs-cost.svg" alt="Grouped bar chart comparing a full and a stripped harness on SWE-bench Verified with GPT-5.4: resolve rates are equal in the 74 to 76 percent band, but the full harness uses 16.3 million prompt tokens per sample versus 1.2 million, 642 tool calls versus 51, and 32 minutes versus under 7" width="1200" height="650" />
  <figcaption>Two configurations from the NLAH paper. The accuracy row says they are twins. The cost rows say otherwise.</figcaption>
</figure>

Here's the shift that follows from this: when accuracy saturates, cost becomes the differentiator. So the first rule of harness evaluation is to never report a resolve rate without the cost next to it. And cost isn't one mysterious thing, it's three plain numbers you can log:

- prompt tokens per sample
- tool calls per sample
- wall-clock time per sample

With those four numbers per configuration, resolve rate plus the three cost numbers, you have the raw material. What you need next is a procedure for turning them into a decision.

## The five steps

**1. Fix the model, vary the harness.** Before you can measure anything, you need a controlled experiment, and until recently that was the hard part. Harness comparisons used to be impossible because systems differed in everything at once: prompts, tools, verification gates, and state semantics, all tangled together. The NLAH design untangles them. It separates an agent into a backend (the tools and infrastructure), a runtime charter (the universal execution rules), and the harness itself (the task-specific control logic). Hold two layers fixed, swap the third, and now a difference in the numbers means something. The payoff is real. When the Tsinghua team migrated OS-Symphony, a desktop automation harness, from native code into the NLAH representation with the same model and the same strategy, accuracy jumped from 30.4% to 47.2%, runtime fell from 361 minutes to 141, and LLM calls collapsed from 1,200 to 34. Without the separation, nobody could have attributed that gain to the representation. With it, you can now start asking which pieces of your harness are earning their keep.

**2. Ablate every module, and expect surprises.** That question has a mechanical answer: turn each module off, re-run, and record the delta on both accuracy and cost. This is the first open loop paying off, because the NLAH ablations show that intuition fails here:

- self-evolution: +4.8 points on SWE-bench Verified, +2.7 on OSWorld
- verifiers: -0.8 on SWE-bench Verified, -8.4 on OSWorld
- multi-candidate search: -2.4 on SWE-bench Verified, -5.6 on OSWorld

Verifiers and multi-candidate search are the two modules most people add first. Both measurably hurt. The only module that consistently helped was the one that narrowed the agent's attempt loop. So until you have ablated a module, you do not know its sign. One more rule for this step, from the [Meta-Harness paper](https://arxiv.org/abs/2603.28052): keep the raw execution traces. When the Stanford team removed traces from their optimization loop, accuracy dropped from 50% to 34.6%, and replacing them with summaries recovered nothing: 34.9%. The diagnostic signal lives in the full traces, and compression destroys it. The same applies to your own runs. If you only store scores, you can rank harnesses but never explain them, and explaining them is what the next step depends on.

**3. Measure cost per resolved task, not cost per run.** Now that you have accuracy and cost for every configuration, you need one axis to rank them on, and average cost per run is the wrong one because it hides failures. A cheap harness that fails often is not cheap. So divide total tokens, calls, and minutes by the number of resolved tasks, and the comparison collapses to a single honest axis. When resolve rates are equal, as in the NLAH cluster, the ranking matches raw cost: the stripped harness wins by fourteen times. When one harness resolves slightly more but spends far more, cost per resolved task makes the trade explicit instead of letting the bigger headline number win. Wall-clock belongs in this calculation too, because a 32-minute loop and a 7-minute loop are different products whatever the token price. At this point you have a winner, but only on one model, and that's a weaker result than it looks.

**4. Test transfer across models.** A harness tuned against one model is either a genuine architecture or a pile of workarounds for that model's quirks, and from the inside the two look identical. Transfer testing tells you which one you built. Meta-Harness, the Stanford system that optimizes harnesses automatically, gave the strongest evidence here: a harness optimized on one model transferred to five others and improved all of them. On Terminal-Bench 2 it scored 76.4%, ranking second with Opus and first with Haiku, which means a smaller model beat larger ones on harness quality alone. So run your winning harness with at least one other model before trusting it. If the gains vanish, you built workarounds. And even if they hold, you're not done, because the model underneath you won't hold still.

**5. Re-evaluate on every model upgrade.** This is the second open loop, the expiring assumptions. Every harness component encodes a guess about what the model cannot do alone, and those guesses have a shelf life. When Opus 4.6 stopped needing context resets, Anthropic dropped them entirely. Manus rewrote their harness five times in six months. Vercel removed 80% of an agent's tools and got better results. So treat your evaluation as a snapshot of one model generation, nothing more. Re-run the full suite when the model changes, and treat "what can we now delete" as a first-class question, because the modules that earned their cost last quarter may be pure overhead today. That's the method. The remaining question is where to run it.

## Where to run it, and where the benchmarks fall short

Three benchmarks dominate harness evaluation right now, and each measures a different surface.

- **SWE-bench Verified.** Real GitHub issues with human-validated fixes. With frontier models it is saturating on accuracy: the 74-76% cluster means it can barely rank harnesses by resolve rate anymore. It remains useful for exactly the dimension its leaderboard ignores, cost.
- **OSWorld.** Desktop and GUI automation. Scores are lower and the headroom is real: the OS-Symphony migration moved it from 30.4% to 47.2%. It is also more sensitive to harness mistakes. Verifiers cost 8.4 points there against 0.8 on SWE-bench Verified. If your harness has a weak module, OSWorld finds it first.
- **Terminal-Bench 2.** Command-line agent tasks, and the leaderboard where harness differences show most clearly, because entries running the same models compete largely on their harnesses. It is where Meta-Harness reached 76.4%.

The shared limit brings us back to where we started: none of them reports cost as a first-class metric. Resolve rate is the leaderboard; tokens, calls, and minutes you have to instrument yourself. Until that changes, public rankings will keep calling a 16-million-token harness and a 1-million-token harness equivalent, which means the method above is something you have to run, not something you can look up. Here it is in one place.

## The checklist

- Fix the model. Change one harness variable at a time.
- Report four numbers per configuration: resolve rate, prompt tokens per sample, tool calls per sample, wall-clock per sample.
- Rank configurations by cost per resolved task.
- Ablate every module, including the obviously helpful ones. Expect at least one sign flip.
- Keep raw execution traces. Summaries destroy the diagnostic signal.
- Run the winner on at least one other model. Gains that do not transfer are workarounds.
- Re-run everything on every model upgrade, and delete the modules that stopped earning their cost.

## Sources

- [Natural-Language Agent Harnesses](https://arxiv.org/abs/2603.25723), Pan et al., Tsinghua University, March 2026
- [Meta-Harness: End-to-End Optimization of Model Harnesses](https://arxiv.org/abs/2603.28052), Lee, Nair, Zhang, Lee, Khattab, and Finn, March 2026
- [Harness engineering: why agent performance now lives outside the model](/writing/harness-engineering/), the companion research essay on this site
- [What is an agent harness? The nine components of a great one](/writing/what-is-an-agent-harness/), the primer on this site
