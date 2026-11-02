"""Separate a refused purchase from the next affirmative purchase clause."""
import re
from tools.prepare_data import normalize_text


def affirmative_purchase_text(text: str) -> str:
    clauses = re.split(r'[؛;،,!؟\n]|\b(?:اما|ولی)\b', normalize_text(text))
    output = []
    for clause in clauses:
        refusal = re.search(r'(?<!\w)نمی\s*(?:خواهم|خوام)(?!\w)', clause)
        before = clause[:refusal.start()] if refusal else ''
        field_refusal = bool(re.search(r'(?:رنگ|سایز|اندازه|جنس|حافظه|رم|وزن|توان|گارانتی|قسطی|دوربین|باتری)(?:\s+\S+){0,3}\s*$', before))
        if refusal and not field_refusal and not re.search(r'(?<![\wن])می\s*(?:خواهم|خوام)(?!\w)', before):
            clause = clause[refusal.end():]
        if clause.strip():
            output.append(clause.strip())
    return ' ؛ '.join(output)
