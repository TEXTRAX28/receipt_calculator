# Separate fresh development and evaluation sources

4 November 2026, parent `fab34aa8c92d4feedb39c5a65d97a5ad3d58a8fe`.
The twelve-phase goal remains active. This checkpoint collects and verifies data;
it makes **no scanner change, model inference, new accuracy claim, cloud upload
or OpenAI call**.

## Selection and evaluation boundary

Before viewing new receipt pixels, field annotations or scanner results, the
selection was frozen as twelve CORD train sources 024–035 for development and
twelve CORD test sources 012–023 for subsequent evaluation. All 24 original
choices were retained through two failed viewer transports and the successful
Parquet transport. Failed, duplicate or difficult cases cannot be silently
replaced. The original fifty-receipt benchmark, references and scores are intact.

The exposure inventory includes both old manifests, existing raw CORD labels
and source IDs in prior evaluation reports: 55 manifest records and 44 known
CORD IDs. Exact image hashes, canonical upstream `gt_parse` hashes and dHash
distances at most four are checked against previous sources and within the new
cohort. No overlap or near-image candidate is flagged. All twelve development
and twelve evaluation sources are eligible before visual annotation review.
A perceptual hash is a candidate detector, not proof of transaction identity.
Five controls verify conservative quarantine and the distinction between a
near-image flag and an exact duplicate.

Evaluation pixels and receipt field values have not been displayed to the
assistant. Collection and validation parse upstream metadata and hash annotations
programmatically for row identity and overlap checks. Raw upstream labels are
stored separately from image-only model-input manifests. Do not review the new
evaluation receipts until development settings are frozen; do not tune the
scanner after examining their results. This is new-to-project data, not proof
that a pretrained model never saw the public dataset.

## Source and transport

The publisher's [CORD repository](https://github.com/clovaai/cord) and
[CORD v2 dataset](https://huggingface.co/datasets/naver-clova-ix/cord-v2) identify
the CC BY 4.0 licence and the Indonesian shop/restaurant source domain. The
dataset revision is `7f0115a4b758a71d6473b8d085751692da2fef98`; publisher revision
and licence were checked before and after collection. Attribution is retained
per image. Public licensing does not authorize third-party processing of these
local copies; their external-processing flag remains false.

The `/rows` service rejects the large source row group, reporting a roughly
490 MB scan against its 300 MB limit. Its cached preview omits part of the
selected train range. Neither failed attempt saved a new receipt. A standard
PyArrow batch-size-one probe also requested the oversized image dictionary;
the bounded reader refused that read before receiving an image.

The successful research adapter uses anonymous HTTPS ranges from the pinned
train/test Parquet files. PyArrow reads schema, metadata and text columns. A
narrow prefix decoder reads the image dictionary only as far as the selected
dictionary indices require, without assuming row index equals dictionary index.
It accepts the specific supported page encodings and rejects other layouts or
Snappy backreferences beyond its 64 KiB window. It is not part of the public
application's upload parser. The [Parquet encoding specification](https://github.com/apache/parquet-format/blob/master/Encodings.md),
[Thrift Compact Protocol](https://github.com/apache/thrift/blob/master/doc/specs/thrift-compact-protocol.md)
and [Snappy format description](https://github.com/google/snappy/blob/main/format_description.txt)
ground the implementation.

Seventeen controls compare decoded bytes with native PyArrow/Snappy, including
repeated dictionary indices, overlapping copies, deprecated dictionary encoding,
truncation and invalid offsets. The familiar train-000 control has exactly the
old upstream annotation, matching dimensions and dHash distance zero. Its raw
embedded PNG differs in SHA256 from the old viewer's JPEG rendition; this is
reported explicitly. The fresh cohort retains original embedded PNG bytes.
Future comparisons must use identical prepared image bytes for both readers;
old JPEG scores are not fresh-cohort baseline scores.

Ranges have exact bounds, payload hashes and consistent ETags. Every retained
image and raw annotation has its own SHA256. **The complete Parquet/LFS hashes,
unread dictionary suffixes and page CRCs are not verified.** The packet must not
be cited as a full-file integrity proof.

## Measured collection and validation

| Observation | Result |
| --- | ---: |
| Planned / collected sources | 24 / 24 |
| Raw image / annotation artifacts reverified | 24 / 24 |
| Eligible development / evaluation sources | 12 / 12 |
| Exact or near-image overlaps flagged | 0 |
| Successful collection range payload | 122,337,972 bytes |
| Collection including process release | 29.817 seconds |
| Minimum available RAM in collection guard | 1,778,126,848 bytes |
| Free disk immediately after collection | 11,149,963,264 bytes |
| Native format / overlap controls | 17 / 5 passed |
| New inference / provider / OpenAI calls | 0 / 0 / 0 |

The collection preserves the fixed 1.5 GiB startup, 1 GiB runtime and ten-GiB
disk reserves. PyArrow 26.0.1 is isolated under an ignored research-tools cache;
its official wheel was checksum-verified. No global Python installation,
production model environment or shared Node dependencies were changed. An
initial package-layout whitelist failure, a small-file header-bound failure
and the unsupported legacy dictionary declaration are retained with their
original code bytes and terminal logs; subsequent controls verify the fixes.

All 221 application/test source files still match the preceding 1,362-case,
75-file validation. That suite is not rerun or claimed as new receipt accuracy.
The repository graph is current. Stable, original dirty checkout, frozen old
comparison worktree, handoff and prepared Gemini scope remain protected. Private
configuration is not accessed. Raw images, labels and operational logs stay
ignored by Git; research code, this report and the digest packet are tracked.

Local evidence: `qa-artifacts/fresh-cord-cohort-v1`, `v2`, `v3` and
`qa-artifacts/fresh-cord-tools-v1`; exact bindings are in
`advanced-fresh-cord-cohort-v1.json`. Reproduction needs those ignored local
assets/evidence and the verified isolated Arrow installation; a clean clone
alone does not contain them. The frozen v3 plan records source code, selection,
transport limits, attribution and the preceding plan digest.

## Next action and limits

Freeze image preparation and current-reader settings, then produce a baseline
on all twelve new development images before inspecting their model outputs.
Review development source facts with explicit unreadable/ambiguous states,
improve or compare readers there, and evaluate the frozen candidate on the
twelve reserved images. Do not derive missing financial facts from arithmetic.

CORD is not representative UK Costco coverage. This checkpoint adds neither
new genuine Costco photographs nor complete financial ground truth, and cannot
establish complete-receipt accuracy or a public-release decision. The larger
model/browser resource limits and pending Free-only Gemini consent/quota gate
are unchanged. The reported OpenAI credit remains a last resort, unused.
