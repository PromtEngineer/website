# What controls the reasoning budget in Qwen3.8-27B

This report summarizes a three-part study of the thinking behavior of
Qwen3.8-27B. The study measures how many reasoning tokens the model generates
under different effort presets, task types, and explicit budget instructions.

The study covers 84 single-turn completions and 2.77 million generated tokens.
Every run finished with `finish_reason: stop`, and every output was
structurally complete.

## Key findings

- The effort presets (`low`, `medium`, `xhigh`) are system-prompt sentences,
  not enforced budgets. They shift average thinking length but bind weakly.
- Task modality, not task complexity, is the strongest predictor of thinking
  length. Python script tasks receive thinking in proportion to their
  difficulty (Spearman ρ = 1.00). Web app tasks receive a large,
  difficulty-blind allocation (ρ = 0.20).
- An explicit token budget in the prompt acts as an anchor, not a limit.
  Thinking moves toward the stated number from either direction. Floors bind
  better than caps.
- Answer length stays constant no matter what you do. Extra tokens bought by
  any setting are spent on reasoning, which the client discards.

## Test environment

The following table describes the serving stack that produced all
measurements.

| Component | Value |
|---|---|
| Model | Qwen3.8-27B, NVFP4 (ModelOpt checkpoint, unquantized `lm_head`) |
| Hardware | 2 × NVIDIA DGX Spark (GB10), 200 Gb/s RoCE interconnect |
| Engine | vLLM v0.27.1, tensor parallel across both nodes |
| Speculative decoding | DFlash2 draft model, `num_speculative_tokens: 11` |
| Sampling | Server default temperature, `max_tokens: 98304` |
| Concurrency | 4 requests in flight during collection |

Token counts don't depend on server load, so concurrent collection doesn't
affect the reported numbers. Timing measurements do depend on load, so this
report excludes them.

## Method

Each run sends one chat completion request and records the following values:

- Prompt tokens and prefix-cache hits from the `usage` object.
- Reasoning tokens and answer tokens, counted by sending the returned
  `reasoning` and `content` strings to the server's `/tokenize` endpoint.
- The finish reason, to detect truncation.
- A structural completeness check on the generated artifact.

Each condition has one sample. Repeated runs of one condition can differ by a
factor of 4.5, so single cells carry noise. Trends across tiers, modalities,
and presets are the signal.

The effort presets work by prepending a sentence to the system prompt. For
example, `low` prepends "Reasoning effort is set to low. Keep your thinking
brief and focused...". The template applies no token limit. This mechanism
explains most of the observed behavior.

## Round 1: the effort presets

Round 1 runs seven coding prompts of increasing complexity, from a countdown
timer widget to a full analytics dashboard. Each prompt runs at four settings:
thinking off, `low`, `medium`, and `xhigh`.


The presets shift the mean: 22,100 tokens at `low`, 27,800 at `medium`, and
42,700 at `xhigh`. Beyond the mean, the dial binds weakly:

- Task complexity doesn't increase thinking. Spearman correlation between
  complexity and thinking length is −0.29 at `low`, −0.14 at `medium`, and
  −0.50 at `xhigh`. The hardest prompt drew the smallest `xhigh` budget.
- Inversions are routine. On the typing-benchmark task, `low` generated 49,179
  thinking tokens while `xhigh` generated 38,413.
- Variance is large. Two runs of one identical cell produced 24,606 and 5,456
  thinking tokens.

## Round 2: task complexity and modality

Round 2 isolates the variable that round 1 could only hint at. Eight original
tasks form a paired grid: four complexity tiers, each with a web app version
and a Python script version of matched difficulty. All tasks produce visual
output.

| Tier | Web app | Python script |
|---|---|---|
| T1 | Lava lamp animation | Spirograph poster |
| T2 | Fireworks show | Fractal atlas |
| T3 | Boids ecosystem | Double-pendulum chaos |
| T4 | 3D planet renderer | Ray tracer |


The two modalities behave differently:

- **Python scripts**: thinking rises monotonically with tier at every preset.
  Spearman ρ = 1.00 three times independently. At `low`, the progression is
  2,152 → 6,001 → 19,888 → 38,027 tokens.
- **Web apps**: thinking shows no relationship to tier (ρ = 0.20). The tier-1
  lava lamp drew 39,586 thinking tokens at `low`; the much harder tier-3
  boids simulation drew 1,033 at the same setting.
- The modality gap narrows as effort rises: web tasks think about 2.6 times
  more than Python tasks at `low` but only 1.1 times more at `xhigh`, where
  both modalities saturate.

## Round 3: explicit token budgets

The presets are editable prompt text, so round 3 replaces them with explicit
numbers. Each of the eight tasks runs with three system-message instructions,
all at preset `low`:

- "Thinking must not exceed 2,000 tokens."
- "Thinking must not exceed 8,000 tokens."
- "Reason for at least 24,000 tokens before answering."


A stated number attracts thinking but doesn't cap it:

- The 2,000-token cap fails. Median overshoot is 10.2 times the budget; the
  worst case is 16.8 times.
- The 8,000-token cap pulls from both directions. Median overshoot drops to
  2.8 times. One task complied at 0.86 times the budget. Another task that
  naturally used about 2,000 tokens was pulled up 4.4 times by the stated
  number.
- The 24,000-token floor binds best. Six of eight tasks met it, with a median
  of 1.7 times the target. One task whose natural appetite was 1,033 tokens
  rose to 52,906.

The asymmetry is consistent: instructions that request more thinking bind
better than instructions that request less.

## The cost of thinking

Answer length is invariant across all 84 runs. Pooled across rounds 1 and 2,
mean answer length stays between 8,500 and 11,000 tokens at every preset, and
budget instructions don't change it.


At `xhigh`, about 75% of generated tokens are reasoning that the client
discards. The same deliverable costs about 3.8 times more tokens at `xhigh`
than with thinking off.

## Multi-turn behavior: preserve_thinking and prefix caching

This study is single-turn by design, which isolates per-turn thinking
behavior. In multi-turn use, one more template setting controls cost:
`preserve_thinking`.

When `preserve_thinking` is on, which is the default (including when the
value is undefined), the chat template re-embeds the full `<think>` block of
every previous assistant turn into the next prompt. Each turn's context
therefore grows by that turn's complete reasoning trace. At `xhigh`, where a
turn generates 30,000 to 60,000 thinking tokens, a 262,144-token context
window fills in about 4 to 5 turns.

The setting also interacts with prefix caching, and the interaction is a
trade, not a free choice:

- **`preserve_thinking` on**: each turn's prompt is an exact prefix extension
  of the previous prompt, so the prefix cache hits and prefill cost stays
  low. Context length grows quickly.
- **`preserve_thinking` off**: the template re-renders history without the
  thinking that was originally generated, so the cached KV diverges at every
  turn boundary. Context stays small, but each turn pays full re-prefill.

For agent loops, combine the two levers: run with thinking off or `low` to
keep per-turn traces small, which makes `preserve_thinking` affordable and
keeps the prefix cache effective.

## Recommendations

- For interactive use, run with thinking off or at `low`. The answer is the
  same size either way.
- To force deliberation on a hard problem, state a floor ("reason for at
  least N tokens"). Floors bind; the `xhigh` preset alone is less predictable.
- Don't rely on a cap to control cost. A cap below the model's natural
  appetite for the task is ignored. To economize, turn thinking off.
- Expect web app prompts to be expensive at any thinking setting. Expect
  Python script prompts to scale with their difficulty.
- Budget latency for variance, not for the mean. A single `low` run can think
  anywhere from about 500 to 65,000 tokens.
- In multi-turn agent loops, keep thinking small (`off` or `low`) so that the
  default `preserve_thinking` behavior stays affordable. Turning
  `preserve_thinking` off saves context but defeats prefix caching, so each
  turn pays full re-prefill.

## Data and artifacts

The following files contain the raw data and generated outputs:

- `~/qwen38-webapp/reasoning_results.jsonl`: round 1, 28 runs.
- `~/qwen38-webapp/visualbench_results.jsonl`: round 2, 32 runs.
- `~/qwen38-webapp/budgetbench_results.jsonl`: round 3, 24 runs.
- `~/qwen38-webapp/reasoning_outputs/`, `visualbench_outputs/`,
  `budgetbench_outputs/`: every generated app and script, with its full
  reasoning trace.

