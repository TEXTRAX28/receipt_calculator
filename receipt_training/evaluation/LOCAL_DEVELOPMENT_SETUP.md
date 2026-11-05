# Local-only VS Code development

5 November 2026. Base checkpoint: `a0716f1` on
`feature/advanced-ocr-vision-ai`. This change provides a normal development
command for the current source; it changes no receipt parser, calculation,
provider prompt or reader selection default.

## Run the prepared checkout

Open `C:/Users/natan/.codex/worktrees/primary-worker-memory/costco_calc` in
VS Code. Choose **Terminal → Run Task → Gather: local readers (no cloud)**.
The ignored `.vscode/tasks.json` supplies the existing Python interpreter and
verified model-cache directory, disables experimental local vision, and runs
`npm.cmd run dev:local -- --port 5175`. Open the Local URL printed by Vite and
keep the terminal open. Stop that task with Ctrl+C. The task file is specific
to this computer and is deliberately uncommitted.

Use Node 24 LTS or 22.18+ for the new native config loader. Dependencies are
already installed through a junction to the protected baseline; do not run
`npm ci`, install or remove dependencies in this borrowed checkout. Normal
preparation copies browser OCR/PDF assets into this checkout's ignored public
directories, reads installed packages, and downloads no models. Enhanced
browser models remain an optional separate setup.

## Implementation

`dev:local` uses Vite's `local-only` mode and native TypeScript configuration
loader. The environment selector reads only four trusted local-reader settings;
dotenv loading is disabled, and no inherited `VITE_` settings enter client
modules. Every cloud key and allowance remains unavailable to the readers.
Ordinary `npm run dev` keeps its existing dotenv behavior.

`LOCAL_OCR_CACHE_ROOT` configures the computer OCR reader's existing cache
parameter. Its default remains `receipt_training/.cache`; experimental local
vision keeps its own setup. Cache paths cannot be supplied through HTTP.
Vite's generated dependency cache is now this checkout's ignored `.vite/`,
and private-file HTTP rules also deny `.vscode/`. Optimized dependency files
remain accessible because Vite needs to serve them to its browser client.

The private HTTP test uses uniquely owned system temporary directories instead
of writing into the borrowed `node_modules` junction, with verified containment
before recursive cleanup.

## Verification and limits

All twelve focused startup/security cases pass, including two new environment
cases, actual HTTP denial of existing synthetic secret files through direct,
encoded and absolute paths, plus the existing upload/storage checks. Complete
strict TypeScript and formatting checks pass on the current source. Existing
financial/UI source remains unchanged; the earlier 1,457-case unit result and
current native upload-to-split preview result remain separate historical
evidence, not newly rerun tests.

The actual `npm run dev:local` command started Vite 8.3.5 on port 5175 with the
prepared interpreter/cache. Assertions confirmed the computer reader configured,
all cloud readers disabled despite synthetic inherited credentials/allowances,
filtered client environment and transformed frontend entry. Both existing
direct/encoded private task requests were denied. This preliminary HTTP run
then failed a harness assertion that incorrectly demanded HTTP 403 for an
absent `.env.local`; Vite returned SPA HTML, not a secret. The unit test separately
passes denial of a real synthetic dotenv file. An earlier probe timed out
because its readiness detector did not strip ANSI color sequences from Vite's
port number. Neither issue required a product change. These failed probes are
retained and are not reported as overall passes.

The corrected full HTTP probe is prepared at
`qa-artifacts/local-startup-v3/probe.py`. It has been held by the unchanged
2.5-GiB startup reserve before starting a child. Two subsequent attempts also
hit an exclusive held-record filename collision before starting; the prepared
script now gives each refusal a unique timestamp without replacing history.
The remaining worker-file HTTP assertion and a clean overall corrected-probe
pass are pending. No new browser, native inference, receipt accuracy, physical
phone or production deployment result is claimed by this change.

The intentional review preview at `http://127.0.0.1:49774/` remains running and
serves frozen `181a606` UI. The test servers were stopped using only their owned
process trees. No user app was closed, no cloud key read, no receipt uploaded,
no credit spent, no dependency installed and no model downloaded. The stable
branch and both protected checkouts remain unchanged.

Raw evidence lives in `qa-artifacts/local-startup-v1/`, `v2/` and `v3/` with
separate names for held/failed/successful checks. Resource thresholds were never
lowered. The complete twelve-phase objective remains active and incomplete.

Official references: [Vite configuration](https://vite.dev/config/),
[environment and cache options](https://vite.dev/config/shared-options.html),
and [VS Code tasks](https://code.visualstudio.com/docs/debugtest/tasks).
