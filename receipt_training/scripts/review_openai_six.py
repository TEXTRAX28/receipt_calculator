"""Frozen-reference native-field scoring; no provider calls or financial repairs."""
from pathlib import Path
import hashlib,json,sys
from decimal import Decimal
from math import ceil
from review_gemini35_screening import project,empty_view,aggregate
from review_veryfi_screening import compare
ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'qa-artifacts/provider-review/openai-six-v1'
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def main():
 plan=json.loads((FOLDER/'plan.json').read_bytes())
 assert all(sha(ROOT/name)==h for name,h in plan['source_sha256'].items())
 assert sha(FOLDER/'labels.jsonl')==plan['labels_sha256']
 assert sha(FOLDER/'scoring-config.json')==plan['scoring_config_sha256']
 labels={v['receipt_id']:v for v in map(json.loads,(FOLDER/'labels.jsonl').read_text(encoding='utf-8').splitlines())}
 assert len(labels)==6 and all(c['receipt_id'] in labels for c in plan['cases'])
 if '--check-plan' in sys.argv:
  print(json.dumps({'cases':6,'reference_items':sum(len(v['items']) for v in labels.values()),'labels_sent_to_model':False,'new_provider_requests':0}));return
 run=FOLDER/'run';meta=json.loads((run/'metadata.json').read_bytes());config=json.loads((FOLDER/'scoring-config.json').read_bytes())
 scope=json.loads((run/'scope.json').read_bytes());approval=json.loads((FOLDER/'authorization.json').read_bytes())
 assert scope['plan_sha256']==approval['plan_sha256']==sha(FOLDER/'plan.json')
 assert scope['approval']==approval and approval['approved_by_user'] and approval['use_credits']
 assert approval['model']==meta['model']==plan['model']=='gpt-6-astra' and approval['posts']==6
 assert meta['plan_sha256']==sha(FOLDER/'plan.json') and len(meta['cases'])==6 and meta['provider_requests']<=6 and meta['retries']==0
 results=[];evidence={};usage=[];latencies=[];currencies=0
 for c,r in zip(plan['cases'],meta['cases']):
  assert c['receipt_id']==r['receipt_id'] and c['case']==r['case']
  if r['status']=='strict-schema-passed':
   draft=json.loads((run/(c['case']+'-receipt.json')).read_bytes())
   response=json.loads((run/(c['case']+'-response.json')).read_bytes())
   text=[part['text'] for out in response['output'] if out['type']=='message' for part in out['content'] if part['type']=='output_text']
   assert response['status']=='completed' and len(text)==1 and json.loads(text[0])==draft
   view=project(draft)
  else:view=empty_view()
  if isinstance(r.get('elapsed_ms'),int) and r['elapsed_ms']>=0:latencies.append(r['elapsed_ms'])
  response_path=run/(c['case']+'-response.json')
  if response_path.is_file():
   tokens=json.loads(response_path.read_bytes()).get('usage',{})
   if all(type(tokens.get(k)) is int and tokens[k]>=0 for k in ['input_tokens','output_tokens']):usage.append(tokens)
  currencies+=int(view.get('returned_currency_not_used_for_scoring')==labels[c['receipt_id']]['currency']['value'])
  result=compare(labels[c['receipt_id']],view,config);result.update(case=c['case'],receipt_id=c['receipt_id'],adapter_status=r['status'],returned_currency=view.get('returned_currency_not_used_for_scoring'))
  results.append(result)
 for path in FOLDER.rglob('*'):
  if path.is_file():evidence[path.relative_to(ROOT).as_posix()]=sha(path)
 input_tokens=sum(u['input_tokens'] for u in usage);output_tokens=sum(u['output_tokens'] for u in usage)
 cost={'usage_responses':len(usage),'attempted_without_usage':meta['provider_requests']-len(usage),'input_tokens':input_tokens,'output_tokens':output_tokens,'ordinary_uncached_standard_estimate_usd':str((Decimal(input_tokens)*10+Decimal(output_tokens)*50)/1_000_000),'all_input_12h_cache_write_sensitivity_usd':str((Decimal(input_tokens)*25+Decimal(output_tokens)*50)/1_000_000),'actual_charge_verified':False,'failed_requests_may_still_cost':True,'pricing_source':plan['pricing_source'],'pricing_checked_at':plan['pricing_checked_at']}
 timing={'case_adapter_and_local_io_ms':latencies,'mean_ms':sum(latencies)/len(latencies) if latencies else None,'sample_p95_ms':sorted(latencies)[ceil(.95*len(latencies))-1] if latencies else None,'scope':'Small six-crop sample, excluding inter-request spacing; not whole-receipt, handset or robust provider p95.'}
 report={'model':'gpt-6-astra','scope':'Same six familiar identifier-reduced crops and unchanged partial reference/matcher; failed and unattempted cases remain in all-case denominators. Not independent or complete-receipt truth.','results':results,'aggregate':aggregate(results),'correct_returned_currencies':currencies,'cost':cost,'timing':timing,'evidence_sha256':evidence,'automatic_financial_repairs':0,'scorer_provider_requests':0}
 output=ROOT/'receipt_training/evaluation/advanced-openai-six-result-v1.json'
 with output.open('x',encoding='utf-8',newline='\n') as f:json.dump(report,f,indent=2)
 print(json.dumps({'report':str(output),'aggregate':report['aggregate']}))
if __name__=='__main__':main()
