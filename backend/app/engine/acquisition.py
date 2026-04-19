"""Acquisition delivery queue tick.

Pure function. Each quarter, every active order checks its delivery
window. Within [first_delivery, foc] (inclusive), the quarterly
delivery slice = quantity // total_quarters; the final quarter takes
the remainder. Cost is total_cost_cr // total_quarters per quarter
(remainder absorbed into the final quarter as well).

If the acquisition bucket is short, the engine logs an
acquisition_underfunded warning but the delivery still proceeds in
MVP — schedule slip from underfunding lands in a future plan.
"""

from __future__ import annotations


def total_quarters(first_year: int, first_q: int, foc_year: int, foc_q: int) -> int:
    return (foc_year - first_year) * 4 + (foc_q - first_q) + 1


def _quarter_index(year: int, quarter: int) -> int:
    return year * 4 + (quarter - 1)


def tick_acquisitions(
    orders: list[dict],
    year: int,
    quarter: int,
    acq_bucket_cr: int,
) -> tuple[list[dict], list[dict]]:
    out: list[dict] = [dict(o) for o in orders]
    events: list[dict] = []
    bucket_remaining = acq_bucket_cr

    now = _quarter_index(year, quarter)

    for order in out:
        if order.get("cancelled"):
            continue
        first_idx = _quarter_index(order["first_delivery_year"], order["first_delivery_quarter"])
        foc_idx = _quarter_index(order["foc_year"], order["foc_quarter"])
        if now < first_idx or now > foc_idx:
            continue
        if order["delivered"] >= order["quantity"]:
            continue

        n_qtrs = total_quarters(
            order["first_delivery_year"], order["first_delivery_quarter"],
            order["foc_year"], order["foc_quarter"],
        )
        per_qtr = order["quantity"] // n_qtrs
        per_qtr_cost = order["total_cost_cr"] // n_qtrs

        is_final = now == foc_idx
        if is_final:
            count = order["quantity"] - order["delivered"]
            cost = order["total_cost_cr"] - per_qtr_cost * (n_qtrs - 1)
        else:
            count = per_qtr
            cost = per_qtr_cost

        if count <= 0:
            continue

        if cost > bucket_remaining:
            events.append({
                "event_type": "acquisition_underfunded",
                "payload": {
                    "order_id": order["id"],
                    "platform_id": order["platform_id"],
                    "needed_cr": cost,
                    "available_cr": bucket_remaining,
                },
            })

        bucket_remaining = max(0, bucket_remaining - cost)
        order["delivered"] += count

        events.append({
            "event_type": "acquisition_delivery",
            "payload": {
                "order_id": order["id"],
                "platform_id": order["platform_id"],
                "count": count,
                "cost_cr": cost,
                "delivered_total": order["delivered"],
                "quantity": order["quantity"],
            },
        })

        if order["delivered"] >= order["quantity"]:
            events.append({
                "event_type": "acquisition_completed",
                "payload": {
                    "order_id": order["id"],
                    "platform_id": order["platform_id"],
                    "quantity": order["quantity"],
                },
            })

    return out, events
