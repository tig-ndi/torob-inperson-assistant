"""Validate model proposals; compute money and catalogue operations on the host."""

from decimal import Decimal, InvalidOperation
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from apps.api.catalogue import search_expression
from tools.prepare_data import normalize_text


QUESTIONS = {
    "product_kind": "چه نوع کالایی می‌خواهید و برای چه کاری از آن استفاده می‌کنید؟",
    "budget": "سقف بودجه‌تان چند تومان است؟ می‌توانید آن را در کادر بودجه هم وارد کنید.",
    "priority": "مهم‌ترین کاربرد یا ویژگی موردنظرتان چیست؟",
    "specific_model": "نام دقیق‌تر کالا یا مدل موردنظرتان چیست؟",
}


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Message(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class AssistantRequest(StrictModel):
    request_id: str = Field(pattern=r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$")
    messages: list[Message] = Field(min_length=1, max_length=5)
    max_price_toman: str | None = Field(default=None, pattern=r"^[0-9]{1,19}$")
    context_query: str | None = Field(default=None, min_length=1, max_length=120)

    @model_validator(mode="after")
    def bounded_history(self):
        if any(not m.content.strip() for m in self.messages) or sum(len(m.content) for m in self.messages) > 3000:
            raise ValueError("history must contain at most 3000 non-empty characters")
        if [m.role for m in self.messages] != ["user" if i % 2 == 0 else "assistant" for i in range(len(self.messages))] or self.messages[-1].role != "user":
            raise ValueError("history must alternate user/assistant and end with user")
        if self.max_price_toman is not None and int(self.max_price_toman) > 2**63 - 1:
            raise ValueError("budget exceeds supported integer range")
        if self.context_query is not None:
            search_expression(self.context_query)
        return self


class IntentPlan(StrictModel):
    action: Literal["clarify", "search"]
    query: str | None = Field(max_length=120)
    budget_text: str | None = Field(max_length=100)
    question: Literal["product_kind", "budget", "priority", "specific_model"] | None

    @model_validator(mode="after")
    def valid_action(self):
        if self.action == "search" and (not self.query or self.question is not None):
            raise ValueError("search requires a query and no question")
        if self.action == "clarify" and self.question is None:
            raise ValueError("clarify requires a question code")
        if self.query is not None:
            search_expression(self.query)
        return self


ONES = dict(zip("صفر یک دو سه چهار پنج شش هفت هشت نه ده یازده دوازده سیزده چهارده پانزده شانزده هفده هجده نوزده".split(), range(20)))
TENS = dict(zip("بیست سی چهل پنجاه شصت هفتاد هشتاد نود".split(), range(20, 100, 10)))
HUNDREDS = dict(zip("صد دویست سیصد چهارصد پانصد ششصد هفتصد هشتصد نهصد".split(), range(100, 1000, 100)))
SCALES = {"هزار": 1000, "میلیون": 10**6, "میلیارد": 10**9}
NUMBER_WORDS = '|'.join(re.escape(w) for w in [*ONES, *TENS, *HUNDREDS, *SCALES, 'و'])
AMOUNT_ATOM = rf'(?:[0-9]+(?:[٬,،.٫][0-9]+)*|(?:{NUMBER_WORDS})(?!\w))'
AMOUNT = rf'{AMOUNT_ATOM}(?:\s+{AMOUNT_ATOM})*'
BUDGET_PREFIX = r'بودجه(?:\s+ام)?(?:\s+(?:من|را|رو|به|برابر|است|تا|حداکثر))*\s*:?\s+'


def parse_toman(quote: str) -> int:
    """A complete amount quote, never float/LLM arithmetic or a rial conversion."""
    text = normalize_text(quote).strip(' .،؛؟!?')
    for grouped in re.findall(r'[0-9]+(?:[٬,،][0-9]+)+', text):
        parts = re.split(r'[٬,،]', grouped)
        if len(parts[0]) > 3 or any(len(part) != 3 for part in parts[1:]):
            raise ValueError('invalid digit grouping')
    text = text.replace("٬", "").replace(",", "").replace("،", "").replace("٫", ".")
    text = re.sub(r'^(?:حداکثر|تا)\s+', '', text)
    text = re.sub(r"\s*(?:تومان|تومن)\s*$", "", text).strip()
    tokens = text.split()
    if not tokens:
        raise ValueError("missing amount")
    total, group, last_scale = Decimal(0), Decimal(0), 10**12
    previous_number, last_rank = False, 4
    for token in tokens:
        if token == "و":
            if not previous_number:
                raise ValueError("invalid amount conjunction")
            previous_number = False
        elif token in SCALES:
            scale = SCALES[token]
            if group <= 0 or scale >= last_scale:
                raise ValueError("invalid amount scale")
            total += group * scale
            group, last_scale = Decimal(0), scale
            last_rank = 4
            previous_number = True
        elif token in ONES or token in TENS or token in HUNDREDS:
            rank = 3 if token in HUNDREDS else 2 if token in TENS else 1
            if previous_number or rank >= last_rank:
                raise ValueError("ambiguous number words")
            group += Decimal({**ONES, **TENS, **HUNDREDS}[token])
            last_rank = rank
            previous_number = True
        elif re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", token) and not previous_number:
            if group:
                raise ValueError('ambiguous mixed number')
            group += Decimal(token)
            last_rank = 0
            previous_number = True
        else:
            raise ValueError("unsupported amount")
    total += group
    if not previous_number or total != total.to_integral_value() or not 0 <= total <= 2**63 - 1:
        raise ValueError("amount must be a supported integer")
    return int(total)


def explicit_budget(message: str) -> str | None:
    """Only explicit, unambiguous maximum-budget phrases, never arbitrary numbers."""
    text = normalize_text(message)
    pattern = rf'(?:حداکثر\s+|تا\s+|(?:سقف\s+)?{BUDGET_PREFIX})(?P<amount>{AMOUNT}\s*(?:تومان|تومن))'
    # The explicit budget field establishes toman, even in a short edit command.
    unitless = rf'(?:سقف\s+)?{BUDGET_PREFIX}(?P<amount>{AMOUNT})(?=\s*(?:کن|بکن|بگذار|بذار|باشد|باشه|است|تغییر\s+بده|$|[.،؛؟!]))'
    amounts = []
    matches = list(re.finditer(pattern, text))
    matches += [m for m in re.finditer(unitless, text)
                if not any(m.start() < other.end() and other.start() < m.end() for other in matches)]
    for match in matches:
        try:
            amounts.append(str(parse_toman(match['amount'])))
        except ValueError:
            raise ValueError('invalid explicit budget')
    if len(amounts) > 1:
        raise ValueError('multiple explicit budgets')
    return amounts[0] if amounts else None


def proposed_budget(plan: IntentPlan, request: AssistantRequest) -> str | None:
    latest = request.messages[-1].content
    explicit = explicit_budget(latest)
    if explicit is not None:
        return explicit
    text = normalize_text(latest)
    if re.search(r'ارزان\s*تر|ارزون\s*تر|گران\s*تر|گرون\s*تر', text) or re.search(r'\bبودجه\b.*(?:کن|تغییر|کمتر|بیشتر|ریال)', text):
        raise ValueError('budget change requires an explicit toman amount')
    if re.search(r'(?:بودجه|حداکثر|تا).*ریال', text):
        raise ValueError('rial budget is unsupported')
    if plan.budget_text is None:
        return request.max_price_toman
    # Only a verbatim quote from the latest human message may change a budget.
    if not plan.budget_text.strip() or plan.budget_text not in request.messages[-1].content:
        raise ValueError("budget quote is not from the latest user message")
    try:
        return str(parse_toman(plan.budget_text))
    except (InvalidOperation, ArithmeticError) as exc:
        raise ValueError("unsupported amount") from exc


def query_choices(request: AssistantRequest) -> list[str]:
    """Bounded literal phrases from human text, excluding amounts/conversational filler.

    These are lexical candidates, not verified recommendations or semantic matches.
    The model selects among them; the repository determines whether evidence exists.
    """
    stop = set('من یک یه برای جهت استفاده کار کارهای کاربرد روزمره روزانه معمولی عمومی می خواهم خوام میخوام میخواهم میخرم میگردم میشه است هست هستم دارم بخرم خرید کمک میخواستم ولی هنوز نگفتم دنبال چه کالایی کالا حداکثر سقف بودجه ام تا تومان تومن ریال با و یا از به در را رو هم لطفا لطفاً میخوامش مناسب میخواد حالا اکنون کن بکن بده بگذار بذار باشه باشد تغییر کمتر بیشتر ارزان ارزون گران گرون تر ارزانتر ارزونتر ارزانترش ارزونترش گرانتر گرونتر گرانترش گرونترش ترش آن این قبلی همان همون'.split())
    tokens = []
    for message in reversed(request.messages):
        if message.role != 'user':
            continue
        text = normalize_text(message.content)
        text = re.sub(rf'(?:سقف\s+)?{BUDGET_PREFIX}{AMOUNT}(?:\s*(?:تومان|تومن|ریال))?', ' ', text)
        text = re.sub(rf'{AMOUNT}\s*(?:تومان|تومن|ریال)', ' ', text)
        if re.fullmatch(rf'\s*{AMOUNT}\s*[.،؛؟!]*', text):
            text = ''
        for token in re.findall(r'[^\W_]+', text, flags=re.UNICODE):
            if token not in stop and token not in tokens:
                tokens.append(token)
        if tokens:
            break
        if request.context_query is not None:
            return [normalize_text(request.context_query)]
    tokens = tokens[:8]
    candidates = []
    # Preserve neighbouring brands/model numbers; always leave room for unigrams.
    for width in [min(3, len(tokens)), 2, 1]:
        if width <= 0:
            continue
        for start in range(min(len(tokens) - width + 1, 2 if width > 1 else 4)):
            query = ' '.join(tokens[start:start + width])
            if query and len(query) <= 120 and query not in candidates:
                candidates.append(query)
    return candidates[:6]
