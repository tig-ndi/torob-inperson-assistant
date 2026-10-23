"""Source-backed UI choices; no model, fabricated product or live-stock claims."""

from pydantic import Field

from apps.api.catalogue import Catalogue, search_expression
from apps.api.models import Model, Provenance


class Guidance(Model):
    starters: list[str] = Field(max_length=6)
    brands: list[str] = Field(default_factory=list, max_length=4)
    budget_samples: list[str] = Field(max_length=3)
    sample_size: int
    query: str | None
    provenance: Provenance


def guidance(catalogue: Catalogue, query: str | None = None) -> dict:
    expression = search_expression(query) if query else None
    with catalogue.connect() as connection:
        provenance = catalogue.provenance(connection)
        if query:
            rows = connection.execute(
                'SELECT min(o.price_toman) AS price FROM products p '
                'JOIN offers o ON o.product_id=p.product_id '
                'WHERE p.product_id IN (SELECT product_id FROM product_search WHERE product_search MATCH ?) '
                'GROUP BY p.product_id ORDER BY p.product_id LIMIT 40',
                (expression,)).fetchall()
            prices = sorted({row['price'] for row in rows if row['price'] is not None})
            brands = connection.execute(
                'SELECT p.brand_name, count(*) AS n FROM products p '
                'WHERE p.product_id IN (SELECT product_id FROM product_search WHERE product_search MATCH ?) '
                'AND p.brand_name IS NOT NULL AND trim(p.brand_name) != ? '
                'AND EXISTS (SELECT 1 FROM offers o WHERE o.product_id=p.product_id) '
                'GROUP BY p.brand_name ORDER BY n DESC,p.brand_name LIMIT 4', (expression, '')).fetchall()
            # Real prices from a bounded sample, never an invented market median.
            samples = list(dict.fromkeys(str(prices[index]) for index in
                (0, len(prices) // 2, len(prices) - 1))) if prices else []
            return {'starters': [], 'budget_samples': samples, 'sample_size': len(rows),
                    'query': query, 'brands': [row['brand_name'] for row in brands], 'provenance': provenance}
        categories = connection.execute(
            'SELECT p.category_name, count(*) AS n FROM products p '
            'WHERE p.category_name IS NOT NULL AND trim(p.category_name) != ? '
            'AND EXISTS (SELECT 1 FROM offers o WHERE o.product_id=p.product_id) '
            'GROUP BY p.category_name ORDER BY n DESC,p.category_name LIMIT 6', ('',)).fetchall()
        return {'starters': [row['category_name'] for row in categories], 'budget_samples': [],
                'sample_size': 0, 'query': None, 'provenance': provenance}
