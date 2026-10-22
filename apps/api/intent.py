"""Validate model proposals; compute money and catalogue operations on the host."""

from fractions import Fraction
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from apps.api.catalogue import search_expression
from apps.api.category import CAT_MOBILE_PHONE, detect_category_intent
from apps.api.battery import strip_capacity_clause
from apps.api.models import BatteryRequirement, AssistantNeedState
from apps.api.need_state import is_need_control
from apps.api.visit_intent import is_constraint_followup, wants_nearest
from tools.prepare_data import normalize_text


QUESTIONS = {
    "requirement_choice": "کدام شرط را حذف کنیم؟ نام آن را بگویید؛ برای حذف همهٔ شرط‌های اجرا‌نشده بگویید «همه شرط های اجرا نشده را حذف کن».",
    "requirement_limit": "تعداد شرط‌های حل‌نشده زیاد است؛ ابتدا مشخص کنید کدام شرط را نگه داریم یا حذف کنیم. شرط تازه اضافه نشد.",
    "location": "برای یافتن نزدیک‌ترین فروشنده، موقعیت را در بخش محدوده مشخص کنید؛ بدون مختصات معتبر فاصله را حدس نمی‌زنیم.",
    "unsupported_filter": "این شرط هنوز فیلتر قابل اتکایی در دستیار ندارد؛ مشخصات ثبت‌شده را بررسی کنید یا بگویید «بدون این شرط» ادامه دهیم. شرط اعمال نشده است.",
    "battery_capacity": "برای ظرفیت ثبت‌شدهٔ باتری، حداقل چند میلی‌آمپرساعت می‌خواهید؟ اگر حداقل مشخصی ندارید، بگویید «بدون حداقل». ظرفیت به‌تنهایی دوام واقعی باتری را ثابت نمی‌کند.",
    "battery_scope": "فیلتر ظرفیت ثبت‌شدهٔ باتری فعلاً فقط برای گوشی موبایل پشتیبانی می‌شود. می‌خواهید بدون این شرط جست‌وجو کنیم؟",
    "product_kind": "چه نوع کالایی می‌خواهید و برای چه کاری از آن استفاده می‌کنید؟",
    "budget": "سقف بودجه‌تان چند تومان است؟ می‌توانید آن را در کادر بودجه هم وارد کنید.",
    "priority": "مهم‌ترین کاربرد یا ویژگی موردنظرتان چیست؟",
    "specific_model": "نام دقیق‌تر کالا یا مدل موردنظرتان چیست؟",
}

CONTACT_LIMITATION = (
    'درخواست تماس شما اجرا نشد: اطلاعات تماس قابل‌استفاده‌ای نداریم و شماره‌های ثبت‌شده در دیتاست مصنوعی‌اند؛ '
    'تماس واقعی با فروشنده انجام نشده است.'
)
CONTACT_RESULT_LIMITATION = (
    CONTACT_LIMITATION + ' نتایج زیر فقط نتیجهٔ جست‌وجوی کالا هستند و انجام درخواست تماس محسوب نمی‌شوند.'
)


def question_prompt(code: str, contact: bool = False) -> str:
    return f'{CONTACT_LIMITATION} {QUESTIONS[code]}' if contact else QUESTIONS[code]


def matches_question(content: str, code: str) -> bool:
    """Recognize a stored question even when a contact limitation preceded it."""
    return content == QUESTIONS[code] or content == question_prompt(code, True)


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
    context_category: str | None = Field(default=None, min_length=1, max_length=120)
    category_cleared: bool = False
    # Review topics are preferences for source evidence, never verified capabilities.
    context_topics: list[Literal['camera', 'battery']] | None = Field(default=None, max_length=2)
    context_battery_requirement: BatteryRequirement | None = None
    user_lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    user_lon: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    context_offer_sort: Literal['price', 'nearest'] = 'price'
    context_need_state: AssistantNeedState | None = None

    @model_validator(mode="after")
    def bounded_history(self):
        state = self.context_need_state
        provided = set(self.model_fields_set)
        if state is not None:
            if 'context_query' in provided and self.context_query != state.topic_query:
                raise ValueError('topic conflicts with supplied need state')
            if ('context_category' in provided and self.context_category is not None
                    and state.category_name is not None and self.context_category != state.category_name):
                raise ValueError('category conflicts with supplied need state')
            for name, value in {
                'context_query': state.topic_query, 'context_category': state.category_name,
                'category_cleared': state.category_cleared, 'max_price_toman': state.max_price_toman,
                'context_offer_sort': state.offer_sort, 'context_battery_requirement': state.battery_requirement,
                'context_topics': state.review_topics,
            }.items():
                if name not in provided:
                    setattr(self, name, value)
        if (self.user_lat is None) != (self.user_lon is None):
            raise ValueError('coordinates must be supplied together')
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
    question: Literal["product_kind", "budget", "priority", "specific_model", "battery_capacity", "battery_scope", "location", "unsupported_filter", "requirement_choice", "requirement_limit"] | None

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
BUDGET_PREFIX = r'بودجه(?:\s+(?:ام|م))?(?:\s+(?:من|را|رو|به|برابر|است|تا|حداکثر))*\s*:?\s+'
QUERY_STOPWORDS = frozenset('من یک یه برای واسه جهت استفاده کار کارهای کاربرد روزمره روزانه معمولی عمومی می خواهم خوام میخوام میخواهم میخرم میگردم میشه است هست هستم دارم بخرم خرید کمک میخواستم ولی هنوز نگفتم دنبال چه کالایی کالا حداکثر سقف بودجه ام تا تومان تومن ریال با و یا از به در را رو هم لطفا لطفاً میخوامش مناسب میخواد حالا اکنون کن بکن بده بگذار بذار باشه باشد تغییر کمتر بیشتر ارزان ارزون گران گرون تر ارزانتر ارزونتر ارزانترش ارزونترش گرانتر گرونتر گرانترش گرونترش ترش آن این قبلی همان همون'.split())
GENERIC_TOPIC_WORDS = frozenset('چیزی چیز کالا کالای کالایی محصول محصولی وسیله وسایل مورد جنسی'.split())
MAX_TOPIC_WORDS = 4
TOPIC_SEPARATORS = re.compile(r'\s+(?:و|یا)\s+|[،,;؛]')


def _strip_budget_phrases(text: str) -> str:
    cleaned = normalize_text(text)
    cleaned = re.sub(rf'(?:حداکثر\s+|تا\s+|(?:سقف\s+)?{BUDGET_PREFIX}){AMOUNT}\s*(?:تومان|تومن|ریال)(?:ه)?', ' ', cleaned)
    cleaned = re.sub(rf'{AMOUNT}\s*(?:تومان|تومن|ریال)(?:ه)?', ' ', cleaned)
    return re.sub(rf'(?:سقف\s+)?{BUDGET_PREFIX}{AMOUNT}(?=\s*(?:کن|بکن|بگذار|بذار|باشد|باشه|است|تغییر|$|[.،؛؟!]))', ' ', cleaned)


def _catalogue_words(category_names):
    categories, heads = [], set()
    for name in category_names or ():
        if not isinstance(name, str):
            continue
        words = re.findall(r'[^\W_]+', normalize_text(name), flags=re.UNICODE)
        if words:
            heads.add(words[0])
            categories.append((words[0], set(words)))
    return categories, heads


def _content_tokens(text: str) -> list[str]:
    tokens = []
    for token in re.findall(r'[^\W_]+', text, flags=re.UNICODE):
        if token in QUERY_STOPWORDS or token in GENERIC_TOPIC_WORDS or token in tokens:
            continue
        tokens.append(token)
    return tokens


def _topic_heads(text: str, heads: set[str]) -> list[set[str]]:
    segment_heads = []
    for segment in TOPIC_SEPARATORS.split(text):
        heading = {token for token in _content_tokens(segment) if token in heads}
        if heading:
            segment_heads.append(heading)
    return segment_heads


MENTION_SEPARATORS = re.compile(r'\s+(?:و|یا)\s+|[،,;؛.!?؟\n]')


def _category_sequences(category_names):
    sequences = []
    for name in category_names or ():
        if not isinstance(name, str):
            continue
        words = tuple(re.findall(r'[^\W_]+', normalize_text(name), flags=re.UNICODE))
        if words:
            sequences.append(words)
    return sequences


CONTACT_HEADS = frozenset({'شماره', 'اطلاعات', 'راه', 'لینک', 'آیدی', 'نشانی', 'آدرس'})
CONTACT_OBJECTS = frozenset(
    'تماس تلفن همراه فروشگاه فروشنده فروشندگان پشتیبانی ارتباط ارتباطی '
    'واتساپ تلگرام اینستاگرام آیدی نشانی آدرس'.split())
CONTACT_REQUEST_WORDS = frozenset(
    'بده بدید بفرست بفرستید بگو بگید لیست نمایش ارسال بگیر بگیرید دارید داره چیه چیست'.split())
CONTACT_FILLERS = frozenset({'ی', 'ای', 'را', 'رو', 'هم', 'ها', 'های'})


def _category_prefix_length(tokens, start, sequences):
    longest = 1
    for words in sequences:
        if words[0] != tokens[start]:
            continue
        limit = min(len(words), len(tokens) - start)
        size = 0
        while size < limit and words[size] == tokens[start + size]:
            size += 1
        longest = max(longest, size)
    return longest


def is_contact_request(text: str, category_names=None) -> bool:
    """Distinguish a request for contact information from a dialer product.

    A contact phrase starts with a communication head and then a contact object
    or request verb ('شماره تماس‌ها را بده', 'شماره را بده'). A real catalogue
    phrase such as 'شماره زن' or 'شماره گیر تلفن' wins because it matches a
    category prefix; no single-sentence exception and no generic word deletion.
    """
    if not text or not isinstance(text, str):
        return False
    tokens = re.findall(r'[^\W_]+', normalize_text(text), flags=re.UNICODE)
    sequences = _category_sequences(category_names)
    for index, token in enumerate(tokens):
        if token not in CONTACT_HEADS:
            continue
        if _category_prefix_length(tokens, index, sequences) >= 2:
            continue
        following = None
        for candidate in tokens[index + 1:index + 5]:
            if candidate in CONTACT_FILLERS:
                continue
            following = candidate
            break
        if following is None:
            if token == 'شماره':
                return True
            continue
        if following in CONTACT_OBJECTS or following in CONTACT_REQUEST_WORDS:
            return True
    return False


def _mention_signature(tokens, start, sequences, identity_words):
    head = tokens[start]
    matched = _category_prefix_length(tokens, start, sequences)
    if head == 'شماره' and matched < 2:
        # 'شماره' is both a contact-information word and the prefix of real
        # dialer products; only a catalogue-backed phrase identifies a product.
        return None
    if matched >= 2:
        return ' '.join(tokens[start:start + matched])
    follower = tokens[start + 1] if start + 1 < len(tokens) else None
    if follower is None or follower in QUERY_STOPWORDS:
        return head
    if follower in (identity_words or ()) or any(character.isdigit() for character in follower) or follower.isascii():
        return head
    return None


def multiple_topic_heads(text: str, category_names, identity_words=None) -> bool:
    """Detect a coordinated request that names two distinct products.

    A shared category-head token is not evidence by itself: the head must be a
    stand-alone noun phrase or start a longer catalogue phrase. This keeps a
    contact request such as 'شماره تماس' from becoming the 'شماره زن' product,
    while 'شماره زن' and a real 'گوشی و شارژر' list remain recognizable. The
    first head in each clause is authoritative; later head tokens belong to the
    same compound. Clause boundaries use conjunctions/list separators and
    sentence punctuation, and every candidate is also checked lexically.
    """
    if not text or not isinstance(text, str):
        return False
    sequences = _category_sequences(category_names)
    heads = {sequence[0] for sequence in sequences}
    signatures = []
    for segment in MENTION_SEPARATORS.split(_strip_budget_phrases(text)):
        tokens = re.findall(r'[^\W_]+', segment, flags=re.UNICODE)
        start = next((index for index, token in enumerate(tokens) if token in heads), None)
        if start is None:
            continue
        signature = _mention_signature(tokens, start, sequences, identity_words)
        if signature is not None:
            signatures.append(signature)
    return len(set(signatures)) > 1


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
    # Rational arithmetic preserves every decimal digit; Decimal context precision
    # must not round a fractional toman into an accepted integer before validation.
    total, group, last_scale = Fraction(0), Fraction(0), 10**12
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
            group, last_scale = Fraction(0), scale
            last_rank = 4
            previous_number = True
        elif token in ONES or token in TENS or token in HUNDREDS:
            rank = 3 if token in HUNDREDS else 2 if token in TENS else 1
            if previous_number or rank >= last_rank:
                raise ValueError("ambiguous number words")
            group += {**ONES, **TENS, **HUNDREDS}[token]
            last_rank = rank
            previous_number = True
        elif re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", token) and not previous_number:
            if group:
                raise ValueError('ambiguous mixed number')
            group += Fraction(token)
            last_rank = 0
            previous_number = True
        else:
            raise ValueError("unsupported amount")
    total += group
    if not previous_number or total.denominator != 1 or not 0 <= total <= 2**63 - 1:
        raise ValueError("amount must be a supported integer")
    return int(total)


def explicit_budget(message: str) -> str | None:
    """Only explicit, unambiguous maximum-budget phrases, never arbitrary numbers."""
    text = normalize_text(message)
    # An unsupported signed amount is an explicit invalid budget, not absence
    # of a budget. Physical units without a currency are not money phrases.
    sign = r'(?:[-−–+]\s*|(?:منفی|مثبت)\s+)'
    signed_money = rf'(?:حداکثر\s+|تا\s+|(?:سقف\s+)?{BUDGET_PREFIX}){sign}{AMOUNT}\s*(?:تومان|تومن)(?!\w)'
    signed_edit = rf'(?:سقف\s+)?{BUDGET_PREFIX}{sign}{AMOUNT}(?=\s*(?:کن|بکن|بگذار|بذار|باشد|باشه|است|تغییر\s+بده|$|[.،؛؟!]))'
    if re.search(signed_money, text) or re.search(signed_edit, text):
        raise ValueError('invalid signed budget')
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
    except ArithmeticError as exc:
        raise ValueError("unsupported amount") from exc


def query_choices(request: AssistantRequest) -> list[str]:
    """Bounded literal phrases from human text, excluding amounts/conversational filler.

    These are lexical candidates, not verified recommendations or semantic matches.
    The model selects among them; the repository determines whether evidence exists.
    """
    latest = request.messages[-1].content
    if request.context_query and is_need_control(latest, include_ack=bool(request.context_need_state and (
            request.context_need_state.pending_requirements or request.context_need_state.budget_needs_input))):
        return [normalize_text(request.context_query)]
    if releases_unsupported(request):
        return [normalize_text(request.context_query)]
    if request.context_query:
        try:
            explicit_budget(latest)
        except ValueError:
            # An invalid amount is a budget clarification, not a new topic named
            # 'negative'. Keep the prior product available to the constrained model.
            return [normalize_text(request.context_query)]
    # A modifier alone must not displace the current product with words such as
    # 'colour blue location'. A newly named product category still takes priority.
    if (request.context_query and is_constraint_followup(latest)
            and detect_category_intent(latest) is None):
        return [normalize_text(request.context_query)]
    if not request.context_query and wants_nearest(latest) and is_constraint_followup(latest) and detect_category_intent(latest) is None:
        return []
    stop = QUERY_STOPWORDS
    tokens = []
    for message in reversed(request.messages):
        if message.role != 'user':
            continue
        text = normalize_text(message.content)
        if detect_category_intent(message.content) == CAT_MOBILE_PHONE or (
                request.context_query is not None and detect_category_intent(request.context_query) == CAT_MOBILE_PHONE
                and re.match(r'^(?:با\s+)?(?:ظرفیت\s*)?(?:باتری|باطری)\s+(?:قوی|خوب|حداقل|[0-9])|^حداقل\s+', text)):
            text = strip_capacity_clause(text, AMOUNT)
        text = re.sub(rf'(?:سقف\s+)?{BUDGET_PREFIX}{AMOUNT}(?:\s*(?:تومان|تومن|ریال)(?:ه)?)?', ' ', text)
        text = re.sub(rf'{AMOUNT}\s*(?:تومان|تومن|ریال)(?:ه)?', ' ', text)
        if detect_category_intent(message.content) == CAT_MOBILE_PHONE:
            # Qualitative use cases are not literal catalogue names or verified
            # feature predicates. Keep the phone/brand/model; show source specs.
            text = re.sub(r'\bبرای\s+(?:عکاسی|سلفی|فیلم\s*برداری)\b', ' ', text)
            text = re.sub(r'\b(?:با\s+)?(?:دوربین|باتری|باطری)\s+(?:خوب|قوی|مناسب|با\s*کیفیت)\b', ' ', text)
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


def releases_unsupported(request: AssistantRequest) -> bool:
    return bool(request.context_query and len(request.messages) > 1
                and matches_question(request.messages[-2].content, 'unsupported_filter')
                and normalize_text(request.messages[-1].content) in {'بدون این شرط', 'بدون این فیلتر'})


def clear_product_topic(text: str, category_names) -> str | None:
    """Return a short literal topic backed by one catalogue category.

    All content words must belong to the same category and the topic's first
    word must be that category's leading word. Coordinated or list-style
    requests are rejected before stopword removal when two segments each carry
    a category head. Word order, grammar and semantic suitability are not
    verified; unverified words are rejected, never dropped. Compound category
    names that span two heads are also rejected by this fallback.
    """
    if not text or not isinstance(text, str):
        return None
    cleaned = _strip_budget_phrases(text)
    categories, heads = _catalogue_words(category_names)
    if not categories:
        return None
    tokens = _content_tokens(cleaned)
    if tokens and tokens[0] == 'شماره' and _category_prefix_length(
            tokens, 0, _category_sequences(category_names)) < 2:
        return None
    segment_heads = _topic_heads(cleaned, heads)
    if len(segment_heads) > 1 and len(set().union(*segment_heads)) > 1:
        return None
    if not 1 <= len(tokens) <= MAX_TOPIC_WORDS:
        return None
    if tokens[0] not in heads or not any(
            head == tokens[0] and set(tokens) <= words for head, words in categories):
        return None
    return ' '.join(tokens)


def product_span(text: str, category_names, identity_words) -> str | None:
    """Return the literal product phrase beginning at a snapshot category head.

    The span stops at conversational fillers, prepositions and clause
    punctuation, so a greeting or a use-case clause cannot become part of the
    product query. Tokens the snapshot does not know are preserved inside the
    span: a brand, model, typo or constraint is never removed merely because it
    is absent from the vocabulary. This is a structural boundary, not a general
    language model; the catalogue still decides whether evidence exists.
    """
    if not text or not isinstance(text, str):
        return None
    cleaned = normalize_text(text)
    if detect_category_intent(text) == CAT_MOBILE_PHONE:
        cleaned = strip_capacity_clause(cleaned, AMOUNT)
    cleaned = _strip_budget_phrases(cleaned)
    _, heads = _catalogue_words(category_names)
    sequences = _category_sequences(category_names)
    if not heads:
        return None
    for segment in re.split(r'[.!?؟؛;\n،,]+', cleaned):
        tokens = re.findall(r'[^\W_]+', segment, flags=re.UNICODE)
        for start in (index for index, token in enumerate(tokens) if token in heads):
            if tokens[start] == 'شماره' and _category_prefix_length(tokens, start, sequences) < 2:
                # A bare or contact-style 'شماره' is not a catalogue product;
                # keep looking for a later real product in the same clause.
                continue
            head = tokens[start]
            # A brand/model written before its head noun still belongs to the phrase.
            while (start and tokens[start - 1] in identity_words
                   and tokens[start - 1] not in QUERY_STOPWORDS):
                start -= 1
            span = []
            grounded = False
            for token in tokens[start:]:
                if span and token in QUERY_STOPWORDS:
                    break
                if token == head:
                    span.append(token)
                    continue
                identity = token in identity_words or any(character.isdigit() for character in token) or token.isascii()
                if grounded and not identity:
                    # A verified brand/model already identifies the product; a later
                    # unmatched token is a use-case/constraint, not part of its name.
                    break
                span.append(token)
                grounded = grounded or identity
            return ' '.join(span) if 1 <= len(span) <= 12 else None
    return None
