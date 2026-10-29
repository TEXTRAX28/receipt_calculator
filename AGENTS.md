# Local codebase graph

Use this repository's `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md`
first for codebase questions. The parent cross-project graph does not cover this
repository. Query a relevant subgraph instead of reading the whole source tree:

```powershell
python scripts/update-graph.py --check
python -m graphify query "<concept or symbol>" --budget 1500
```

If stale or missing, refresh with `python scripts/update-graph.py`. This extracts
code locally with no LLM calls, supports `.mjs`, resolves extensionless TypeScript
imports, removes deleted code, and reuses unchanged documentation extraction.
Use this wrapper rather than native `graphify update`, which misses those imports.
Rebuild after changing indexed source files.

Use graph nodes, edges and communities to locate the relevant source. Cite the
node's `source_file` and `source_location`; verify the relevant lines before
editing or making detailed behavioral claims. The graph is a navigation aid;
documentation can lag current source. CSS, HTML and JSON configuration are not
AST-indexed, so inspect those files directly when needed.

If refresh reports missing documentation extraction, use the graphify skill to
extract only those documents and run the wrapper with `--semantic <fragment.json>`.
Include `source_hashes` (relative path to SHA256 of the bytes read) in the fragment
so concurrent documentation changes are detected before caching.
Do not treat missing semantic nodes as evidence that a concept does not exist.

Generated graphs and `.graphify` scratch files stay local and are gitignored.
