# Historical evidence audit: complete coverage, fifteen retained gaps

4 November 2026. The eight bounded runs cover every top-level
`evidence_sha256` declaration in the frozen **119-report** source set. Of
**76,057 declarations**, 30,899 match current bytes and 45,143 match exact retained
archives. The same **fifteen historical declarations remain unresolved**. There
are no newly missing or recovered versions. This is complete audit coverage,
not a clean integrity result, reconstructed history or completion of the OCR goal.

The [checkpoint packet](evidence-retention-audit-v1.json) binds the source,
controlled failures, successful checks, assignments and combined result.
The source set has 40,966 distinct paths and 13,269 expected hashes. Each of the
119 aggregate input files remains byte-identical throughout the comparison.
This new packet is checked separately and is not included in its own input set.

## Tooling changes and controls

The evaluation-only auditor now caches resolved paths and archive digests within
one invocation. It has no persistent trusted digest cache. A read-only
`--prefer-archive` mode verifies the exact archive contents first, then checks the
current file if the archive is missing or corrupt. Private environment filenames
are rejected case-insensitively, including after resolution; root escapes are
rejected before hashing. Existing `sha()` and `archive()` interfaces are unchanged.

The optional repeated `--report FILENAME` argument labels a selected run as
partial. Unknown and duplicate selections fail before artifact reads. The
combiner requires the exact disjoint union of the frozen report assignments,
unchanged input hashes, correct declaration accounting, terminal guard results
and unchanged auditor/test sources. Missing or duplicate coverage cannot produce
a full coverage result. Progress output is optional and contains report names.

Seven initial controls reproduce five passes and two failures in the exact old
auditor: repeated archive reads and acceptance of an uppercase private-env name.
No real environment file was created or opened. The final **sixteen controls pass**,
also through native unittest discovery. They cover missing historical bytes,
corrupt archives, root/private-path boundaries, the public blank-key example,
read-only archive preference, mutable archival, partial selections and exact
union equivalence including gaps. Test argument parsing occurs only in the
script entry point, preserving normal discovery.

After the eight real audit batches, one additional regression exposed a console
summary using the current-file cache count rather than the saved result's full
path count. The saved JSON and combined audit counts were correct. The exact
batch source is retained; the only subsequent auditor change replaces that one
printed expression. The final sixteen cases reproduce this summary failure
before the correction and pass afterward, also through discovery. The eight
artifact batches are not rerun for this output-only correction.

```powershell
python -m unittest discover -s receipt_training/scripts -p test_evidence_audit.py -v
```

## Bounded execution and exact scope

The cache-only full attempt reaches its unchanged 120-second limit at 120,552 ms.
The archive-first full attempt also reaches that limit at 120,544 ms, after 89
reports. Neither writes a complete audit result; both failures remain retained.
The metadata inventory observes approximately 12.63 GB of current artifact bytes,
including 7.55 GB of model files and repeated build assets. This is a size
inventory, not a model-memory or accuracy measurement.

The final verification partitions the same 119 inputs into eight disjoint batches.
Each keeps the **120-second per-process limit**, 1.5 GiB startup floor, 1 GiB
runtime floor, finite OS environment and credential exclusions. Every batch
terminates within its guard. Their recorded elapsed times total **157,620 ms**;
the combined work spans more time than one invocation. No single-process
120-second complete-audit pass or atomic filesystem snapshot is claimed.

The full retained assignments and commands are in
`qa-artifacts/evidence-audit-cache-v1/batches.json`; results are under
`qa-artifacts/evidence-audits/evidence-selected-20261104-v1-01.json` through `-08.json`.
Use fresh run names and output labels for any later execution. The combiner's
success means coverage/accounting is valid; its `integrity_clean` and
`all_declared_bytes_verified` fields are explicitly false.

The unresolved set consists of six area-reader records, four PDF-flow records,
three refund-flow records and two old generated graphs. Exact expected hashes
remain in the combined result. Current screenshots, later successful tests and
new graph generations cannot replace these missing bytes.

## Application and broader goal status

All **216 application/test source hashes** still match the existing 1,300-case
unit run. That result remains applicable; the application suite was not rerun.
No OCR engine, provider default, receipt interpretation, financial amount,
frontend control, dependency or source reference changes in this follow-up.
There is no new build, browser, OCR/VLM inference, receipt API request or upload.
The new checks exercise evidence tooling only.

The 22 prepared browser cases remain pending, with no new phone-fit claim.
The full objective still has recognition/capture/mobile and public-readiness
limitations described in [the acceptance audit](GOAL_ACCEPTANCE_AUDIT.md).
OpenAI remains the user's last resort; no key access or credit spending occurs.
The original checkout and stable branch remain protected. The handoff will
record this continuation after its commit; its earlier snapshot remains retained.
