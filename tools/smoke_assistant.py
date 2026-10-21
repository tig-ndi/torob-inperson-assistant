"""Opt-in, one real BoxAPI request per invocation; never used by ordinary tests."""

import argparse
import asyncio
from contextlib import closing
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from apps.api.agent_usage import AgentError
from apps.api.assistant import AssistantService
from apps.api.catalogue import Catalogue
from apps.api.intent import AssistantRequest, QUESTIONS
from tools.prepare_data import normalize_text, sha256


ROOT = Path(__file__).resolve().parents[1]
CASES = {
    1: {'messages': [{'role': 'user', 'content': 'برای خرید کمک می‌خواهم ولی هنوز نگفتم دنبال چه کالایی هستم.'}],
        'status': 'needs_input', 'budget': None},
    2: {'messages': [{'role': 'user', 'content': 'یک گوشی برای استفاده روزمره می‌خواهم، حداکثر ده میلیون تومان.'}],
        'status': 'results', 'budget': '10000000'},
    3: {'messages': [{'role': 'user', 'content': 'می‌خواهم یک گوشی برای کارهای روزمره بخرم.'},
                     {'role': 'assistant', 'content': QUESTIONS['budget']},
                     {'role': 'user', 'content': 'سقف بودجه‌ام پانزده میلیون تومان است.'}],
        'status': 'results', 'budget': '15000000'},
}


async def smoke(case_number: int) -> dict:
    database = ROOT / '.local/catalogue.sqlite3'
    before = sha256(database)
    service = AssistantService.from_root(Catalogue(database), ROOT)
    case = CASES[case_number]
    request_id = str(uuid4())
    request = AssistantRequest(request_id=request_id, messages=case['messages'])
    evidence = {'evidence': 'real BoxAPI + host domain + real dataset; not deployed or a browser journey',
                'case': case_number, 'request_id': request_id, 'model': service.settings.model}
    try:
        result = await service.run(request)
        evidence.update(status=result['status'], query=result['query'], max_price_toman=result['max_price_toman'])
        assert result['status'] == case['status'], 'unexpected semantic outcome'
        assert result['max_price_toman'] == case['budget'], 'budget extraction did not match independent expectation'
        if case_number == 1:
            assert result['question'] == QUESTIONS['product_kind'], 'wrong clarification'
        else:
            assert 'گوشی' in normalize_text(result['query']), 'product kind lost in interpretation'
            products = result['products']['items']
            assert products, 'no source results for the known phone case'
            with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)) as connection:
                for product in products:
                    raw = connection.execute('SELECT persian_title FROM products WHERE product_id=?', (product['product_id'],)).fetchone()
                    assert raw and raw[0] == product['persian_title'], 'product is not source-backed'
                    assert connection.execute('SELECT 1 FROM offers WHERE product_id=? AND price_toman<=?',
                                              (product['product_id'], int(case['budget']))).fetchone(), 'budget condition is not source-backed'
            evidence['source_products_checked'] = len(products)
        evidence['passed'] = True
    except AgentError as exc:
        evidence.update(passed=False, error_code=exc.code)
    except AssertionError as exc:
        evidence.update(passed=False, semantic_failure=str(exc))
    with closing(service.ledger.connect()) as connection:
        row = connection.execute('SELECT state,prompt_tokens,completion_tokens,cost_usd,error_code FROM attempts WHERE request_id=?', (request_id,)).fetchone()
    evidence['attempt'] = dict(zip(['state', 'prompt_tokens', 'completion_tokens', 'reported_cost_usd', 'error_code'], row)) if row else None
    evidence['remaining_calls'] = service.ledger.remaining(service.settings.attempt_limit)
    evidence['snapshot_unchanged'] = before == sha256(database)
    assert evidence['snapshot_unchanged'], 'source snapshot changed'
    target = ROOT / f'.local/qa/assistant-live-case-{case_number}.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', required=True, help='Explicitly authorize ONE billable request.')
    parser.add_argument('--case', type=int, choices=CASES, required=True)
    evidence = asyncio.run(smoke(parser.parse_args().case))
    print(json.dumps(evidence, ensure_ascii=True))
    raise SystemExit(0 if evidence['passed'] else 1)
