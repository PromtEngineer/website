---
title: 'DeepSeek visual primitives: teaching models to reason with a cursor'
description: 'Notes on DeepSeek''s briefly public paper Thinking with Visual Primitives: boxes, points, and paths placed inside the reasoning trace, and its honest limits.'
date: 2026-06-11
tags: ['research notes', 'vision']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>Words are a weak way to refer to objects in crowded scenes, and references drift over long reasoning. DeepSeek calls this the reference gap.</li>
    <li>The fix in Thinking with Visual Primitives: the model places boxes, points, and point sequences inside its reasoning trace, not after the answer.</li>
    <li>Training runs in stages: learn to output the primitives, then practice counting, spatial reasoning, mazes, and path tracing, with automatic verification where possible.</li>
    <li>The limits matter: weights are not broadly available, some benchmarks are in-house, the primitives need explicit triggers, and point reasoning is hard outside the training settings.</li>
  </ul>
</aside>

In late April 2026, DeepSeek published a paper called Thinking with Visual Primitives, then removed it within about a day. Some people saw the GitHub repository. Others now see a 404 page. The model weights are not broadly released, so this is not a review of a product. It is a note on the research idea, which is worth understanding regardless of what happens to the release.

This note covers the problem the paper targets, what the primitives are, how the model is trained, and the limits the paper itself admits.

## The reference gap

Words are often too vague for crowded visual scenes. If a model says "the object on the left," there may be several candidates. And the problem compounds: over a long chain of reasoning, a reference can drift, so the phrase that meant one mug at step two quietly means a different mug at step nine. The paper calls this the reference gap.

It is a different problem from perception. Most multimodal work in recent years has aimed at helping models see better: higher resolution, stronger encoders, more visual tokens. The reference gap is not about seeing. It is about keeping track of what has already been seen.

## Boxes, points, and point sequences

The proposed fix is to give the model three visual primitives to use while it reasons. A box refers to an object. A point refers to a location. A sequence of points describes a path.

The important claim is the placement. Vision models have emitted bounding boxes for years, but as outputs, attached after the answer. Here the boxes and points are interleaved into the reasoning trace itself. Coordinates sit between the words, as units of thought.

<figure>
  <img src="/writing/deepseek-visual-primitives/primitives.svg" alt="Three cards showing the visual primitives: a box drawn around one object among several, a crosshair point marking a location on an object, and a point sequence tracing a route through a small maze; below them, a dark reasoning trace interleaves box coordinates between lines of text before counting the marked boxes" width="1200" height="640" />
  <figcaption>The three primitives, and where they live: inside the reasoning trace, between the words.</figcaption>
</figure>

That placement changes how the model can attack specific tasks. For counting, it can mark every object first and then count the marked boxes, so the count becomes a property of the trace rather than a guess. For spatial questions, it can pin down the objects being compared before comparing them. For mazes and line tracing, it can lay down a sequence of points and follow the route through the image step by step.

## How it is trained

The pipeline has two broad stages. First the model learns to produce the primitives at all: boxes and points in the right format, grounded in the right pixels. Then it practices the tasks where primitives pay off: counting, spatial reasoning, maze navigation, path tracing.

The useful trick is automatic verification. Many of these tasks can be checked by a program with no human in the loop. A maze path either crosses a wall or it does not. A traced line can be compared against the true curve. That gives the training loop a cheap and reliable reward signal, the same property that made verifiable rewards work for math and code.

The reported results are strongest exactly where you would expect: dense counting, spatial reasoning, maze navigation, and path tracing. These are the tasks where holding a stable reference is most of the difficulty.

## Where this fits in DeepSeek's vision work

DeepSeek has been building toward this for a while. DeepSeek-VL focused on general image understanding. DeepSeek-VL2 extended it with a more efficient mixture-of-experts design. Then DeepSeek-OCR asked a stranger question: can vision serve as a compact way to store and recover text from documents?

The new paper continues that line. It describes strong compression of visual tokens before and inside the language model, and it treats coordinates as something the model works with, not only something it outputs. The common thread is vision as a compact working format, not just an input image. DeepSeek is not only trying to make models see more pixels. It is exploring how a model keeps track of what it is seeing.

## The honest limits

This section is the reason the note exists, so I will be specific.

The weights are not broadly available. The original repository is gone, and community mirrors of the paper are what remain. Until weights or an official release appear, none of the reported numbers can be independently reproduced.

Some benchmarks are in-house. The tasks that show the largest gains are partly evaluated on benchmarks the team built. That is not disqualifying, but in-house benchmarks tend to flatter the method they were designed around.

The primitives need explicit triggers. The model does not yet decide on its own that a question deserves boxes. The behavior has to be invoked.

Point-based reasoning is still hard outside the training settings. The primitives work best inside the task families the model practiced on. Whether reasoning with coordinates generalizes to messy, open-ended visual questions is exactly the open question.

The takeaway is modest but real. In simple terms, the model is being trained to reason with a cursor. Whether that becomes a standard part of multimodal models depends on the limits above, and right now nobody outside DeepSeek can check.

## Sources

- Thinking with Visual Primitives, DeepSeek-AI, April 2026. The original repository was taken down; a [community mirror of the paper](https://github.com/mitkox/Thinking-with-Visual-Primitives) and an [alphaXiv overview](https://www.alphaxiv.org/overview/visual-primitives) survive
- [DeepSeek-VL: Towards Real-World Vision-Language Understanding](https://arxiv.org/abs/2403.05525), March 2024
- [DeepSeek-VL2: Mixture-of-Experts Vision-Language Models for Advanced Multimodal Understanding](https://arxiv.org/abs/2412.10302), December 2024
- [DeepSeek-OCR: Contexts Optical Compression](https://arxiv.org/abs/2510.18234), October 2025
