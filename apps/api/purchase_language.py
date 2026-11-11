"""Separate a refused purchase from the next affirmative purchase clause."""
import re
from tools.prepare_data import normalize_text


def affirmative_purchase_text(text: str) -> str:
    cleaned = normalize_text(text)
    # The old item in a replacement and explicitly refused items are not purchases.
    cleaned = re.sub(r'(?:به\s*جای|بجای)\s+.+?(?=\s+(?:یک|یه)\s+)', '', cleaned)
    cleaned = re.sub(r'(?:به\s*جای|بجای)\s+\S+\s+', '', cleaned)
    priority = re.search(r'(?:اول|فعلا)\s+فقط\s+(.+?)(?=[؛;،]|$)', cleaned)
    if priority and re.search(r'برای بعد|بعدا', cleaned):
        cleaned = priority[1]
    clauses = re.split(r'[؛;،,!؟\n]|\b(?:اما|ولی)\b', cleaned)
    output = []
    for clause in clauses:
        if re.match(r'^\s*نه\s+(?:enc|میکروفون)(?:\s|$)', clause, re.I):
            continue  # A rejected microphone feature is not another purchase.
        if re.match(r'^\s*نه\s+(?:خود\s+)?(?:گوشی|موبایل|شارژر|کابل|هدفون|پاوربانک|کفش|لپ\s*تاپ)(?:\s|$)', clause):
            continue
        refusal = re.search(r'(?<!\w)نمی\s*(?:خواهم|خوام)(?!\w)', clause)
        before = clause[:refusal.start()] if refusal else ''
        field_refusal = bool(re.search(r'(?:رنگ|سایز|اندازه|جنس|حافظه|رم|وزن|توان|گارانتی|قسطی|دوربین|باتری)(?:\s+\S+){0,3}\s*$', before))
        if refusal and not field_refusal and not re.search(r'(?<![\wن])می\s*(?:خواهم|خوام)(?!\w)', before):
            clause = clause[refusal.end():]
        if clause.strip():
            output.append(clause.strip())
    return ' ؛ '.join(output)
