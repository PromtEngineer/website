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

Retrieval-augmented generation is how you get a language model to answer questions about your documents: retrieve the relevant pieces, put them in context, and generate. The basic recipe has not changed since 2023. What changed is everything around it, because the basic recipe quietly fails in ways that only show up after the demo.

This post covers three things: the traditional RAG pipeline and where it breaks, the techniques that actually work today, and how they come together in [localGPT](https://github.com/PromtEngineer/localGPT), my open-source project, as one concrete end-to-end architecture that runs entirely on local models.

## Traditional RAG: embed, store, search

The classic pipeline is three steps.

First, indexing: split your documents into chunks, run each chunk through an embedding model, and store the vectors in a vector store. Second, retrieval: embed the user's query with the same model and run a similarity search to find the nearest chunks. Third, generation: paste the top-k chunks into the prompt and let the model answer.

<figure>
  <img src="/writing/rag-beyond-similarity-search/traditional-rag.svg" alt="Traditional RAG pipeline: documents are chunked and embedded into a vector store; the user query is embedded and similarity search returns top-k chunks, which are placed in the prompt for the model to generate an answer" width="1200" height="540" />
  <figcaption>The 2023 recipe. Every arrow hides a failure mode.</figcaption>
</figure>

This works, and for a small clean corpus it works well. Then the corpus grows, the questions get harder, and four failure modes show up:

- **Chunks lose their context.** A chunk that says "the second approach performs better" embeds to something nearly meaningless once it is separated from the page that defined the approaches.
- **Similarity is not the same as relevance.** Dense vectors miss exact matches: part numbers, function names, legal clause IDs. The query "error 0x80070057" wants keyword search, not semantic neighbors.
- **Top-k is noisy.** The nearest 10 chunks usually contain the answer plus six distractions, and the model does not reliably ignore the distractions.
- **Nothing checks the answer.** If retrieval misses, the model improvises, and the pipeline reports the improvisation with full confidence.

Everything that follows exists to fix one of these four.

## What works today

**Hybrid search.** Run dense vector search and keyword (BM25) search in parallel and fuse the results. Dense covers paraphrases and concepts; keywords cover the exact strings dense embeddings blur. This is the single highest-value upgrade over vector-only retrieval.

**Reranking.** Retrieval casts a wide net (k of 20 or more), then a cross-encoder scores each candidate against the query and keeps the best few. Rerankers like [answerai-colbert-small-v1](https://huggingface.co/answerdotai/answerai-colbert-small-v1) read the query and the chunk together, which makes them far more accurate than the original similarity score that retrieved the chunk.

**Contextual enrichment.** Before embedding, prepend each chunk with a short generated summary of its surrounding context, an approach popularized by [Anthropic's contextual retrieval](https://www.anthropic.com/news/contextual-retrieval). The chunk that says "the second approach performs better" now carries a sentence explaining which approaches, from which section. The enrichment happens once, at indexing time.

**Late chunking.** A complementary fix for the same disease, from the [late chunking paper](https://arxiv.org/abs/2409.04701): embed the entire document in one pass, then pool the token representations within each chunk's span. Every chunk's vector is computed while the model can still see the whole document, so the context survives even though the storage unit is still a chunk.

**Query decomposition.** Real questions are often three questions wearing a coat. Split a complex query into standalone sub-queries, run retrieval for each in parallel, and compose the sub-answers. This also handles follow-ups: the decomposer resolves "what about the second one?" against chat history before searching.

**Sentence pruning.** Even a well-ranked chunk is mostly padding. A pruning model like [Provence](https://huggingface.co/naver/provence-reranker-debertav3-v1) removes the irrelevant sentences inside each retrieved chunk, so the context window carries answers, not upholstery.

**Answer verification.** After generation, an independent check compares the answer against the retrieved evidence and issues a verdict: supported or not. This is the step that turns "the model said something" into "the system stands behind this," and it is the piece most pipelines still skip.

## How localGPT puts it together

localGPT started in 2023 as exactly the traditional pipeline: embed documents, store vectors, search, answer, all locally for privacy. The current architecture is what it grew into. Every model in it runs on your machine through Ollama, which makes it a useful existence proof: none of this requires a cloud API.

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

On the query side, the interesting part is that retrieval is not a fixed step. It is a decision:

1. **Triage.** The agent first decides what kind of query this is, using the precomputed document overviews for a fast check and a small LLM as fallback. Some queries route to retrieval, some get answered directly, and follow-ups default to retrieval because history suggests the documents are in play.
2. **Decomposition.** Complex queries are split into up to three standalone sub-queries, with pronouns resolved against the conversation. Sub-queries run through the pipeline in parallel.
3. **Hybrid retrieval.** Vector search and keyword search run in parallel against LanceDB, fetch about 20 candidates, and fuse.
4. **Rerank and prune.** A ColBERT reranker keeps the best 10, with an early exit when the leader's margin is already decisive. Provence then prunes irrelevant sentences inside the survivors.
5. **Generate.** qwen3:8b answers from the pruned context, with recent conversation turns included.
6. **Verify.** An independent verification pass compares the answer to the evidence and returns a verdict with a confidence score. The system knows the difference between grounded and improvised.

Two design choices are worth stealing even if you never run the project. First, the multi-model split: a 0.6B model handles enrichment, overviews, and routing, while the 8B model only generates and verifies. Routine work goes to cheap models; judgment goes to the big one. Second, the semantic cache: repeated queries are matched by embedding similarity (cosine 0.98), not exact string match, so rephrasings of yesterday's question cost nothing.

## Retrieval is becoming agentic

Look at that query path again: triage, decompose, search, check, and decide whether the evidence is good enough. That is not a pipeline so much as a small agent whose tools happen to be a vector store and a keyword index. The most interesting RAG systems today are converging on the same shape as the agent harnesses I wrote about in [the harness series](/writing/what-is-an-agent-harness/): a loop with retrieval tools, a decision maker in the middle, and a verifier at the end.

That is where I would place the frontier: not better embeddings, but better decisions about when to retrieve, what to retrieve, and whether to trust what came back. The traditional pipeline treated retrieval as plumbing. The systems that work treat it as judgment.

## Sources

- [localGPT](https://github.com/PromtEngineer/localGPT), the architecture described here
- [Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval), Anthropic
- [Late chunking: contextual chunk embeddings using long-context embedding models](https://arxiv.org/abs/2409.04701)
- [answerai-colbert-small-v1](https://huggingface.co/answerdotai/answerai-colbert-small-v1), the reranker
- [Provence](https://huggingface.co/naver/provence-reranker-debertav3-v1), sentence-level context pruning
- [Docling](https://github.com/docling-project/docling), document conversion
- [What is an agent harness?](/writing/what-is-an-agent-harness/), where retrieval meets the agent loop
