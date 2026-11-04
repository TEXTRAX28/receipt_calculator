# Selected 4B invoice resume: runtime memory stop

4 November 2026. Parent `10327a7609483064f7d0e091c521cafa9ca1c5b6`.
No application/test source, production model, prompt or memory policy changed.
OpenAI remains unused and the full twelve-phase goal remains incomplete.

## What actually ran

The single remaining [prepared resume](INCLUDED_FEE_MERGE.md) was attempted after
actual available RAM rose above the selected reader's current three-GiB startup
floor. This runs `createLocalVisionReader` directly from the unchanged application
module, with its actual image validation, asset verification, startup/runtime
checks, command construction and strict output adapter. It is not an HTTP,
browser or phone run. The injected spawn recorder only observes real child
processes; available memory, process outcomes and model replies are not mocked.
There is no environment-file loader or external provider integration.

The graph locates the factory at `server/local-vision.mjs:L76`. Its current source
was checked before the call. The JPEG validator and selected asset-check child
both exit 0. The pinned reader provides the existing 4B model/runtime identities;
the recorder verifies prompt, schema and item-property order, fixed inference
options and image bytes before native spawn. The source is the same supplementary
public invoice JPEG, SHA256
`6cb4149f39a705225f5a812db90cebe7db35f60c1569d70e510448148776371d`.
No OCR, expected value, reference annotation or currency hint enters the model.

The frozen request SHA256 remains
`8bf30dc292064aaa2c939a4837f7d83aa31399c091c3ae3f0e192045c51b30df`.
Context 8192, output limit 4000, image budget 1536, automatic GPU placement,
256/128 batches, four threads, greedy sampling and the fixed seed are unchanged.
The actual production reader adds its three-GiB startup floor, which is stricter
than the older 2,923,261,952-byte empirical resume preflight. Native, reader and
outer deadlines remain 180, 200 and 210 seconds. The runtime floor stays one GiB.

## Result and limits

Initial available RAM is **3,429,691,392 bytes** in the outer controller and
**3,435,175,936 bytes** immediately before native launch. The startup guard
qualifies; it is not a guarantee that loading/inference will fit. The outer
250-ms memory sampler then observes **910,757,888 bytes**, below the unchanged
1,073,741,824-byte floor, and stops the owned reader/native process tree after
**11.725 seconds**.

No draft or native stdout is produced. The reader's result/finally block and
native close event were interrupted, so there is no native exit code, completed
inference latency, model-field vector, independent hybrid result or financial
accuracy score. The diagnostic duration includes validation/setup and is a
failed-attempt controller time. Do not describe this as a successful scan or as
a verified graceful production HTTP fallback.

This consumes the one additional native attempt: **two cumulative attempts,
zero remaining in the frozen resume series**. The previously held preflights
were not model calls. The reserved raw directory now exists and contains the
launch record, child records, exact request/schema and native diagnostics.
Do not start the same resume again based on an old plan or missing result file.

## Ownership and cleanup

After the outer stop, an authoritative process query confirms the recorded Node,
both Python and native PIDs are absent. The interrupted reader leaves exactly
one owned job with its JPEG and schema. Follow-up cleanup first resolves and
checks the absolute root/target, exact parent directory and job name, expected
two-file inventory, JPEG hash and captured schema equality. Only then does it
call the existing `removeOwnedJob` helper (`server/local-ocr.mjs:L100`). No
recursive operation targets a computed unchecked directory or another user's job.

The job is removed, the runtime root has **zero remaining private jobs**, and
the original prepared JPEG hash remains unchanged. This is explicit investigator
cleanup after verified process absence, not evidence that the interrupted
reader cleaned itself. No user process is closed and no receipt is uploaded.

## Verification and next action

All 220 application/test files still match the verified 1,339-case source; no new
unit, browser, build or full-corpus test is claimed. The actual resume adds
resource/ownership evidence only. The selected reader's model, schema and source
are retained alongside the controller, launch witness and cleanup proof. Stable
and original checkouts, the original dirty diff and saved root handoff are
preserved. Eight targeted prior evidence-packet checks pass; this does not rerun
the full historical audit or remove its known gaps.

Machine record: [advanced-mixed-invoice-native-resume-v1.json](advanced-mixed-invoice-native-resume-v1.json).

```powershell
python -X utf8 qa-artifacts/mixed-invoice-native-resume-v1/seal.py --check
```

Stop this exhausted resume series. Before further independent vision work,
investigate a materially different memory profile, such as bounded KV-cache
quantization, against the pinned runtime's actual support. It needs its own
frozen experiment and unchanged operating floors; no default change or native
retry is justified by an estimate alone. The smaller 2B/Q8-projector candidate
already failed source-literal qualification and stays rejected. Primary-worker
resource policy, crash-safe cleanup, full financial truth, handset capture and
public deployment/privacy work remain separate unfinished requirements.
