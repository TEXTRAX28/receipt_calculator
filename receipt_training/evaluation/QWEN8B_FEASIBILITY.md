# Local 8B comparison: prepared, not executed

2 November 2026. No 8B accuracy, latency or superiority result is available.
The app still uses its existing 4B model. This work does not change its provider,
permissions, prompts, dependencies or receipt calculations.

The official [Qwen3-VL-8B-Instruct GGUF repository](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF)
publishes Apache-2.0 model files and a matching vision projector. The selected
Q4_K_M model is 5,027,784,800 bytes and its Q8_0 projector is 752,289,728 bytes.
Their combined new download is **5,780,074,528 bytes**. The pinned manifest records
revision `f982a07559d4a2f6c8744d840bf6fccab30eea96`, exact SHA256 values and
immutable URLs. Public Hugging Face metadata was fetched without credentials or
receipt content. No weights were downloaded.

The existing verified llama.cpp `b11960` runtime and its 37,345,851-byte archive
are already cached. The [llama.cpp multimodal documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
describes matching projectors and `--no-mmproj-offload`. The prepared trial uses
a CPU projector and 20 GPU layers for **both** candidates. This is an experimental
resource profile, not proof that the larger model will fit or perform well.
The laptop reports an RTX 3060 Laptop GPU with 6,144 MiB total VRAM; roughly
4,774 MiB was free during initial inspection. Its system RAM is about 16 GiB.

## Measured resource gate

`qa-artifacts/qwen8b-feasibility-v1/resources.json` records the check at
06:41 UTC. Free disk was 13,035,077,632 bytes and available physical RAM was
1,692,057,600 bytes. Both checks failed:

| Guard | Requirement                                                                     | Observed shortfall  |
| ----- | ------------------------------------------------------------------------------- | ------------------- |
| Disk  | Missing assets plus the existing 10 GiB disk reserve: 16,517,492,768 bytes free | 3,482,415,136 bytes |
| RAM   | At least 4 GiB available before a trial starts                                  | 2,602,909,696 bytes |

The disk reserve comes from the existing installer. The RAM threshold is a
conservative research startup guard, **not a published Qwen requirement** and
not an estimate of peak usage. Runtime memory must still be measured and bounded.
No user process was closed and no model cache, evidence or user file was deleted.

The existing installer also deliberately rejects manifests above four billion
asset bytes. This preparation does not bypass or raise that cap. Do not pass the
8B manifest to it and expect installation to work. Before native execution, a
separate bounded installation path and an owned-process low-memory abort need
verification. That execution work is deferred while current headroom fails.

Run the read-only check from this worktree's VS Code terminal:

```powershell
python -X utf8 receipt_training/scripts/qwen8b_resources.py
```

Freeing roughly 4 GB of disk space and closing unused applications may satisfy
the initial guards; use the measured check rather than assuming it is enough.
Neither this command nor the request preparer uploads a receipt or uses an API key.

## Frozen comparison

`qa-artifacts/qwen8b-comparison-v1/plan.json` declares three previously inspected
**development** diagnostics: `cord-v2-train-013` (service/tax),
`cord-v2-train-005` (coupon/card tender), and `cord-v2-train-023` (zero-tax,
unknown-basis control). Six paired requests are prepared; none has run.

Both candidates receive exactly the same original prepared images, full-receipt
row-first prompt and schema, 8,192 context, 4,000 output-token limit, 1,536 image
tokens, 20 GPU layers and CPU projector. No labels or primary OCR text are put
in prompts. Order alternates between pairs. Each future call has a 180-second
deadline, the existing output bounds and no automatic retry. Model files are the
only difference between paired requests. Prior auto-offload 4B timings cannot
stand in for new paired measurements with this resource profile.

The first checks are literal financial-role correctness, tax basis, missing or
extra payment/summary lines, and the same referenced item/quantity/price/total
fields. A balanced total alone is insufficient. Three familiar development
receipts cannot justify model promotion or a general accuracy claim. A promising
pilot would still need broader same-reference evaluation and operational testing.

Machine evidence is in `advanced-qwen8b-feasibility-v1.json`. No new original-
receipt inference, private upload, paid activation or app change occurred.
The current conditional hybrid results remain 133/143 line prices and 26/31 unit
prices; automatic line prices remain 116/143. The full upgrade goal stays open.
