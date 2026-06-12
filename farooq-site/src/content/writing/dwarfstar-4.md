---
title: 'DwarfStar 4: a quasi-frontier model on your own machine'
description: 'Notes on antirez''s DwarfStar (DS4), a single-model inference engine that fits DeepSeek V4 Flash into 96 GB of RAM with an aggressively asymmetric 2/8-bit quantization recipe.'
date: 2026-06-11
tags: ['research notes', 'local ai']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>Salvatore Sanfilippo (antirez), the creator of Redis, built DwarfStar (DS4): a self-contained inference engine for exactly one model, DeepSeek V4 Flash, with Metal, CUDA, and ROCm backends.</li>
    <li>The trick is asymmetric quantization: the routed MoE experts drop to 2-bit while the shared experts, projections, and routing stay untouched. Antirez calls it a 2/8 bit recipe. 284B parameters fit in 96 GB of RAM.</li>
    <li>On a MacBook Pro M5 Max with 128 GB it generates at 25.90 tokens per second on a long prompt, and it speaks OpenAI- and Anthropic-compatible APIs, so it slots under existing harnesses.</li>
    <li>The limits: a 96 GB hardware floor, quality benchmarks still pending from the project itself, and a single-model engine is only as current as its model.</li>
  </ul>
</aside>

Salvatore Sanfilippo, who created Redis, has released an inference engine built for exactly one model. DwarfStar, still `ds4` on GitHub, runs DeepSeek V4 Flash on machines with 96 to 128 GB of memory, and Sanfilippo (antirez) writes that it is the first time he has used a local model for the serious work he would normally send to a frontier API. The repository stands at 13.5k stars, and the launch post drew 440 points and 190 comments on Hacker News.

This note covers what DS4 is, why a bespoke single-model engine beats a general-purpose runtime for this job, how the asymmetric quantization recipe works in plain terms, what it changes for local-first systems like the ones I build, and the limits.

## One model, one engine

Most local inference goes through general-purpose runtimes that try to run every model ever released. DwarfStar is the opposite, and the README is explicit about it: not a generic GGUF runner, not a wrapper around another runtime, but a self-contained engine that runs DeepSeek V4 Flash, plus DeepSeek V4 PRO on very high-memory machines, and nothing else.

The rationale is stated just as plainly. New models are released continuously, and attention immediately gets captured by the next model to implement. DS4 takes what the README calls a deliberately narrow bet: one model at a time. Every kernel, memory layout, and quantization decision gets to assume a single architecture. And because the scope is narrow, the engine can afford to be complete: an integrated coding agent, an OpenAI- and Anthropic-compatible server API, a disk-based KV cache, SSD streaming for machines with less RAM than the model, and distributed inference that splits transformer layers across machines.

The name tells the same story. The project launched as ds4, became DwarfStar 4 because, as antirez put it, you can put a lot of mass into a tiny space, and is now just DwarfStar. The dropped 4 matters: the README says the engine is optimized first for DeepSeek V4 Flash, and antirez writes that the model can change over time, with coding, legal, and medical variants imaginable later. The specialization is per model, not permanent.

## The asymmetric quantization recipe

DeepSeek V4 Flash is a mixture-of-experts model. DeepSeek's release notes give the shape: 284B total parameters, 13B active per token, a 1M context window, open weights. Those two parameter numbers are the whole opportunity. For any given token, the vast majority of the weight sits in routed experts the router did not pick.

The recipe quantizes only those routed experts, and aggressively: up and gate projections at IQ2_XXS, down projections at Q2_K, both 2-bit formats. Everything every token must pass through, meaning the shared experts, the projections, and the routing itself, is left untouched. Antirez sums it up as an extremely asymmetric quants recipe of 2/8 bit.

The bet is easy to state. A routed expert contributes only occasionally, so the damage from squeezing it to 2 bits is diluted across the many experts a long generation consults. The shared path has no such dilution; an error there touches every token. So the bits go where every token flows, and the savings come from the mass that mostly waits. That is how 284B parameters fit into 96 GB of RAM, or less with SSD streaming, where experts load from disk on cache misses.

<figure>
  <img src="/writing/dwarfstar-4/asymmetric-quantization.svg" alt="Asymmetric quantization in DwarfStar: a DeepSeek V4 Flash panel with a large grid of routed MoE experts and a small card for shared experts, projections, and routing; a green arrow sends the experts to 2-bit IQ2_XXS and Q2_K while the rest stays at 8-bit, landing in a dark machine block that fits 284B parameters in 96 GB of RAM, with MacBook Pro M5 Max speeds and Metal, CUDA, ROCm backends" width="1200" height="560" />
  <figcaption>The recipe: 2-bit for the routed experts, 8-bit for everything every token must pass through.</figcaption>
</figure>

## What it looks like in practice

The repo publishes its own benchmarks. On a MacBook Pro M5 Max with 128 GB, the q2 build prefills a short prompt at 87.25 tokens per second and generates at 34.27. With an 11,707-token prompt, prefill rises to 463.44 t/s and generation settles at 25.90. A Mac Studio M3 Ultra with 512 GB runs DeepSeek V4 PRO at q2: 138.82 t/s prefill and 9.56 t/s generation at 32,768 tokens. There are also 4-bit builds for 256 GB machines.

Metal is the primary target. CUDA is supported, including the DGX Spark, and ROCm covers AMD Strix Halo machines. The CPU path exists for diagnostics only. The license is MIT.

## What this means for local-first AI

Everything I build starts from the same premise: your documents and your voice should not have to leave your machine to be useful. The [localGPT pipeline](/writing/rag-beyond-similarity-search/) already runs end to end on local models, with small models doing the routine work and an 8B model holding the judgment seat for generation and verification. The bottleneck in that stack has always been the judgment seat. DS4 raises the ceiling on what can sit in it: a 284B-parameter mixture-of-experts model, on hardware a serious individual can own.

The integration story matters as much as the model. Because DS4 exposes OpenAI- and Anthropic-compatible endpoints, it can sit under an existing [agent harness](/writing/what-is-an-agent-harness/) without the harness knowing or caring that the model never left the room. The loops, tools, and verification we build around frontier APIs carry over unchanged. A local model behind a standard API is just a model.

## The honest limits

The hardware floor is real. 96 GB of unified memory is a high-end machine, not a typical laptop, and the PRO model wants 512 GB. SSD streaming lowers the floor, at the price of pulling experts from disk on cache misses.

The quality evidence is still mostly the project's own. The throughput numbers above are the repo's benchmarks, and antirez lists proper quality benchmarks as upcoming work. He was also still swapping in better 2-bit quants, built with an in-house iMatrix recipe, in the same breath as renaming the project. That is encouraging and also a sign the recipe is not settled. Two-bit experts are an aggressive compression, and the honest claim today is that the model handles antirez's serious work, not that it matches the hosted version of V4 Flash.

The specialization cuts both ways. A single-model engine is only as relevant as its model. When something clearly better than DeepSeek V4 Flash ships, a generic runtime will pick it up in days; a bespoke engine gets it when its author commits the weeks.

The takeaway fits in one sentence. Antirez says this is the first time local inference has handled his serious work, and for once the entire stack, weights and engine alike, is open enough for the rest of us to check.

## Sources

- [A few words on DS4](https://antirez.com/news/165), antirez, the launch retrospective
- [DwarfStar repository](https://github.com/antirez/ds4), antirez/ds4 on GitHub
- [DeepSeek-V4 preview release](https://api-docs.deepseek.com/news/news260424), DeepSeek API news, April 24, 2026
- [DeepSeek's release announcement](https://x.com/deepseek_ai/status/2047516922263285776) with the V4-Flash and V4-Pro parameter counts
- [Hacker News discussion](https://news.ycombinator.com/item?id=48142108) of the launch post
- [antirez on the DwarfStar name](https://x.com/antirez/status/2053797156155163108)
