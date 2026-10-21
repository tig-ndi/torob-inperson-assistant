"""Offline evaluation of need-to-specs retrieval gap and evidence in catalogue.

Standard Python library and internal project modules only.
Zero network calls, zero external API consumption, zero modification to database or runtime.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import sys

from apps.api.catalogue import Catalogue
from apps.api.intent import AssistantRequest, Message, query_choices


REPRESENTATIVE_SCENARIOS = [
    {
        "id": "scenario_1",
        "title": "گوشی برای عکاسی تا ۲۰ میلیون تومان",
        "user_message": "یک گوشی برای عکاسی می‌خواهم تا ۲۰ میلیون تومان",
        "budget_toman": 20000000,
        "target_category": "گوشی موبایل",
        "prior_expectation": (
            "انتظار پیشینی: کاربر کالای دستهٔ گوشی موبایل با اولویت دوربین یا عکاسی می‌خواهد. "
            "پیش‌بینی می‌شود ترکیب لفظی «گوشی عکاسی» در کاتالوگ به دلیل نبود واژهٔ «عکاسی» در عنوان گوشی‌ها، "
            "نتیجهٔ صفر یا نامرتبط بدهد و عبارت عام «گوشی» نتایجی با رده‌های مختلف دوربین (یا حتی بدون دوربین) بازگرداند."
        ),
        "spec_probe_keys": ["دوربین", "رزولوشن", "مگاپیکسل", "لنز"],
        "inference_notes": (
            "صرف وجود مشخصهٔ دوربین یا عدد بالای مگاپیکسل، اثبات قطعی مناسب بودن برای عکاسی حرفه‌ای نیست. "
            "همچنین گوشی بدون دوربین نیز ممکن است به دلیل واژهٔ کلی «گوشی» در نتایج اولیه ظاهر شود."
        ),
    },
    {
        "id": "scenario_2",
        "title": "لپ‌تاپ مناسب برنامه‌نویسی تا ۴۰ میلیون تومان",
        "user_message": "یک لپ تاپ مناسب برنامه نویسی تا ۴۰ میلیون تومان",
        "budget_toman": 40000000,
        "target_category": "لپ تاپ و نوت بوک",
        "prior_expectation": (
            "انتظار پیشینی: کاربر کالای دستهٔ لپ‌تاپ و نوت‌بوک برای کاربری فنی/برنامه‌نویسی می‌خواهد. "
            "پیش‌بینی می‌شود عبارت‌های ترکیبی شامل «برنامه نویسی» در FTS کاتالوگ نتیجه‌ای نداشته باشند "
            "و جست‌وجوی لفظی «لپ تاپ» مدل‌هایی با رنج‌های متفاوت سخت‌افزاری را بدون توجه به نیاز پردازشی بازگرداند."
        ),
        "spec_probe_keys": ["پردازنده", "رم", "حافظه رم", "SSD", "RAM", "CPU"],
        "inference_notes": (
            "واژهٔ «برنامه‌نویسی» یک نیاز سطح بالاست و در جدول مشخصات سخت‌افزاری وجود ندارد. "
            "حتی داشتن رم ۱۶ یا پردازندهٔ Core i7، نشان‌دهندهٔ سخت‌افزار قوی‌تر است، اما تناسب قطعی برای سبک خاصی از برنامه‌نویسی "
            "را بدون شناخت نیازمندی دقیق ابزارهای کاربر اثبات نمی‌کند."
        ),
    },
    {
        "id": "scenario_3",
        "title": "هدفون با قابلیت حذف نویز تا ۳ میلیون تومان",
        "user_message": "هدفون با قابلیت حذف نویز تا ۳ میلیون تومان",
        "budget_toman": 3000000,
        "target_category": "هدفون، هدست و هندزفری",
        "prior_expectation": (
            "انتظار پیشینی: کاربر هدفون دارای ویژگی حذف نویز (ANC / Noise Cancelling) می‌خواهد. "
            "پیش‌بینی می‌شود عبارت‌های بلند مانند «هدفون با قابلیت حذف نویز» در FTS شکست بخورند و عبارت عام «هدفون» "
            "انواع هندزفری‌های ارزان‌قیمت بدون فناوری حذف نویز فعال را بازگرداند."
        ),
        "spec_probe_keys": ["حذف نویز", "نویز", "noise", "ANC"],
        "inference_notes": (
            "ذکر قابلیت حذف نویز در توضیحات یا مشخصات، الزماً به معنای عملکرد یکسان یا رضایت‌بخش نیست. "
            "تطابق کلمهٔ «نویز» ممکن است به مشخصاتی مثل «نسبت سیگنال به نویز» اشاره داشته باشد و نه حذف نویز فعال."
        ),
    },
    {
        "id": "scenario_4",
        "title": "ساعت هوشمند ضد آب تا ۲ میلیون تومان",
        "user_message": "ساعت هوشمند ضد آب تا ۲ میلیون تومان",
        "budget_toman": 2000000,
        "target_category": "ساعت و مچ بند هوشمند",
        "prior_expectation": (
            "انتظار پیشینی: کاربر ساعت هوشمند با گواهی مقاومت در برابر آب (مانند IP68 یا 5ATM) می‌خواهد. "
            "پیش‌بینی می‌شود عبارت ترکیبی «ساعت هوشمند ضد آب» به دلیل تطابق AND در FTS با عنوان‌ها شکست بخورد یا "
            "لوازم جانبی مانند کاور یا بند ضدآب را بازگرداند."
        ),
        "spec_probe_keys": ["ضد آب", "مقاوم در برابر", "گواهینامه", "IP68", "IP67", "5ATM"],
        "inference_notes": (
            "تطابق واژهٔ «آب» ممکن است به مقادیر دیگری مانند رنگ «آبی» برخورد کند. همچنین مقاومت در برابر پاشش آب (Splash) "
            "با شنا یا غوطه‌وری کامل تفاوت دارد و نیاز به تمایز دقیق متن مشخصه دارد."
        ),
    },
]


def evaluate_scenario(catalogue: Catalogue, scenario: dict) -> dict:
    req = AssistantRequest(
        request_id="00000000-0000-0000-0000-000000000001",
        messages=[Message(role="user", content=scenario["user_message"])],
        max_price_toman=str(scenario["budget_toman"]),
    )
    choices = query_choices(req)
    
    choices_analysis = {}
    for choice in choices:
        search_res = catalogue.search(choice, limit=12, offset=0, max_price=scenario["budget_toman"])
        items = search_res["items"]
        
        target_cat_count = 0
        items_with_spec_evidence = 0
        insufficient_evidence_count = 0
        
        sample_findings = []
        for it in items:
            is_target_cat = it.get("category_name") == scenario["target_category"]
            if is_target_cat:
                target_cat_count += 1
            
            specs = it.get("specs") or []
            matched_spec_entries = []
            
            for s in specs:
                sec = str(s.get("section") or "")
                k = str(s.get("key") or "")
                v = str(s.get("value") or "")
                
                # Check for exact probe key matches in section/key/value
                for probe in scenario["spec_probe_keys"]:
                    if probe.lower() in k.lower() or probe.lower() in v.lower() or probe.lower() in sec.lower():
                        # Guard against accidental substring false positives (e.g., "آبی" matching "آب")
                        if probe == "آب" and "آبی" in v and "ضد آب" not in v and "مقاوم" not in k:
                            continue
                        matched_spec_entries.append({
                            "section": sec,
                            "key": k,
                            "value": v,
                            "matched_probe": probe,
                        })
            
            has_evidence = len(matched_spec_entries) > 0
            if has_evidence:
                items_with_spec_evidence += 1
            else:
                insufficient_evidence_count += 1
                
            if len(sample_findings) < 3:
                sample_findings.append({
                    "product_id": it["product_id"],
                    "persian_title": it["persian_title"],
                    "category_name": it["category_name"],
                    "spec_entries_count": len(specs),
                    "matched_specs_sample": matched_spec_entries[:3],
                    "evidence_status": "has_potential_specs" if has_evidence else "insufficient_evidence",
                })
        
        choices_analysis[choice] = {
            "returned_items_count": len(items),
            "target_category_items_count": target_cat_count,
            "non_target_category_items_count": len(items) - target_cat_count,
            "items_with_spec_evidence_count": items_with_spec_evidence,
            "items_with_insufficient_evidence_count": insufficient_evidence_count,
            "ranking_basis": "ORDER BY product_search.rank, p.product_id (FTS relevance rank, then product ID)",
            "sample_products": sample_findings,
        }
        
    return {
        "scenario_id": scenario["id"],
        "title": scenario["title"],
        "user_message": scenario["user_message"],
        "budget_toman": scenario["budget_toman"],
        "target_category": scenario["target_category"],
        "prior_expectation": scenario["prior_expectation"],
        "inference_notes": scenario["inference_notes"],
        "generated_query_choices": choices,
        "choices_analysis": choices_analysis,
    }


def run_evaluation(database_path: Path, output_path: Path | None = None) -> dict:
    if not database_path.exists():
        raise FileNotFoundError(f"Catalogue database not found at {database_path}")
        
    catalogue = Catalogue(database_path)
    
    scenario_reports = []
    for sc in REPRESENTATIVE_SCENARIOS:
        report = evaluate_scenario(catalogue, sc)
        scenario_reports.append(report)
        
    summary = {
        "evaluation_name": "offline_needs_to_specs_gap_evaluation",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "database_path": str(database_path.resolve()),
        "sample_size": len(scenario_reports),
        "scope_boundary": "Representative small sample of 4 scenarios; not an assertion of overall assistant accuracy.",
        "scenarios": scenario_reports,
    }
    
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate retrieval gap and spec evidence for representative user needs.")
    parser.add_argument("--database", type=Path, default=Path(".local/catalogue.sqlite3"), help="Path to SQLite catalogue")
    parser.add_argument("--output", type=Path, default=Path(".local/eval/needs_evaluation.json"), help="Output path for evaluation report")
    args = parser.parse_args()
    
    try:
        report = run_evaluation(args.database, args.output)
        print(f"Evaluation finished successfully. Analyzed {report['sample_size']} scenarios.")
        if args.output:
            print(f"Report saved to: {args.output}")
        return 0
    except Exception as exc:
        sys.stderr.write(f"Evaluation error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
