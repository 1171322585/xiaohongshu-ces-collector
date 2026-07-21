#!/usr/bin/env python3
"""Safely score and filter Xiaohongshu note metadata from a JSON array."""

from __future__ import annotations

import argparse
import ast
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ALLOWED_BINARY = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
}
ALLOWED_UNARY = {
    ast.UAdd: lambda value: +value,
    ast.USub: lambda value: -value,
    ast.Not: lambda value: not value,
}
ALLOWED_COMPARE = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="UTF-8 JSON array path, or - for stdin")
    parser.add_argument("--output", default="-", help="Output JSON path, or - for stdout")
    parser.add_argument("--formula", required=True, help="Arithmetic score expression")
    parser.add_argument("--rule", action="append", required=True, help="Boolean eligibility expression; repeatable")
    parser.add_argument("--count", type=int, required=True, help="Maximum qualifying notes to return")
    parser.add_argument("--backup-count", type=int, default=0, help="Number of extra qualifying notes to return")
    parser.add_argument("--include-rejected", action="store_true", help="Include rejected row details")
    parser.add_argument("--as-of", help="ISO-8601 timestamp used to compute age_days; defaults to now")
    parser.add_argument(
        "--reject-regex",
        action="append",
        default=[],
        help="Case-insensitive regex rejected when found in title, body, or comments_text; repeatable",
    )
    return parser.parse_args()


def read_json(path: str) -> Any:
    if path == "-":
        return json.load(sys.stdin)
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, value: Any) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path == "-":
        sys.stdout.write(text)
        return
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding="utf-8")


def numeric(item: dict[str, Any], *names: str) -> float:
    for name in names:
        value = item.get(name)
        if value not in (None, ""):
            return float(value)
    return math.nan


def boolean_number(value: Any) -> float:
    if value is None:
        return math.nan
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return 1.0 if value else 0.0
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "international", "国际"}:
        return 1.0
    if text in {"0", "false", "no", "domestic", "国内"}:
        return 0.0
    return math.nan


def flatten_text(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, dict):
        return "\n".join(flatten_text(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return "\n".join(flatten_text(item) for item in value)
    return str(value)


def candidate_text(item: dict[str, Any]) -> str:
    return "\n".join(
        flatten_text(item.get(name))
        for name in ("title", "body", "comments_text", "visible_comments")
    )


def parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def evaluate(node: ast.AST, values: dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return evaluate(node.body, values)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float, bool)):
        return node.value
    if isinstance(node, ast.Name) and node.id in values:
        return values[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in ALLOWED_BINARY:
        return ALLOWED_BINARY[type(node.op)](evaluate(node.left, values), evaluate(node.right, values))
    if isinstance(node, ast.UnaryOp) and type(node.op) in ALLOWED_UNARY:
        return ALLOWED_UNARY[type(node.op)](evaluate(node.operand, values))
    if isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
        results = [bool(evaluate(value, values)) for value in node.values]
        return all(results) if isinstance(node.op, ast.And) else any(results)
    if isinstance(node, ast.Compare):
        left = evaluate(node.left, values)
        for operator, comparator in zip(node.ops, node.comparators):
            if type(operator) not in ALLOWED_COMPARE:
                raise ValueError(f"Unsupported comparison: {type(operator).__name__}")
            right = evaluate(comparator, values)
            if not ALLOWED_COMPARE[type(operator)](left, right):
                return False
            left = right
        return True
    raise ValueError(f"Unsupported expression element: {type(node).__name__}")


def compile_expression(text: str) -> ast.Expression:
    tree = ast.parse(text, mode="eval")
    if not isinstance(tree, ast.Expression):
        raise ValueError("Expression required")
    return tree


def canonical_values(item: dict[str, Any], as_of: datetime) -> dict[str, float]:
    published = parse_datetime(
        item.get("published_at", item.get("publishedAt", item.get("time")))
    )
    age_days = math.nan if published is None else (as_of - published).total_seconds() / 86400
    published_valid = 1.0 if math.isfinite(age_days) and age_days >= 0 else 0.0
    international = item.get("is_international")
    if international is None:
        international = item.get("region", "")
    return {
        "likes": numeric(item, "likes", "likedCount", "liked_count"),
        "comments": numeric(item, "comments", "commentCount", "comment_count"),
        "collects": numeric(item, "collects", "collectedCount", "collected_count", "favorites"),
        "fans": numeric(item, "fans", "fanCount", "fan_count", "followers"),
        "age_days": age_days,
        "published_valid": published_valid,
        "is_international": boolean_number(international),
    }


def main() -> int:
    args = parse_args()
    if args.count < 1:
        raise ValueError("--count must be at least 1")
    if args.backup_count < 0:
        raise ValueError("--backup-count must be at least 0")

    as_of = parse_datetime(args.as_of) if args.as_of else datetime.now(timezone.utc)
    if as_of is None:
        raise ValueError("Invalid --as-of timestamp")

    items = read_json(args.input)
    if not isinstance(items, list):
        raise ValueError("Input must be a JSON array")

    formula = compile_expression(args.formula)
    rules = [(text, compile_expression(text)) for text in args.rule]
    reject_patterns = [(text, re.compile(text, re.IGNORECASE)) for text in args.reject_regex]
    qualified: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    seen: set[str] = set()

    for raw in items:
        if not isinstance(raw, dict):
            raise ValueError("Every candidate must be a JSON object")
        item = dict(raw)
        note_id = str(item.get("note_id", item.get("noteId", item.get("id", ""))))
        if note_id and note_id in seen:
            continue
        if note_id:
            seen.add(note_id)

        values = canonical_values(item, as_of)
        score = float(evaluate(formula, values))
        values["score"] = score
        failed = [text for text, tree in rules if not bool(evaluate(tree, values))]
        if not math.isfinite(score):
            failed.append("missing_or_invalid_score_input")
        if values["published_valid"] != 1:
            failed.append("missing_invalid_or_future_published_at")
        text = candidate_text(item)
        failed.extend(
            f"reject_regex:{source}"
            for source, pattern in reject_patterns
            if pattern.search(text)
        )
        item["score"] = score if math.isfinite(score) else None
        item["age_days"] = values["age_days"] if math.isfinite(values["age_days"]) else None
        if failed:
            item["failed_rules"] = failed
            rejected.append(item)
        else:
            qualified.append(item)

    score_key = lambda item: item["score"] if isinstance(item.get("score"), (int, float)) else -math.inf
    qualified.sort(key=score_key, reverse=True)
    rejected.sort(key=score_key, reverse=True)
    rejection_summary: dict[str, int] = {}
    for item in rejected:
        for rule in item["failed_rules"]:
            rejection_summary[rule] = rejection_summary.get(rule, 0) + 1

    result = {
        "formula": args.formula,
        "rules": args.rule,
        "reject_regex": args.reject_regex,
        "as_of": as_of.isoformat(),
        "requested_count": args.count,
        "qualified_count": len(qualified),
        "returned_count": min(args.count, len(qualified)),
        "qualified": qualified[: args.count],
        "backups": qualified[args.count : args.count + args.backup_count],
        "rejected_count": len(rejected),
        "rejection_summary": rejection_summary,
    }
    if args.include_rejected:
        result["rejected"] = rejected
    write_json(args.output, result)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, TypeError, ZeroDivisionError, json.JSONDecodeError, re.error) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
