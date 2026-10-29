"""Refresh the local Graphify index, including .mjs and TS extensionless imports.

Requires graphifyy (verified with 0.4.12). Code extraction uses no LLM.
Documentation extraction is supplied by the Graphify skill and cached locally.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys

import graphify.detect as detection
import graphify.extract as extraction
from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cache import check_semantic_cache, save_semantic_cache
from graphify.cluster import cluster, score_all
from graphify.export import to_html, to_json
from graphify.report import generate


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "graphify-out"
SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs")
COMMUNITY_NAMES = {
    "README": "Documented Design and Rationale",
    "IMPLEMENTATION_AND_SECURITY": "Documented Verification and Security",
    "money": "Exact Money Arithmetic",
    "engine": "Tax and Split Allocation",
    "App": "Receipt Editing Workflow",
    "gemini": "Gemini Receipt Extraction",
    "receipt-api": "Gemini Receipt Extraction",
    "images": "Image Validation and Preparation",
    "model": "Draft Models and Persistence",
    "parser": "OCR and Receipt Parsing",
    "demo": "Receipt Fixtures and Scenarios",
    "main": "Application Startup and Errors",
    "journeys.spec": "Receipt Journey Tests",
    "prepare-ocr": "OCR Asset Preparation",
    "ocr.spec": "Browser OCR Tests",
    "phone-layout.spec": "Phone Layout Tests",
    "playwright.config": "Playwright Browser Configuration",
    "visual-and-robustness.spec": "Visual and Robustness Tests",
}


def resolve_import(node, source, file_id, stem, edges, source_file):
    """Keep Graphify's import evidence but resolve it to a real local file ID."""
    before = len(edges)
    extraction._import_js(node, source, file_id, stem, edges, source_file)
    if len(edges) == before:
        return
    raw = next(
        (extraction._read_text(child, source).strip("'\"` ")
         for child in node.children if child.type == "string"),
        "",
    )
    if not raw.startswith("."):
        return
    path = (ROOT / source_file).parent / raw
    candidates = [path]
    if not path.suffix:
        candidates += [Path(str(path) + suffix) for suffix in SUFFIXES]
        candidates += [path / ("index" + suffix) for suffix in SUFFIXES]
    elif path.suffix in (".js", ".jsx"):
        candidates += [path.with_suffix(".ts"), path.with_suffix(".tsx")]
    for candidate in candidates:
        try:
            relative = candidate.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            continue
        if relative in CODE_FILES:
            edges[-1]["target"] = extraction._make_id(relative)
            break


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check freshness without rebuilding")
    parser.add_argument("--semantic", type=Path, help="Cache a new Graphify documentation fragment")
    args = parser.parse_args()
    os.chdir(ROOT)
    detection.CODE_EXTENSIONS.add(".mjs")
    corpus = detection.detect(Path("."))
    files = [Path(p) for paths in corpus["files"].values() for p in paths]
    tracked = files + [Path(".graphifyignore"), Path("scripts/update-graph.py")]
    hashes = {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in tracked}
    state_file = OUT / "state.json"
    if args.check:
        state = json.loads(state_file.read_text(encoding="utf-8")) if state_file.exists() else {}
        fresh = (state.get("hashes") == hashes and not state.get("missing_semantic")
                 and all((OUT / name).exists() for name in ("graph.json", "GRAPH_REPORT.md", "graph.html")))
        print("Graph is current." if fresh else "Graph is missing, stale, or awaiting documentation extraction; run python scripts/update-graph.py.")
        return 0 if fresh else 1
    if not files or corpus["total_files"] > 200 or corpus["total_words"] > 2_000_000:
        raise SystemExit("Check the corpus scope in .graphifyignore before building.")
    print(f"Corpus: {corpus['total_files']} files, ~{corpus['total_words']:,} words")
    if corpus["warning"]:
        print(corpus["warning"])
    if corpus["skipped_sensitive"]:
        print(f"Skipped {len(corpus['skipped_sensitive'])} sensitive files.")
    OUT.mkdir(exist_ok=True)
    new_semantic = {}
    if args.semantic:
        new_semantic = json.loads(args.semantic.read_text(encoding="utf-8-sig"))
        if any(hashes.get(path) != expected for path, expected in new_semantic.get("source_hashes", {}).items()):
            raise SystemExit("Documentation changed during extraction; regenerate its semantic fragment.")
        save_semantic_cache(new_semantic["nodes"], new_semantic["edges"], new_semantic.get("hyperedges", []))
    semantic_files = [p for kind, paths in corpus["files"].items() if kind != "code" for p in paths]
    sem_nodes, sem_edges, hyperedges, uncached = check_semantic_cache(semantic_files)
    if uncached:
        print(f"Documentation extraction needed for {len(uncached)} files: run /graphify --update.")
    global CODE_FILES
    CODE_FILES = {Path(p).as_posix() for p in corpus["files"]["code"]}
    extraction._JS_CONFIG.import_handler = resolve_import
    extraction._TS_CONFIG.import_handler = resolve_import
    nodes, edges = [], []
    for source in sorted(CODE_FILES):
        path = Path(source)
        fragment = extraction.extract_js(path) if path.suffix in SUFFIXES else extraction.extract([path])
        if "error" in fragment or not fragment.get("nodes"):
            raise SystemExit(f"AST extraction failed for {source}: {fragment.get('error', 'no nodes')}")
        nodes.extend(fragment["nodes"])
        edges.extend(fragment["edges"])
    for item in nodes + edges:
        item["source_file"] = Path(item["source_file"]).as_posix()
    file_ids = {source: extraction._make_id(source) for source in CODE_FILES}
    for node in sem_nodes:
        target = file_ids.get(node.get("referenced_source_file"))
        if target:
            sem_edges.append(dict(source=node["id"], target=target, relation="references",
                                  confidence="EXTRACTED", confidence_score=1.0, weight=1.0,
                                  source_file=node["source_file"], source_location=node["source_location"]))
    nodes = list({n["id"]: n for n in nodes + sem_nodes}.values())
    ids = {n["id"] for n in nodes}
    edges = [e for e in edges + sem_edges if e["source"] in ids and e["target"] in ids]
    for edge in edges:
        edge.setdefault("confidence_score", 1.0 if edge["confidence"] == "EXTRACTED" else 0.8)
    graph = build_from_json(dict(nodes=nodes, edges=edges, hyperedges=hyperedges))
    communities = cluster(graph)
    labels = {}
    for cid, members in communities.items():
        hub = max(members, key=lambda n: graph.degree(n))
        name = Path(graph.nodes[hub]["source_file"]).stem
        labels[cid] = COMMUNITY_NAMES.get(name, name.replace("-", " ").replace("_", " ") + " concepts")
    graph.graph.update(indexed_at=datetime.now(timezone.utc).isoformat(), root=str(ROOT),
                       community_labels=labels, missing_semantic=uncached)
    tokens = {"input": new_semantic.get("input_tokens", 0), "output": new_semantic.get("output_tokens", 0)}
    cost_file = OUT / "cost.json"
    cost = json.loads(cost_file.read_text(encoding="utf-8")) if cost_file.exists() else {"runs": [], "total_input_tokens": 0, "total_output_tokens": 0}
    cost["runs"].append(dict(date=graph.graph["indexed_at"], input_tokens=tokens["input"],
                             output_tokens=tokens["output"], token_usage_estimated=True, files=len(files)))
    cost["total_input_tokens"] += tokens["input"]
    cost["total_output_tokens"] += tokens["output"]
    cohesion = score_all(graph, communities)
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)
    report = generate(graph, communities, cohesion, labels, gods, surprises, corpus, tokens, str(ROOT), suggested_questions=questions)
    # The stock report hides file/test nodes and links to an ungenerated Obsidian vault.
    # Keep this report's community counts and navigation consistent with graph.json.
    navigation = "\n".join(f"- Community {cid}: {labels[cid]}" for cid in communities)
    sections = []
    for cid, members in communities.items():
        ordered = sorted(members, key=lambda n: graph.degree(n), reverse=True)
        citations = [f"`{graph.nodes[n]['label']}` ({graph.nodes[n]['source_file']}:{graph.nodes[n]['source_location']})" for n in ordered[:8]]
        sections.append(f"### Community {cid} - {labels[cid]}\n\nNodes: {len(members)}; cohesion: {cohesion[cid]}\n\n" + "\n".join("- " + c for c in citations))
    report = re.sub(r"## Community Hubs \(Navigation\).*?(?=\n## )", "## Community Hubs (Navigation)\n\n" + navigation + "\n", report, count=1, flags=re.S)
    report = re.sub(r"## Communities\n.*?(?=\n## )", "## Communities\n\n" + "\n\n".join(sections) + "\n", report, count=1, flags=re.S)
    report += ("\n## Index limitations\n\nCode uses deterministic AST extraction; refreshes make no LLM calls. "
               "Documentation tokens are character-based estimates, not provider billing. "
               f"Cumulative semantic estimate: {cost['total_input_tokens']:,} input / {cost['total_output_tokens']:,} output. "
               "Chat orchestration tokens are not measured. Documentation claims can lag source changes. "
               "CSS, HTML and JSON configuration are outside this AST index; verify those files directly when relevant. "
               "Community cohesion describes the graph; it is not a refactoring recommendation.\n")
    if uncached:
        report += f"\nMissing current semantic extraction: {', '.join(uncached)}.\n"
    (OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(graph, communities, str(OUT / "graph.json"))
    if len(graph) <= 5000:
        to_html(graph, communities, str(OUT / "graph.html"), community_labels=labels)
    else:
        print("Graph exceeds 5,000 nodes; HTML visualization skipped.")
    detection.save_manifest(corpus["files"])
    cost_file.write_text(json.dumps(cost, indent=2), encoding="utf-8")
    state_file.write_text(json.dumps(dict(hashes=hashes, missing_semantic=uncached), indent=2), encoding="utf-8")
    print(f"Graph: {len(graph)} nodes, {graph.number_of_edges()} edges, {len(communities)} communities")
    print(f"Outputs: {OUT}")
    return 1 if uncached else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
