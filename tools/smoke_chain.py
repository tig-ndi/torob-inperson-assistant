"""P2/P3 chain smoke on the real snapshot with a synthetic provider and no contact.

Need -> budget edit with preserved need_state -> source offer -> unsent draft
-> simulated outcome -> same-product alternatives under the same budget.
"""

import json
from pathlib import Path
import tempfile
import time
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from apps.api.agent_usage import UsageLedger
from apps.api.assistant import AgentSettings, AssistantService, BoxProvider
from apps.api.catalogue import Catalogue
from apps.api.main import ROOT, create_app
from tools.prepare_data import sha256

FORBIDDEN_KEYS = {'contacts', 'phone', 'telephone', 'mobile', 'website_url', 'instagram',
                  'whatsapp', 'telegram'}
FORBIDDEN_TEXT = ('tel:', 'wa.me', 'whatsapp.com', 't.me/')


def keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key.lower()
            yield from keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from keys(child)


def assert_no_contact(value):
    assert not (set(keys(value)) & FORBIDDEN_KEYS)
    text = json.dumps(value, ensure_ascii=False).lower()
    for marker in FORBIDDEN_TEXT:
        assert marker not in text, marker


def completion(plan):
    return {
        'choices': [{'finish_reason': 'stop',
                     'message': {'content': json.dumps(plan, ensure_ascii=False)}}],
        'usage': {'prompt_tokens': 100, 'completion_tokens': 40},
        'cost': 0,
    }


def collect_offers(client, product_id, budget):
    items = []
    offset = 0
    while True:
        response = client.get(f'/api/products/{product_id}/offers', params={
            'limit': 50, 'offset': offset, 'max_price_toman': budget, 'sort_by': 'price'})
        assert response.status_code == 200, response.text
        body = response.json()
        items.extend(body['items'])
        if not body['has_more']:
            return items
        offset += 50
        assert offset < 500, 'offer pagination did not terminate'


def collect_alternatives(client, payload):
    items = []
    offset = 0
    while True:
        response = client.post('/api/followups/alternatives', json={
            **payload, 'limit': 50, 'offset': offset})
        assert response.status_code == 200, response.text
        body = response.json()
        items.extend(body['alternatives']['items'])
        if not body['alternatives']['has_more']:
            return body, items
        offset += 50
        assert offset < 500, 'alternative pagination did not terminate'


def smoke(database: Path) -> dict:
    before = sha256(database)
    started = time.monotonic()
    checks = 0
    calls = []
    plans = [
        {'action': 'search', 'query': 'گوشی', 'budget_text': None, 'question': None},
        {'action': 'search', 'query': 'گوشی', 'budget_text': None, 'question': None},
    ]

    def provider(request):
        calls.append(request)
        assert len(calls) <= len(plans), 'unexpected extra provider request'
        return httpx.Response(200, json=completion(plans[len(calls) - 1]))

    with tempfile.TemporaryDirectory() as temporary:
        settings = AgentSettings(True, 'synthetic-key', model='gpt-5-mini', attempt_limit=3)
        service = AssistantService(Catalogue(database), settings,
                                   UsageLedger(Path(temporary) / 'usage.sqlite3'),
                                   BoxProvider(settings, httpx.MockTransport(provider)))
        with TestClient(create_app(database, assistant=service)) as client:
            def turn(text, **extra):
                response = client.post('/api/assistant/turn', json={
                    'request_id': str(uuid4()),
                    'messages': [{'role': 'user', 'content': text}], **extra})
                assert response.status_code == 200, response.text
                return response.json()

            first = turn('گوشی تا هشت میلیون تومان می‌خواهم')
            assert first['status'] == 'results', first
            assert first['max_price_toman'] == '8000000', first
            assert first['need_state']['max_price_toman'] == '8000000', first['need_state']
            assert first['need_state']['topic_query'] == 'گوشی', first['need_state']
            assert first['products']['items'], 'no real products for the initial need'
            checks += 1

            second = turn('بودجه را چهار میلیون کن', context_need_state=first['need_state'])
            assert second['status'] == 'results', second
            assert second['max_price_toman'] == '4000000', second
            assert second['need_state']['max_price_toman'] == '4000000', second['need_state']
            for field in ('topic_query', 'category_name', 'category_cleared', 'offer_sort',
                          'battery_requirement', 'review_topics', 'pending_requirements'):
                assert second['need_state'][field] == first['need_state'][field], field
            assert second['products']['items'], 'context was lost after the budget edit'
            checks += 1

            candidates = []
            for product in second['products']['items']:
                offers = collect_offers(client, product['product_id'], second['max_price_toman'])
                shops = {item['shop_id'] for item in offers}
                if len(shops) >= 2:
                    candidates.append((len(shops), len(offers), product['product_id'], offers))
            assert candidates, 'no real product has offers from two shops under the budget'
            _, _, product_id, offers = max(candidates, key=lambda item: (item[0], item[1], item[2]))

            by_shop = {}
            for item in offers:
                by_shop.setdefault(item['shop_id'], []).append(item)
            reported_shop, reported_offers = min(by_shop.items(),
                                                 key=lambda item: (len(item[1]), item[0]))
            offer = reported_offers[0]
            assert all(item['product_id'] == product_id for item in offers)
            checks += 1

            prepared = client.post('/api/followups/prepare', json={
                'product_id': product_id, 'offer_id': offer['offer_id'],
                'shop_id': reported_shop})
            assert prepared.status_code == 200, prepared.text
            draft = prepared.json()
            assert draft['status'] == 'prepared'
            assert draft['selected_offer']['product_id'] == product_id
            assert draft['draft']['delivery_status'] == 'draft_not_sent'
            assert draft['draft']['contact_channel_available'] is False
            assert draft['draft']['external_contact_attempted'] is False
            assert_no_contact(draft)
            checks += 1

            payload = {
                'product_id': product_id, 'offer_id': offer['offer_id'],
                'shop_id': reported_shop, 'outcome': 'no_answer',
                'outcome_source': 'simulated',
                'max_price_toman': second['max_price_toman'], 'sort_by': 'price',
            }
            alternatives_body, alternatives = collect_alternatives(client, payload)
            assert alternatives_body['status'] == 'alternatives_available', alternatives_body
            outcome = alternatives_body['outcome']
            assert (outcome['kind'], outcome['source'], outcome['verified_externally'],
                    outcome['seller_confirmation']) == ('no_answer', 'simulated', False, False)
            assert outcome['received_at']
            assert alternatives, 'no alternative seller under the preserved budget'
            assert all(item['product_id'] == product_id for item in alternatives)
            assert all(item['shop_id'] != reported_shop for item in alternatives)
            assert all(item['price_toman'] is not None
                       and int(item['price_toman']) <= int(second['max_price_toman'])
                       for item in alternatives)
            expected = [item['offer_id'] for item in offers if item['shop_id'] != reported_shop]
            assert [item['offer_id'] for item in alternatives] == expected
            assert all(item['inventory_status'] == 'unconfirmed' for item in alternatives)
            assert_no_contact(alternatives_body)
            checks += 1

    assert len(calls) == 2, 'the two assistant turns must use exactly two synthetic provider calls'
    evidence = {
        'evidence': 'real snapshot + in-process ASGI + synthetic provider; no billable model, browser, deployment, or contact',
        'checks': checks,
        'turns': 2,
        'provider_calls': len(calls),
        'initial_budget': first['max_price_toman'],
        'changed_budget': second['max_price_toman'],
        'topic_preserved': second['need_state']['topic_query'] == first['need_state']['topic_query'],
        'product_offers_under_budget': len(offers),
        'reported_shop_offers': len(reported_offers),
        'alternatives': len(alternatives),
        'draft_unsent': draft['draft']['delivery_status'] == 'draft_not_sent',
        'outcome_source': outcome['source'],
        'snapshot_unchanged': before == sha256(database),
        'elapsed_seconds': round(time.monotonic() - started, 3),
    }
    assert evidence['snapshot_unchanged'], 'source snapshot changed'
    return evidence


if __name__ == '__main__':
    print(json.dumps(smoke(ROOT / '.local/catalogue.sqlite3'), ensure_ascii=True))
