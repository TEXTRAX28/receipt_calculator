# Capture blur guidance on receipt photographs

5 November 2026. Base improvement checkpoint: `8cbc0a9`. This change improves
the advisory blur calculation used by camera guidance and uploaded-photo review.
It changes no OCR engine, model, extraction prompt, financial parser, validation,
split algorithm or provider default. It does not modify the source image.

## Finding and change

The previous calculation warned on only one of six deliberately blurred
development photos. A fixed 3×3 smoothing filter before the derivative
measurement raises that to five, without an additional warning on any unchanged
original. Six more sources were reserved before measuring the candidate; the
same comparison improves one to five there too. Thresholds and the requirement
for two agreeing detail regions are unchanged. Original luminance/contrast
statistics remain identical.

The filter applies only to the bounded grayscale measurement buffer. Image
preparation and the pixels sent to a reader stay unchanged. The additional
Float32 buffer is bounded to 1 MiB per permitted 512×512 patch; this is a static
allocation bound, not a measured phone-memory requirement.

The motivation is noise sensitivity in a second derivative. OpenCV's
[Laplacian tutorial](https://docs.opencv.org/4.13.0/d5/db5/tutorial_laplace_operator.html)
also smooths before computing a Laplacian. That supports trying a prefilter,
not this receipt threshold or a confidence claim. A separate eight-bit smooth
wave control has a misleading old blur ratio of 0.89984 and a filtered ratio of
0.02918, with the same luminance/deviation. The new regression catches this
miss; another checks finite results and unchanged pixels at the minimum patch
size. The exact cause of every photographic miss is not isolated by this study.

## Sources, sampling and prospective check

The twelve sources are the existing CORD financial-development photos
`cord-v2-train-024` through `035`. They were already familiar from OCR work.
The first six, fixed by record order before measurement, expose the failure;
the latter six form a prospective **capture** check frozen with the candidate.
This is not a new blind financial/model holdout or independent human judgement
of sharpness. Source hashes and development membership stay unchanged.

Each source has an original view, a controlled blur and a controlled darkening.
The first study uses Pillow Gaussian radius 3 and brightness factor 0.2. Its
native detail crops match `inspectCapture` coordinates, while its overview is
downsampled with Pillow bilinear rather than browser canvas. Production output
matches the candidate exactly on all 36 prepared variants.

The later Chrome study runs the actual `inspectCapture` function and canvas
sampling on the same twelve sources. Its blur/brightness use browser canvas
filters. These implementations are not identical, so their counts stay
separate:

| Comparison | Previous blur warnings | Updated blur warnings | Added warnings on unchanged originals | Darkened copies receiving light advice |
|---|---:|---:|---:|---:|
| First six, Pillow controls | 1/6 | 5/6 | 0/6 | 6/6 |
| Reserved six, Pillow controls | 1/6 | 5/6 | 0/6 | 6/6 |
| Chrome canvas, same twelve | 5/12 | 11/12 | 0/12 | 12/12 |

No previously triggered blur warning is lost in either comparison. The source
photos themselves are not assumed perfectly sharp; zero added original warnings
is not a general false-positive rate. The remaining Chrome miss (`034`) has
only one qualifying detail patch, so the existing two-region rule abstains.
The Pillow misses likewise have fewer than two qualifying patches. Their text
is not certified readable and the rules are not relaxed to make the score pass.

These results improve advice on controlled changes to real photos. They do not
measure product/price accuracy, actual autofocus, physical lighting, clipping,
perspective correction, paper curvature or handset/Safari performance.

## Software and browser validation

All **1,461 unit cases across 80 files** pass in six disjoint guarded batches,
with no failed/skipped cases and each file covered once. This includes the two
new capture regressions and the two previously added local-startup controls.
The focused image/capture-review run passes all nine cases. Complete strict
TypeScript, changed-source formatting and isolated compilation pass on the final executable
source. Twelve compiled artifacts are retained/verified, six through unchanged
large-asset aliases; this compilation excludes public assets and is not a full
deployment package.

Three isolated Chrome checks pass: two existing simulated-camera flows and the
new native-canvas comparison. The flows cover 320/390/430px containment, focus,
accessibility, explicit capture, review, consecutive sections, stopped owned
tracks and dark/blur/blank guidance without preventing chosen capture. Camera
access is replaced with a canvas stream. No physical camera, OCR or provider is
called. Their server/browser close normally. The browser run lasts 12.878 s in
its controller, with at least 1,946,697,728 available RAM bytes observed against
the unchanged 1-GiB runtime reserve and 2.5-GiB admission guard.

An initial preparation assertion omitted leading zeroes from receipt IDs and
failed before image preparation. It was corrected before freezing inputs. The
first focused Vitest run failed during startup because its token cache was not
writable in the sandbox. Its replacement uses an owned local cache; no borrowed
dependency or user cache was modified. Those failures and resource holds remain
separate from passing results. Test cache tokens are excluded from the evidence
packet and never printed or hashed.

## Local startup follow-up

The normal `npm run dev:local` HTTP probe also now passes on the complete current
tested source: HTML and transformed entry respond, the browser OCR worker is
served, Paddle is configured from the existing cache, all cloud readers remain
disabled despite synthetic inherited credentials, client env values stay
filtered and existing private task paths return 403. This is the fresh
`qa-artifacts/local-startup-v4/` observation; earlier failed/held probes remain
unchanged. Startup waits at most 45 seconds for the same 2.5-GiB reserve. The
owned command tree is deliberately stopped after checks (its exit 1 is expected);
the probe succeeds and source hashes remain unchanged. No native inference or
receipt upload is involved. See [the local setup guide](LOCAL_DEVELOPMENT_SETUP.md).

The operator preview at `http://127.0.0.1:49774/` remains separate and serves
frozen `181a606` UI. Start the current source through VS Code's **Gather: local
readers (no cloud)** task to use the update; no dependency reinstall is needed.
No existing user tab or app was closed, no key read, credit spent, cloud receipt
sent, model downloaded or deployment performed. Protected states remain intact.

Raw records live under `qa-artifacts/capture-photo-quality-v1/`,
`capture-photo-quality-candidate-v1/`, `capture-photo-quality-reserve-v1/`,
`capture-photo-quality-implementation-v1/` and `capture-photo-quality-browser-v1/`.
The machine packet is `advanced-capture-photo-quality-v1.json`. Old source bytes
are archived before edits; never rerun an old exclusive output folder or weaken
its source checks. The full twelve-phase objective remains active.
