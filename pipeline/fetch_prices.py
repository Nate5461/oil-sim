#!/usr/bin/env python3
"""Fetch EIA's daily WTI spot price at Cushing, Oklahoma into data/wti_daily.json.

Series RWTC from EIA's API v2 (route petroleum/pri/spt), 1986 to the latest
published day. Needs a free API key from https://www.eia.gov/opendata/register.php,
set as EIA_API_KEY in .env at the repo root (or in the environment).

    python3 pipeline/fetch_prices.py

Standard library only. This is the only code that touches the data source, so
switching sources means replacing this script and keeping the output format.
"""

from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
OUT_FILE = ROOT / "data" / "wti_daily.json"

API_URL = "https://api.eia.gov/v2/petroleum/pri/spt/data/"
SERIES = "RWTC"
PAGE_SIZE = 5000  # API v2 returns at most 5,000 rows per JSON request
MAX_GAP = 5  # report runs of more than this many missing trading days


def load_api_key() -> str:
    key = os.environ.get("EIA_API_KEY", "")
    if not key and ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "EIA_API_KEY":
                key = value
    key = key.strip().strip("'\"")
    if not key:
        raise SystemExit("EIA_API_KEY is missing: add it to .env at the repo root.")
    return key


def get_json(url: str, api_key: str) -> dict:
    """GET a URL and parse the JSON body, failing with EIA's own error text."""
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        body = err.read().decode(errors="replace")
        try:
            detail = json.loads(body)["error"]
        except (ValueError, KeyError, TypeError):
            detail = body[:500]
        message = f"EIA returned HTTP {err.code}: {detail}"
    except OSError as err:  # URLError, timeouts, dropped connections
        message = f"Could not reach EIA: {getattr(err, 'reason', err)}"
    # The URL carries the key, and EIA echoes request parameters back.
    raise SystemExit(message.replace(api_key, "***"))


def fetch_rows(api_key: str) -> list[dict]:
    """Every RWTC daily row, oldest first, PAGE_SIZE rows per request."""
    rows: list[dict] = []
    total = None
    while total is None or len(rows) < total:
        params = {
            "api_key": api_key,
            "frequency": "daily",  # the route defaults to weekly
            "data[0]": "value",
            "facets[series][]": SERIES,
            # A fixed order keeps offset paging stable.
            "sort[0][column]": "period",
            "sort[0][direction]": "asc",
            "offset": len(rows),
            "length": PAGE_SIZE,
        }
        url = f"{API_URL}?{urllib.parse.urlencode(params)}"
        response = get_json(url, api_key)["response"]
        page_total = int(response["total"])  # EIA sends it as a string
        if total is not None and page_total != total:
            raise SystemExit("EIA's row count changed mid-fetch; run the script again.")
        total = page_total
        if not response["data"]:
            break
        rows.extend(response["data"])
    if not rows:
        raise SystemExit(f"EIA returned no rows for {SERIES}.")
    if len(rows) != total:
        raise SystemExit(f"Expected {total} rows from EIA, got {len(rows)}.")
    return rows


def parse_rows(rows: list[dict]) -> tuple[list[str], list[float]]:
    """Dates and prices sorted by date. Fails on any row that isn't a clean
    RWTC price in dollars per barrel, rather than guessing what to do with it."""
    pairs = []
    for row in rows:
        period = row.get("period")
        try:
            price = float(row.get("value"))  # EIA sends values as strings
            day = date.fromisoformat(period)
        except (TypeError, ValueError):
            raise SystemExit(f"Unexpected row from EIA: {row}") from None
        if (
            row.get("series") != SERIES
            or row.get("units") != "$/BBL"
            or day.isoformat() != period
            or not math.isfinite(price)
        ):
            raise SystemExit(f"Unexpected row from EIA: {row}")
        pairs.append((period, price))
    pairs.sort()
    return [d for d, _ in pairs], [p for _, p in pairs]


def missing_trading_days(a: date, b: date) -> int:
    """Weekdays strictly between two consecutive price dates. Weekdays stand in
    for trading days, so a market holiday counts as one missing day."""
    return sum((a + timedelta(days=n)).weekday() < 5 for n in range(1, (b - a).days))


def validate(dates: list[str], prices: list[float]) -> bool:
    """Print the checks from PLAN.md. Returns False if the data can't be written."""
    days = [date.fromisoformat(d) for d in dates]
    lo = min(range(len(prices)), key=prices.__getitem__)
    hi = max(range(len(prices)), key=prices.__getitem__)
    duplicates = sorted(d for d, n in Counter(dates).items() if n > 1)
    gaps = [
        (a, b, missing)
        for a, b in zip(days, days[1:])
        if (missing := missing_trading_days(a, b)) > MAX_GAP
    ]
    non_positive = [(d, p) for d, p in zip(dates, prices) if p <= 0]

    print(f"Rows: {len(dates)}")
    print(f"First date: {dates[0]}")
    print(f"Last date: {dates[-1]}")
    print(f"Min price: {prices[lo]:.2f} on {dates[lo]}")
    print(f"Max price: {prices[hi]:.2f} on {dates[hi]}")
    print(f"Duplicate dates: {len(duplicates) or 'none'}")
    for d in duplicates:
        print(f"  {d}")
    print(f"Gaps longer than {MAX_GAP} trading days: {len(gaps) or 'none'}")
    for a, b, missing in gaps:
        print(f"  {a} to {b} ({missing} trading days)")
    print(f"Prices at or below 0: {len(non_positive) or 'none'}")
    for d, p in non_positive:
        print(f"  {d}: {p:.2f}")
    return not duplicates


def write(dates: list[str], prices: list[float], retrieved: str) -> None:
    OUT_FILE.parent.mkdir(exist_ok=True)
    data = {
        "series": SERIES,
        "source": "U.S. Energy Information Administration",
        "retrieved": retrieved,
        "unit": "USD/bbl",
        "dates": dates,
        "prices": prices,
    }
    # One value per line, so a refresh diffs as the days it added or revised.
    OUT_FILE.write_text(json.dumps(data, indent=2) + "\n")


def main() -> None:
    api_key = load_api_key()
    dates, prices = parse_rows(fetch_rows(api_key))
    retrieved = date.today().isoformat()
    print(f"EIA {SERIES}, WTI spot price at Cushing, OK, retrieved {retrieved}")
    if not validate(dates, prices):
        raise SystemExit(f"Not writing {OUT_FILE.relative_to(ROOT)}: duplicate dates.")
    write(dates, prices, retrieved)
    print(f"Wrote {OUT_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
