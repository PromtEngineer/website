---
title: 'DwarfStar 4: how a 284B model runs on a MacBook'
description: 'A 284B parameter model needs 568 GB stored normally. DwarfStar runs it on 128 GB machines at usable speeds. The quantization recipe, SSD streaming, and the numbers.'
date: 2026-06-11
tags: ['research notes', 'local ai']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>DwarfStar (ds4), by Redis creator Salvatore Sanfilippo, runs DeepSeek V4 Flash, 284B parameters, on a 128 GB MacBook Pro or NVIDIA DGX Spark at usable speeds.</li>
    <li>The recipe: quantize the routed experts to roughly 2 bits, leave everything load-bearing at 8. Calibrate with an importance matrix, then validate token by token against the official API.</li>
    <li>SSD streaming changes the mental model: RAM stops being a wall that a model fits inside or does not, and becomes a dial that trades memory for speed.</li>
    <li>This is the strongest local-first result so far: quasi-frontier intelligence with no API keys, no rate limits, and your data staying on your desk.</li>
  </ul>
</aside>

Say you own a maxed-out MacBook Pro. That's 128 GB of unified memory, the most Apple will sell you in a laptop. NVIDIA's DGX Spark, a small box that sits on a desk, has the same. Now you want to run DeepSeek V4 Flash, one of the most capable open-weight models released, and you do the arithmetic: 284 billion parameters, stored the normal way, is 568 GB of memory. That's more than four times what your machine has. It should not fit. And yet it runs on both machines, at real, usable speeds. How? That question is the whole post, and the answer is some of the most interesting systems engineering I have seen this year. It comes in two parts: a quantization trick that gets the model into 128 GB without ruining it, and a second trick that makes even that number negotiable. We'll get to both.

The project is DwarfStar, still `ds4` [on GitHub](https://github.com/antirez/ds4), by Salvatore Sanfilippo (antirez), the creator of Redis. He [writes](https://antirez.com/news/165) that it is the first time he has used a local model for the serious work he would normally send to a frontier API. The repo sits at 13.5k stars and the launch post drew 440 points on Hacker News. So the claim has weight behind it. But before the tricks make sense, you need to feel the problem they're solving.

## The RAM cliff

Local inference has a brutal property: it is binary. Store 284 billion parameters as 16-bit numbers and you need 568 GB for the weights alone. Cut every weight to 8 bits and you are still at 284 GB, more than double what a 128 GB machine has. And there is no partial credit. Either the model fits in memory or it does not run at all. There is no "runs a bit slower." I think of it as the RAM cliff: small models stand safely on top, and the models actually worth running fall straight off the edge into API-only territory.

Of course, there's a standard escape hatch, and you've probably used it: quantization, which just means storing each weight with fewer bits. At 4 bits, models hold up surprisingly well. The problem is that 4 bits is not enough here. To get 284B parameters under 128 GB, you need to push toward 2 bits, which leaves exactly four representable levels per weight. Historically that is where quality falls off a cliff of its own: important weights get snapped to wrong values, the error feeds the next layer, and 43 layers later a small rounding error has compounded into a different, worse model. So naive 2-bit quantization saves the memory and throws away the intelligence, and it looks like a dead end.

Unless you don't quantize everything.

## Quantize the furniture, not the walls

To see why "not everything" is even an option, you have to look at what this model is made of. DeepSeek V4 Flash is a mixture-of-experts model. Inside each of its 43 layers, a router chooses among 256 experts, small feed-forward networks, and only a handful fire per token, plus one shared expert that every token passes through. Add it up and the model is 284B parameters total but only about 13B active per token. The model is huge; per token, it is small.

That anatomy is what makes the trick possible. Think of the model as a building. Attention, the routers, the shared experts, the output head: those are the load-bearing walls. Every token flows through them, so damage there propagates everywhere. The routed experts are the furniture: they are most of the building by mass, but each token only ever touches a few pieces.

<figure>
  <img src="/writing/dwarfstar-4/asymmetric-quantization.svg" alt="Diagram of DwarfStar's asymmetric quantization: DeepSeek V4 Flash's routed mixture-of-experts weights, most of the mass and mostly idle, are quantized to 2-bit, while shared experts, projections, and routing stay at 8-bit, fitting 284B parameters into 96 GB of RAM on consumer hardware" width="1200" height="560" />
  <figcaption>Most of the mass goes to 2-bit. Everything every token touches stays precise.</figcaption>
</figure>

So you crush the furniture and protect the walls. The recipe, straight from the repo: routed experts get squeezed to roughly 2 bits (IQ2_XXS for up and gate projections, Q2_K for down), and everything load-bearing stays at 8 bits, effectively untouched. Why does this survive when naive 2-bit doesn't? Two reasons. With 256 experts per layer there is redundancy. And any single token meets only a few quantized experts, sandwiched between high-precision layers, so the error never gets the chance to compound the way it does in a dense model. The result: the model drops from 568 GB to about 81, under the 128 GB of a MacBook Pro. The thing that could not fit, fits. As the README puts it, these 2-bit quants are not a joke.

That's a bold claim, though. "It fits" is easy to verify. "It's still smart" is not, and that's where most quantization stories quietly end.

## Quantize with your eyes open, then prove it

This one doesn't end there, because there is a second layer to the trick: the difference between guessing and measuring. Before quantizing, the project runs the model over a calibration corpus of about 4,700 real prompts, roughly 2.9 million tokens of code review, contest math, long documents, and agent tool calls, and records which weight columns actually carry signal. The quantizer then protects the heavily used columns and lets the rarely used ones absorb the error. The detail I like most: the calibration set includes tool-calling prompts in DeepSeek's own format. So the quantization is tuned for agentic work, exactly where cheap quants usually fall apart first.

Then comes the part most quantization projects skip: proof. DwarfStar validates against continuation vectors captured from the official DeepSeek API, measuring token by token how much probability the local 2-bit model assigns to the exact tokens the full model produces. If the quant were damaged, the curves would split. They track. On top of that sits a built-in 92-question evaluation gate, 25 GPQA Diamond, 25 audited SuperGPQA, 25 AIME 2025, and 17 security code review items, run as the engine evolves. "The model survived" is a measured claim here, not a vibe. So the first half of our question is answered: the model fits in 128 GB and stays itself. Which leaves the second trick I promised, the one for when you don't have 128 GB.

## The cliff becomes a dial

All of that assumes 128 GB. What if you have 64? The old answer is the cliff again: 81 into 64 does not go. DwarfStar's answer is SSD streaming, and it is my favorite part of the system.

In streaming mode, the load-bearing weights stay permanently resident in RAM, because every token needs them. Next to them, the engine carves out a pinned cache of slots, each holding one complete expert. The full set of experts, all eleven thousand or so across 43 layers, stays on the SSD inside the model file. When the router picks experts that are already cached, that is a hit: fast path, no disk. When one is missing, the engine reads that single expert off the SSD, drops it into a slot, and evicts whichever expert has been cold the longest. And expert usage follows a power law, some experts are simply popular, so a profiled hotlist preloads the popular ones at startup and the cache starts warm.

<figure>
  <img src="/writing/dwarfstar-4/ram-cliff-to-dial.svg" alt="Two panels: before, a cliff where a model either fits in RAM and runs or does not fit and does not run at all; after, with SSD streaming, a smooth curve where 128 GB runs at full speed, 96 GB slightly slower, and 64 GB slower still, but the model always runs" width="1200" height="560" />
  <figcaption>SSD streaming replaces the fits-or-nothing cliff with a speed dial.</figcaption>
</figure>

Remember the cliff, where a model either fits or does not run at all? This is where it dies. RAM stops being a hard cutoff and becomes a continuous spectrum of speed levels: 128 GB runs everything resident at full speed, 96 GB runs a big cache slightly slower, 64 GB runs a smaller cache with more misses, slower still, but it always runs. The question is no longer "can I run this model?" It is "how fast?" Your laptop's SSD just joined the memory hierarchy for AI. And once the weights are handled, there's one more memory hog waiting.

## Your conversation is a file

Weights are only half the memory story. The other half is the KV cache, the model's working memory of your session, which on a classic architecture can outgrow the model itself at long context. DeepSeek V4's layered attention design keeps the most recent 128 tokens raw at full resolution and compresses older history along time, alternating by layer between pooling four tokens into one (with an indexer that attends to the most relevant 512 rows) and compressing 128 into one. A million tokens of context lands around 26 GB: big, but something a laptop can hold.

Because the cache is compact, DwarfStar treats it as a first-class disk citizen. Sessions are saved as checkpoint files and resume with zero re-processing of the prompt. A two-hour coding session with a 284B model is a file you can come back to tomorrow. So one machine handles the weights, the streaming, and the session. Which raises the obvious next question: what happens with two machines?

## Two MacBooks, one model

DwarfStar also does distributed inference. Connect two MacBooks with a Thunderbolt 5 cable (0.45 ms ping), split the model by layers, and prompt processing becomes an assembly line: while machine B chews on chunk one, machine A is already on chunk two. The pipeline pays off on prefill: 1.38x at 9k tokens, 1.66x at 28k, 1.85x at 64k. Generation is the honest footnote: one token at a time collapses the pipeline into ping-pong across the cable, about 19% slower. So this trick is for fitting bigger models and processing long prompts faster, not for faster typing.

The payoff at the top end: two Mac Studios run DeepSeek V4 PRO, the full 1.6 trillion parameter model, at around 11.5 tokens per second. And a single 512 GB Mac Studio runs the PRO 2-bit build at 9.6 tokens per second with 32k context. Frontier-scale weights, on a desk. Which brings us back to the machine we started with: how fast is it, really?

## The scoreboard

From the repo's published benchmarks for the 2-bit Flash build, long prompts: an M3 Max MacBook generates around 21.5 tokens per second, an M5 Max around 25.9, an M3 Ultra Studio 27.4, and the DGX Spark 13.8. Prefill is where these machines fly: 250 to 468 tokens per second. Readable speeds, for a model this size, on hardware you own. So the model that should not fit does fit, and runs at speeds you can work with. What does that add up to?

## Why this matters

Three things stand out beyond the single project. First, it shows what you get when one team owns the whole stack, the engine, the quantization, the validation, even the coding agent, and tunes them for each other instead of trying to be maximally general. That is the same lesson the [harness world](/writing/what-is-an-agent-harness/) keeps teaching: the integration is the product. Second, the cliff-to-dial reframing quietly changes what "consumer hardware" means for AI, because the SSD is now part of the memory hierarchy. And third, this is quasi-frontier intelligence running fully local: no API keys, no rate limits, your data never leaves the machine. That is the bet I have been making since [localGPT](/writing/rag-beyond-similarity-search/), and DwarfStar is the strongest evidence yet that the bet is right.

## Sources

- [DwarfStar (ds4) on GitHub](https://github.com/antirez/ds4), the engine, benchmarks, and validation suite
- [A few words on DS4](https://antirez.com/news/165), antirez's launch post
- [DeepSeek V4 announcement](https://api-docs.deepseek.com/news/news260424), Flash: 284B total, 13B active, 1M context, open weights
- [Hacker News discussion](https://news.ycombinator.com/item?id=48142108)
- [What is an agent harness?](/writing/what-is-an-agent-harness/) and [RAG beyond similarity search](/writing/rag-beyond-similarity-search/), companion essays on this site
