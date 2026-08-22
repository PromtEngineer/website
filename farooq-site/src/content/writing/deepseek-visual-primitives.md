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

Thinking with Visual Primitives is a DeepSeek paper about how a vision model keeps hold of a specific object while it reasons. The publication history is strange: DeepSeek published the paper in late April 2026, then removed it within about a day. Some people saw the GitHub repository. Others now see a 404 page. The model weights are not broadly released, so this is not a review of a product. It is a note on the research idea, which is worth understanding regardless of what happens to the release. In this post I want to explain the problem the paper targets, the fix it proposes, how the model is trained, and the limits the paper itself admits.

## Why words keep losing their grip

The problem is how a model refers to objects while it reasons. Ask a vision model to count the mugs on a cluttered desk, and its reasoning will say things like "the mug on the left, next to the notebook." If there are several candidates, the phrase never locks onto one thing. The problem compounds: over a long chain of reasoning, a reference can drift, so the phrase that meant one mug at step two quietly means a different mug at step nine. The paper calls this the reference gap. In plain terms, the model has no way to say "this one" and have it stay this one.

This is a different problem from perception. Most multimodal work in recent years has aimed at helping models see better: higher resolution, stronger encoders, more visual tokens. None of that helps here, because the reference gap is not about seeing. It is about keeping track of what has already been seen. The fix has to give the model a pointing device, not better eyes.

## A cursor made of three shapes

The proposed fix is to give the model three visual primitives to use while it reasons. A box refers to an object. A point refers to a location. A sequence of points describes a path. That is the whole vocabulary: a way to say "this thing," "this spot," and "this route."

Bounding boxes themselves are nothing new. Models have emitted boxes for years, but as outputs, attached after the answer. The important claim here is the placement. The boxes and points are interleaved into the reasoning trace itself, so coordinates sit between the words, as units of thought rather than as a final report.

<figure>
  <img src="/writing/deepseek-visual-primitives/primitives.svg" alt="Three cards showing the visual primitives: a box drawn around one object among several, a crosshair point marking a location on an object, and a point sequence tracing a route through a small maze; below them, a dark reasoning trace interleaves box coordinates between lines of text before counting the marked boxes" width="1200" height="640" />
  <figcaption>The three primitives, and where they live: inside the reasoning trace, between the words.</figcaption>
</figure>

Here is what that buys in practice. For counting, the model can mark every object first and then count the marked boxes, so the count becomes a property of the trace rather than a guess. On the cluttered desk, instead of "the mug on the left," the trace now holds a box around that mug, and step nine points at the same pixels step two did. For spatial questions, the model can pin down the objects being compared before comparing them. For mazes and line tracing, it can lay down a sequence of points and follow the route through the image step by step.

## Teaching the model to point

The pipeline has two broad stages. First the model learns to produce the primitives at all: boxes and points in the right format, grounded in the right pixels. Then it practices the tasks where primitives pay off: counting, spatial reasoning, maze navigation, path tracing.

The useful trick in this pipeline is automatic verification. Many of these tasks can be checked by a program with no human in the loop. A maze path either crosses a wall or it does not. A traced line can be compared against the true curve. So the training loop gets a cheap and reliable reward signal, the same property that made verifiable rewards work for math and code, and the model can practice at scale without anyone labeling its homework.

The reported gains follow the training menu. They are strongest exactly where you would expect: dense counting, spatial reasoning, maze navigation, and path tracing, the tasks where holding a stable reference is most of the difficulty.

## Where this fits in DeepSeek's vision work

DeepSeek has been building toward this for a while. DeepSeek-VL focused on general image understanding. DeepSeek-VL2 extended it with a more efficient mixture-of-experts design. Then DeepSeek-OCR asked a stranger question: can vision serve as a compact way to store and recover text from documents?

The new paper continues that line. It describes strong compression of visual tokens before and inside the language model, and it treats coordinates as something the model works with, not only something it outputs. The common thread is vision as a compact working format, not just an input image. DeepSeek is not only trying to make models see more pixels. It is exploring how a model keeps track of what it is seeing.

## The honest limits

The paper's limits matter as much as its results, so I will be specific about them.

The weights are not broadly available. The original repository is gone, and community mirrors of the paper are what remain. Until weights or an official release appear, none of the reported numbers can be independently reproduced.

Some benchmarks are in-house. The tasks that show the largest gains are partly evaluated on benchmarks the team built. That is not disqualifying, but in-house benchmarks tend to flatter the method they were designed around.

The primitives need explicit triggers. The model does not yet decide on its own that a question deserves boxes. The behavior has to be invoked, so the cursor exists but the model does not yet reach for it unprompted.

And point-based reasoning is still hard outside the training settings. The primitives work best inside the task families the model practiced on. Whether reasoning with coordinates generalizes to messy, open-ended visual questions is exactly the open question.

The takeaway is modest but real. The model is being trained to reason with a cursor, a way to say "this one" and have it hold. Whether that becomes a standard part of multimodal models depends on the limits above, and right now nobody outside DeepSeek can check.

## Sources

- Thinking with Visual Primitives, DeepSeek-AI, April 2026. The original repository was taken down; a [community mirror of the paper](https://github.com/mitkox/Thinking-with-Visual-Primitives) and an [alphaXiv overview](https://www.alphaxiv.org/overview/visual-primitives) survive
- [DeepSeek-VL: Towards Real-World Vision-Language Understanding](https://arxiv.org/abs/2403.05525), March 2024
- [DeepSeek-VL2: Mixture-of-Experts Vision-Language Models for Advanced Multimodal Understanding](https://arxiv.org/abs/2412.10302), December 2024
- [DeepSeek-OCR: Contexts Optical Compression](https://arxiv.org/abs/2510.18234), October 2025
