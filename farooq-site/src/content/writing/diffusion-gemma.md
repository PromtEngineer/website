---
title: 'DiffusionGemma: what Google''s open text diffusion model actually changes'
description: 'Notes on DiffusionGemma, Google''s first open-weight text diffusion model: how block diffusion refines a 256-token canvas in parallel, the official speed and benchmark numbers, and what it takes to run locally.'
date: 2026-06-11
video: 'I2-_3ieJelE'
videoLength: '13 min'
tags: ['research notes', 'models']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>DiffusionGemma is Google's first open-weight text diffusion language model: a 26B mixture-of-experts with 3.8B active parameters, released under Apache 2.0.</li>
    <li>Instead of one token per forward pass, it refines a 256-token canvas in parallel, locking the lowest-entropy positions each step and throwing the rest back into noise.</li>
    <li>The payoff is speed: 1,000+ tokens per second on a single H100 and 700+ on an RTX 5090, up to 4x faster generation. The cost is quality: it trails Gemma 4 26B A4B on every reported benchmark.</li>
    <li>Quantized, it fits in about 18 GB of VRAM. I ran a 4-bit version on an M2 Max and got usable speeds, but treat it as experimental, not state of the art.</li>
  </ul>
</aside>

Google released DiffusionGemma this week: its first open-weight text diffusion language model, a 26B mixture-of-experts with 3.8 billion active parameters under Apache 2.0. Google demoed text diffusion a year earlier with Gemini Diffusion, but that stayed a waitlisted demo and the weights never shipped. This one you can download and run on your own machine, which is exactly what I did.

This note covers how diffusion generation differs from autoregressive decoding, what happens inside a single denoising step, the speed and quality trade-off in the official numbers, and what I learned running it locally on Apple silicon.

## One token at a time, no going back

Autoregressive models produce one token per forward pass. Every new token requires a pass over everything generated so far, so a 400-token answer takes 400 passes. And once a token is generated, that is it. The model cannot go back and fix an early mistake; it can only keep going and try to route around it.

Google has been shipping open-weight Gemma models since February 2024, and every one of them has been autoregressive, including the Gemma 4 family from March 2026. Gemma 4's multi-token prediction drafters attack the speed problem with speculative decoding, up to a 3x speedup, but the order stays left to right and committed tokens stay committed.

## Diffusion flips the process

DiffusionGemma works the way image generators do. It starts from a canvas of placeholder noise and refines the whole thing in parallel, pass after pass. The full answer exists immediately as a rough draft, then sharpens everywhere at once. If a token from an early pass turns out to be wrong, a later pass can fix it.

Watching it run is the fastest way to build intuition. In a demo on my laptop, the model visibly went back and corrected earlier guesses as it refined, and the answer settled in about 24 steps, every position generated simultaneously.

<figure>
  <img src="/writing/diffusion-gemma/ar-vs-diffusion.svg" alt="Two panels comparing generation strategies. Top: autoregressive generation as a row of token cells filled one per forward pass, left to right, with committed tokens unable to change. Bottom: block diffusion as a 256-token canvas refined over passes, where the lowest-entropy positions get locked each pass in green, earlier locks shown in ink, and the rest return to noise until the canvas settles" width="1200" height="640" />
  <figcaption>Autoregressive decoding commits one token per pass. Block diffusion drafts the whole canvas at once and sharpens it everywhere.</figcaption>
</figure>

## Inside one denoising step

Four things happen in each step.

1. The whole 256-token canvas goes through the network together, in a single pass.
2. For every position, the model scores its own uncertainty: literally the entropy of its prediction at that spot.
3. The positions it is most sure about get accepted and locked, but only up to a budget, so it cannot overcommit to a bad step.
4. Everything else is thrown back into noise, to be reconstructed next time.

Two refinements make this practical. The temperature cools linearly from 0.8 to 0.4 across steps, which amounts to early exploration and late commitment. And when the canvas stops changing, generation simply stops. The model card allows up to 48 denoising steps per block, but in my runs it usually settled in around 20.

Longer answers chain blocks. Once a 256-token block is fully denoised, it gets committed to the KV cache and frozen like ordinary context, and the next 256 positions are denoised conditioned on everything committed so far. The honest description is a hybrid: diffusion inside each block, autoregressive across blocks.

## The network underneath

The speed story depends on the network. The release is named 26B A4B; the model card puts it at 25.2B total parameters with 3.8B active per token. The feed-forward layers are split into 128 experts, and each token gets routed to eight of them plus one shared expert that every token uses. Around that core sit 30 layers of sliding window attention with a 1,024-token window, a context length up to 256K tokens, and a small vision encoder of roughly 550M parameters riding along, so it accepts images as input.

## Speed, and what it costs

The official numbers: 1,000+ tokens per second on a single H100, 700+ on an RTX 5090, and up to 4x faster generation than comparable autoregressive decoding. The model card reports per-user speeds exceeding 1,100 tokens per second in low batch settings on an H100 at FP8, with the model locking 15 to 20 tokens per forward pass.

The cost shows up on the benchmarks against the autoregressive Gemma 4 26B A4B: MMLU Pro 77.6 versus 82.6, AIME 2026 69.1 versus 88.3, GPQA Diamond 73.2 versus 82.3. Google is direct about this: overall output quality is lower, and for applications that demand maximum quality they recommend standard Gemma 4. So the trade-off is explicit. You are buying parallel decoding speed with benchmark accuracy.

## Running it locally

What you need depends entirely on the precision you pick. My rough breakdown from testing: the original BF16 weights need about 52 GB, which is A100 or H100 territory. FP8 cuts that to around 27 GB, still a 40 GB-class card. Quantized to 4-bit, Google's own number is about 18 GB, which fits a high-end consumer GPU, and NVFP4 is supported natively on Blackwell. One caveat from my runs: memory grows with the context window, so budget beyond the weights for long prompts.

On my M2 Max with 96 GB of unified memory, running a 4-bit quantization through an early MLX port, I saw anywhere from 8 to 23 tokens per second depending on the prompt, and around 13 on a longer code generation task. Acceptable for a machine that is several generations old.

Serving support landed fast. Google's developer guide lists vLLM, Hugging Face Transformers, SGLang, and MLX, and the Hugging Face page points to GGUF quantizations for llama.cpp, Ollama, and LM Studio. My recommendation: vLLM if you are serving customers and need batching, llama.cpp for local deployment.

## Where diffusion pays off

My favorite demonstration is Sudoku. A small autoregressive model filling a grid one cell at a time tends to fail, because it cannot revise the cells it already committed. A fine-tuned diffusion model can complete the grid accurately, because parallel generation lets it go back and fix earlier positions. I showed one such community fine-tune in the video, and I am planning a follow-up on fine-tuning diffusion models for your own tasks.

Keep expectations calibrated. This is an experimental model. My Pokémon website test produced a usable page but nothing groundbreaking, which is what you would expect from 3.8B active parameters. The significance is not the output quality today. Gemini Diffusion proved the speed a year ago at 1,479 tokens per second and stayed closed. DiffusionGemma puts that research line in your hands, under a license that lets you build on it.

## Sources

- [DiffusionGemma](https://deepmind.google/models/gemma/diffusiongemma/), Google DeepMind model page
- [DiffusionGemma model card](https://ai.google.dev/gemma/docs/diffusiongemma/model_card), Google AI for Developers
- [DiffusionGemma: 4x faster text generation](https://blog.google/innovation-and-ai/technology/developers-tools/diffusion-gemma-faster-text-generation/), the announcement post
- [DiffusionGemma: the developer guide](https://developers.googleblog.com/diffusiongemma-the-developer-guide/), serving and deployment details
- [google/diffusiongemma-26B-A4B-it](https://huggingface.co/google/diffusiongemma-26B-A4B-it) on Hugging Face
- [Gemini Diffusion](https://deepmind.google/models/gemini-diffusion/), the closed experimental precedent
- [Accelerating Gemma 4: multi-token prediction drafters](https://blog.google/innovation-and-ai/technology/developers-tools/multi-token-prediction-gemma-4/), the autoregressive speed play
- [DeepSeek visual primitives: teaching models to reason with a cursor](/writing/deepseek-visual-primitives/), another research note on this site
