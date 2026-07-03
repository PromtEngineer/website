---
title: 'RAG beyond similarity search: how a modern retrieval pipeline works'
description: 'Traditional RAG embeds chunks and hopes similarity search finds the right ones. What replaced it: hybrid retrieval, reranking, enrichment, verification, with localGPT as a working example.'
date: 2026-06-11
tags: ['rag', 'retrieval']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>Traditional RAG is three steps: embed your documents into a vector store, run similarity search against the query, and hand the top chunks to the model. It works as a demo and degrades in production.</li>
    <li>The failures are specific: chunks lose their document context, similarity misses exact keywords, the top-k contains noise, and nothing checks the answer.</li>
    <li>What works today targets each failure: hybrid search, reranking, contextual enrichment, late chunking, query decomposition, sentence pruning, and answer verification.</li>
    <li>localGPT implements the full modern pipeline end to end, running entirely on local models. This post walks through its architecture as a concrete example.</li>
  </ul>
</aside>

Here's a situation I keep seeing. You build a RAG system over your documents, the demo goes great, everyone's impressed, and then a few weeks into real use the answers start going wrong in ways you can't quite pin down. The recipe you followed is the standard one: retrieve the relevant pieces, put them in context, generate. That recipe hasn't changed since 2023. So what's failing?

That's the question this post answers. We'll look at the traditional pipeline and find the exact places it breaks, then walk through the techniques that fix each break, and then see how they all come together in [localGPT](https://github.com/PromtEngineer/localGPT), my open-source project, as one concrete end-to-end architecture that runs entirely on local models. Two of the failures are sneakier than the others, and I'll flag them when we get there, because they're the ones that bite after the demo, not during it.

## The three-step recipe, and where it cracks

Start with what you built, because the failures live inside it. The classic pipeline is three steps.

First, indexing: split your documents into chunks, run each chunk through an embedding model, and store the vectors in a vector store. A vector store sounds fancy but it's basically a database of number lists, one list per chunk. Second, retrieval: embed the user's query with the same model and run a similarity search, which just means finding the chunks whose numbers sit closest to the query's numbers. Third, generation: paste the top-k chunks into the prompt and let the model answer.

<figure>
  <img src="/writing/rag-beyond-similarity-search/traditional-rag.svg" alt="Traditional RAG pipeline: documents are chunked and embedded into a vector store; the user query is embedded and similarity search returns top-k chunks, which are placed in the prompt for the model to generate an answer" width="1200" height="540" />
  <figcaption>The 2023 recipe. Every arrow hides a failure mode.</figcaption>
</figure>

For a small clean corpus this works well, and that's exactly why the demo fooled you. Then the corpus grows, the questions get harder, and four failure modes show up:

- **Chunks lose their context.** Chunking cuts a document into pieces, so each piece forgets the page it came from. A chunk that says "the second approach performs better" embeds to something nearly meaningless once it's separated from the section that defined the approaches. Hold onto that exact chunk, because we'll fix it twice later.
- **Similarity is not the same as relevance.** Dense vectors capture meaning, so they blur exact strings: part numbers, function names, legal clause IDs. The query "error 0x80070057" wants keyword search, not semantic neighbors.
- **Top-k is noisy.** The nearest 10 chunks usually contain the answer plus six distractions, and the model doesn't reliably ignore the distractions.
- **Nothing checks the answer.** This is the first of the two sneaky ones. If retrieval misses, the model improvises, and the pipeline reports the improvisation with full confidence. You won't see this in a demo, because in a demo you already know the right answer.

So the diagnosis is four specific breaks, not one vague "RAG doesn't work." That's good news, because a specific break can get a specific fix, and everything in the next section exists to fix exactly one of these four.

## What works today

**Hybrid search.** Take the exact-string problem first, because it has the cheapest fix. The dense vectors miss "error 0x80070057", so you run a keyword search alongside them: dense vector search and keyword (BM25) search in parallel, then fuse the results. Dense covers paraphrases and concepts, keywords cover the strings dense embeddings blur, and in my experience this is the single highest-value upgrade over vector-only retrieval. But fusing two searches makes the noise problem worse, not better, so the next fix is a filter.

**Reranking.** The idea is to cast a wide net on purpose, say k of 20 or more, and then let a second model score each candidate against the query and keep the best few. That second model is a cross-encoder, which is just a model that reads the query and the chunk together instead of comparing two precomputed vectors. Rerankers like [answerai-colbert-small-v1](https://huggingface.co/answerdotai/answerai-colbert-small-v1) are far more accurate than the original similarity score for exactly that reason. Now retrieval finds the right chunks and filters the wrong ones, but remember the chunk that said "the second approach performs better"? It's still amnesiac.

**Contextual enrichment.** Here's the first fix for it. Before embedding, prepend each chunk with a short generated summary of its surrounding context, an approach popularized by [Anthropic's contextual retrieval](https://www.anthropic.com/news/contextual-retrieval). The chunk now carries a sentence explaining which approaches, from which section, so its embedding finally means something on its own. The enrichment happens once, at indexing time, so you pay for it once per document, not once per query.

**Late chunking.** The second fix for the same disease attacks it from the embedding side, from the [late chunking paper](https://arxiv.org/abs/2409.04701): embed the entire document in one pass, then pool the token representations within each chunk's span. Every chunk's vector is computed while the model can still see the whole document, so the context survives even though the storage unit is still a chunk. Between enrichment and late chunking, the amnesia problem is handled, which leaves the problems that live on the query side.

**Query decomposition.** Real questions are often three questions wearing a coat. Split a complex query into standalone sub-queries, run retrieval for each in parallel, and compose the sub-answers. This also handles follow-ups: the decomposer resolves "what about the second one?" against chat history before searching, so the retrieval step never sees a dangling pronoun.

**Sentence pruning.** Even after reranking, a well-ranked chunk is mostly padding. A pruning model like [Provence](https://huggingface.co/naver/provence-reranker-debertav3-v1) removes the irrelevant sentences inside each retrieved chunk, so the context window carries answers, not upholstery. At this point the model is generating from clean, relevant evidence, which leaves one question open: is the answer it generated any good?

**Answer verification.** This is where the first sneaky failure gets paid off. After generation, an independent check compares the answer against the retrieved evidence and issues a verdict: supported or not. It's the step that turns "the model said something" into "the system stands behind this," and honestly it's the piece most pipelines still skip. Seven techniques is a lot to hold in your head, though, so let me show you what they look like assembled into one working system.

## How localGPT puts it together

localGPT started in 2023 as exactly the traditional pipeline: embed documents, store vectors, search, answer, all locally for privacy. The current architecture is what it grew into after hitting every one of the four failures above. Every model in it runs on your machine through Ollama, which makes it a useful existence proof: none of this requires a cloud API.

<figure>
  <img src="/writing/rag-beyond-similarity-search/localgpt-pipeline.svg" alt="localGPT architecture in two lanes. Indexing: PDF converted to markdown, chunked at 512 tokens, enriched with local context summaries, embedded with late chunking into LanceDB plus document overviews. Query: triage against overviews, optional decomposition into sub-queries, parallel hybrid search, ColBERT reranking, sentence pruning, generation, and an independent verification pass" width="1200" height="800" />
  <figcaption>The localGPT pipeline. Small models do the routine work; the 8B model only generates and verifies.</figcaption>
</figure>

On the indexing side:

- Documents are converted to structured markdown with [Docling](https://github.com/docling-project/docling), which preserves layout and tables instead of scraping raw text.
- Chunks are cut at 512 tokens, respecting markdown structure.
- Each chunk gets contextual enrichment: a small local model (qwen3:0.6b) writes a few sentences of surrounding context, which are prepended before embedding.
- Embeddings use Qwen3-Embedding-0.6B with late chunking enabled, and land in LanceDB.
- A one-paragraph overview of each document is precomputed and stored alongside the index.

So the indexing lane applies both context fixes at once, enrichment and late chunking, plus those precomputed overviews whose purpose will make sense in a second. The query side is where it gets interesting, because retrieval here is not a fixed step. It's a decision:

1. **Triage.** The agent first decides what kind of query this is, using the precomputed document overviews for a fast check and a small LLM as fallback. Some queries route to retrieval, some get answered directly, and follow-ups default to retrieval because history suggests the documents are in play.
2. **Decomposition.** Complex queries are split into up to three standalone sub-queries, with pronouns resolved against the conversation, and the sub-queries run through the pipeline in parallel.
3. **Hybrid retrieval.** Vector search and keyword search run in parallel against LanceDB, fetch about 20 candidates, and fuse.
4. **Rerank and prune.** A ColBERT reranker keeps the best 10, with an early exit when the leader's margin is already decisive. Provence then prunes irrelevant sentences inside the survivors.
5. **Generate.** qwen3:8b answers from the pruned context, with recent conversation turns included.
6. **Verify.** An independent verification pass compares the answer to the evidence and returns a verdict with a confidence score, so the system knows the difference between grounded and improvised.

Two design choices are worth stealing even if you never run the project. First, the multi-model split: a 0.6B model handles enrichment, overviews, and routing, while the 8B model only generates and verifies. Routine work goes to cheap models and judgment goes to the big one. Second, the semantic cache: repeated queries are matched by embedding similarity (cosine 0.98), not exact string match, so rephrasings of yesterday's question cost nothing. And notice something about that six-step query path, because it points at where all of this is heading.

## Retrieval is becoming agentic

I said there were two sneaky failures, and the second one was hiding in plain sight: the traditional pipeline never decides anything. It retrieves on every query, the same way, whether or not retrieval is the right move. Look at the localGPT query path again with that in mind: triage, decompose, search, check, and then decide whether the evidence is good enough. That's not a pipeline so much as a small agent whose tools happen to be a vector store and a keyword index. The most interesting RAG systems today are converging on the same shape as the agent harnesses I wrote about in [the harness series](/writing/what-is-an-agent-harness/): a loop with retrieval tools, a decision maker in the middle, and a verifier at the end.

So that's where I'd place the frontier: not better embeddings, but better decisions about when to retrieve, what to retrieve, and whether to trust what came back. The traditional pipeline treated retrieval as plumbing. The systems that work treat it as judgment.

## Sources

- [localGPT](https://github.com/PromtEngineer/localGPT), the architecture described here
- [Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval), Anthropic
- [Late chunking: contextual chunk embeddings using long-context embedding models](https://arxiv.org/abs/2409.04701)
- [answerai-colbert-small-v1](https://huggingface.co/answerdotai/answerai-colbert-small-v1), the reranker
- [Provence](https://huggingface.co/naver/provence-reranker-debertav3-v1), sentence-level context pruning
- [Docling](https://github.com/docling-project/docling), document conversion
- [What is an agent harness?](/writing/what-is-an-agent-harness/), where retrieval meets the agent loop
