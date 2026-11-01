"""Seal same-reading recovery and saved Azure geometry evidence, without requests."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sys

from build_printed_provider_checkpoint import field_score
from score_adjustments import score_with_adjustments

ROOT=Path(__file__).resolve().parents[2]
RUN=ROOT/"qa-artifacts/invalid-line-recovery-v2"
AZURE=ROOT/"qa-artifacts/provider-review/azure-screening-v1"
OUT=ROOT/"receipt_training/evaluation/advanced-source-price-recovery-v2.json"
CAPTURE=ROOT/"qa-artifacts/source-price-summary-v2"
HASHES={}


def remember(path,expected=None):
    raw=path.read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    assert expected is None or digest==expected,str(path)
    HASHES[path.relative_to(ROOT).as_posix()]=digest
    return raw


def load(path,expected=None): return json.loads(remember(path,expected))
def lines(path,expected=None): return list(map(json.loads,remember(path,expected).decode("utf-8").splitlines()))
def folder(path):
    for item in sorted(path.rglob("*")):
        if item.is_file(): remember(item)


def main():
    if "--check" in sys.argv:
        for name,expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items(): remember(ROOT/name,expected)
        print(json.dumps({"verified_files":len(HASHES),"new_external_requests":0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(),"Preserve published evidence"
    meta=load(RUN/"replay/metadata.json")
    assert meta["predictions"]==200 and meta["new_model_requests"]==meta["external_requests"]==0
    assert meta["unrelated_financial_vectors_unchanged"] and meta["recovery_checks_unconfirmed"]
    for variant,sources in meta["source_sha256"].items():
        for name,expected in sources.items():
            remember(RUN/variant/name,expected)
            if variant=="after": remember(ROOT/name,expected)
    for variant,sources in meta["loaded_frozen_source_sha256"].items():
        for name,expected in sources.items(): assert meta["source_sha256"][variant][name]==expected
    for name,expected in meta["input_sha256"].items(): remember(ROOT/name,expected)
    remember(RUN/"replay/runner.mjs",meta["runner_sha256"])
    rows=lines(RUN/"replay/predictions.jsonl",meta["predictions_sha256"])
    plan=load(ROOT/"qa-artifacts/row-first-original50-v1/plan.json")
    cases={case["id"]:case["record"] for case in plan["cases"]}
    config=load(ROOT/"receipt_training/evaluation/config.json")
    labels={row["receipt_id"]:row for row in lines(ROOT/"receipt_training/annotations/private/priced-rows-v4-labels.jsonl")}
    scores=[]
    for row in rows:
        scores.append({"variant":row["variant"],"mode":row["mode"],**score_with_adjustments(cases[row["receipt_id"]],labels[row["receipt_id"]],row,config)})
    totals={}
    for split in ("all","development","evaluation"):
        totals[split]={mode:{variant:dict(sum((Counter(row["counts"]) for row in scores if row["mode"]==mode and row["variant"]==variant and (split=="all" or row["split"]==split)),Counter()))
            for variant in ("before","after")} for mode in ("automatic","known-currency")}
    regressions=[]
    for before in (row for row in scores if row["variant"]=="before"):
        after=next(row for row in scores if row["variant"]=="after" and row["receipt_id"]==before["receipt_id"] and row["mode"]==before["mode"])
        for field in set(before["counts"])|set(after["counts"]):
            old,new=before["counts"].get(field,0),after["counts"].get(field,0)
            if (field.endswith("_correct") or field=="matched_items") and new<old:
                regressions.append({"receipt_id":before["receipt_id"],"mode":before["mode"],"field":field,"before":old,"after":new})
            if field in ("missing_items","extra_items_on_complete_labels","unmatched_predictions","processing_errors") and new>old:
                regressions.append({"receipt_id":before["receipt_id"],"mode":before["mode"],"field":field,"before":old,"after":new})
    proposals=[]
    for row in rows:
        for proposal in row.get("priceRecoveries",[]):
            assert row["variant"]=="after"
            item=next(item for item in row["receipt"]["items"] if item["id"]==proposal["itemId"])
            assert any(check.get("itemId")==item["id"] and check["field"]=="lineTotal" and check["reason"]=="recovered" and check["confirmedValue"]=="" for check in row["receipt"]["reviewChecks"])
            proposals.append({"receipt_id":row["receipt_id"],"mode":row["mode"],"before":proposal["evidence"]["previous"],"after":item["lineTotal"],"literal":proposal["evidence"]["literal"],"word_confidence":proposal["evidence"]["word"]["confidence"]})
    crop_labels={row["receipt_id"]:row for row in lines(ROOT/"qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl")}
    crop_totals=defaultdict(Counter)
    crop_scores=[]
    for run in ("word-comparison-v1","word-comparison-oriented-v1","word-comparison-recovery-v1"):
        path=AZURE/run
        metadata=load(path/"metadata.json")
        assert metadata["new_model_requests"]==metadata["external_requests"]==0 and metadata["predictions"]==60
        for name,expected in metadata["input_sha256"].items(): remember(ROOT/name,expected)
        for name,expected in metadata["source_sha256"].items(): remember(path/"source"/Path(name).name,expected)
        for name,expected in metadata["loaded_frozen_source_sha256"].items(): assert metadata["source_sha256"][name]==expected
        remember(path/"processor.mjs",metadata["processor_sha256"])
        for row in lines(path/"predictions.jsonl",metadata["predictions_sha256"]):
            assert row["trusted"] is False
            result=field_score(crop_labels[row["receipt_id"]],row,config)
            count=crop_totals[run+"/"+row["method"]+"/"+row["mode"]]
            count.update({key:result[key] for key in ("expected_purchases","proposed_rows","matched_purchase_names","exact_normalized_descriptions")})
            for field,values in result["field_equality"].items(): count.update({field+"_"+key:value for key,value in values.items()})
            count["copied_final_total_correct"]+=result["document_equality"]["printedTotal"] is True
            count["coupon_correct"]+=result["nonzero_coupons_on_matched_purchase"]["correct"]
            crop_scores.append({"run":run,"method":row["method"],"mode":row["mode"],"case":row["case"],"receipt_id":row["receipt_id"],"result":result})
    horizontal=lines(AZURE/"word-layout-v1/recognition.jsonl")
    oriented=lines(AZURE/"word-layout-oriented-v1/recognition.jsonl")
    for before,after in zip(horizontal,oriented,strict=True):
        assert before["case"]==after["case"] and before["image_sha256"]==after["image_sha256"]
        a,b=before["recognition"]["panels"][0],after["recognition"]["panels"][0]
        assert a["words"]==b["words"]
        assert Counter(i for row in after["derived_row_word_indices"] for i in row)==Counter(range(len(b["words"])))
    for run in ("word-layout-v1","word-layout-oriented-v1"):
        metadata=load(AZURE/run/"metadata.json")
        for name,expected in metadata["evidence_sha256"].items(): remember(ROOT/name,expected)
        folder(AZURE/run)
    native=[]
    for run in ("invalid-price-native-phone-v1","invalid-price-native-phone-v2"):
        path=ROOT/"qa-artifacts"/run
        metadata=load(path/"execution.json")
        assert metadata["source_unchanged"] and metadata["external_uploads"]==0
        folder(path)
        native.append({"run":run,"exit_code":metadata["exit_code"],"started_at":metadata["started_at"],"completed_at":metadata["completed_at"]})
    ui=load(ROOT/"qa-artifacts/invalid-price-native-phone-v2/ui/result.json")
    assert ui["recoveries"]==5 and not ui["financial_fields_edited"] and ui["external_requests"]==0
    assert ui["posts"]==["/api/receipts/recognize","/api/receipts/vision"] and not ui["blocked"]
    test_log=remember(ROOT/"qa-artifacts/azure-word-geometry-tests-v2.log").decode("utf-8")
    assert "Ran 9 tests" in test_log and "\nOK" in test_log
    CAPTURE.mkdir()
    for source in (Path(__file__),Path(__file__).with_name("score.py"),Path(__file__).with_name("score_adjustments.py"),Path(__file__).with_name("build_printed_provider_checkpoint.py"),Path(__file__).with_name("test_azure_word_geometry.py")):
        target=CAPTURE/source.name;target.write_bytes(source.read_bytes());remember(target)
    (CAPTURE/"detail-scores.json").write_text(json.dumps({"original_fifty":scores,"six_crop_variants":crop_scores},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    remember(CAPTURE/"detail-scores.json")
    report={"scope":"Same saved readings through frozen before/after verification on all original fifty. Separate six-crop Azure word-geometry ablation and retained independent Qwen controls. No new model/API calls in replays; actual native phone observations are separately recorded.",
        "original_fifty_counts":totals,"known_field_regressions":regressions,"proposals":proposals,
        "crop_counts":{key:dict(value) for key,value in crop_totals.items()},
        "original_transactions":50,"original_split_membership":"38 development / 12 evaluation; unchanged, already inspected, not a blind holdout",
        "original_replay_views":200,"six_crop_replay_views":180,"new_replay_model_requests":0,"new_external_requests":0,
        "unrelated_financial_vectors_unchanged":True,"every_recovery_requires_review":True,"geometry_word_content_boxes_confidence_unchanged":True,
        "native_phone_observations":native,"successful_native_scan_to_review_ms":ui["elapsed_ms"],"successful_native_recoveries":5,
        "limits":["The eleven original-fifty gains require explicit post-extraction currency. Automatic-currency results stay unchanged; selected currency is not automatic recognition or conversion.",
            "Only invalid nonempty model line prices qualify. Valid conflicts, unresolved/different currencies, unit-only headers, uncertain identity, ambiguous duplicate matches, sign changes and insufficient word confidence are left unresolved. A proposal is never independent agreement or financial acceptance.",
            "Same source data and predicates do not make an LLM's self-confidence proof. Word confidence is advisory, not calibrated correctness. All fifty complete financial results remain unscorable with the current truth.",
            "The six source-informed Azure crops are a tuned development screen, not unseen-document validation. No app Azure reader/engine is registered. Cropped Qwen controls predate the row-first model grammar; original-fifty controls use its retained row-first candidates.",
            "Oriented Azure words recover25/25 known prices as a primary draft with explicit currency. The existing hybrid remains22/25 on these crops: unmatched/polluted names, size conflicts and low word confidence withhold recovery. No test result is discarded because it is worse.",
            "First actual phone run reached correct prices/source view but failed an ambiguous test close selector; its artifacts remain. A scoped-selector rerun passed. The 84.57-second observation is not a p95, speed ratio, physical-device or complete-financial result.",
            "Both native phone observations precede the isolated final guard against recovery when long-receipt batches disagree on currency. The final saved-reading replay verifies the ordinary path; matching/conflicting batch behavior is tested synthetically, not by another native receipt run.",
            "No image pixels were deskewed or warped. Geometry groups real word edges and preserves original source boxes, every word and genuine repeated purchases. No perspective-correction or general camera-quality claim."],
        "evidence_sha256":HASHES}
    with OUT.open("x",encoding="utf-8",newline="\n") as output: output.write(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"verified_files":len(HASHES),"original_price_counts":{mode:{variant:totals['all'][mode][variant].get('item_price_correct',0) for variant in ('before','after')} for mode in ('automatic','known-currency')},"original_proposals":len(proposals),"known_field_regressions":regressions,"native_recoveries":ui['recoveries'],"new_external_requests":0}))


if __name__=="__main__": main()
