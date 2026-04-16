"""End-of-turn orchestrator.

Pure function. Takes a context dict (current campaign state +
spec registry), returns an EngineResult containing all mutations
to apply and the events to log. The CRUD layer translates ORM rows
to/from the dict shape this engine expects.

Order of operations (locked):
    1. Normalize + validate allocation
    2. Apply quarterly grant to treasury
    3. R&D tick
    4. Acquisition tick
    5. Readiness tick
    6. Deduct allocation from treasury
    7. Advance clock
    8. Emit turn_advanced event
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from app.engine.budget import normalize_allocation, validate_allocation
from app.engine.rng import subsystem_rng
from app.engine.rd import tick_rd
from app.engine.acquisition import tick_acquisitions
from app.engine.readiness import tick_readiness


@dataclass
class EngineResult:
    next_year: int
    next_quarter: int
    next_treasury_cr: int
    next_rd_states: list[dict]
    next_acquisition_orders: list[dict]
    next_squadrons: list[dict]
    events: list[dict] = field(default_factory=list)


def _next_clock(year: int, quarter: int) -> tuple[int, int]:
    if quarter == 4:
        return year + 1, 1
    return year, quarter + 1


def advance(ctx: dict[str, Any]) -> EngineResult:
    seed = ctx["seed"]
    year = ctx["year"]
    quarter = ctx["quarter"]
    grant = ctx["quarterly_grant_cr"]

    available_cr = ctx["treasury_cr"] + grant
    allocation = normalize_allocation(ctx["current_allocation_json"], grant)
    validate_allocation(allocation, available_cr)

    events: list[dict] = []

    # Deep-copy mutable inputs so advance() is genuinely pure with respect to
    # the caller's state, regardless of how each subsystem handles its inputs.
    rd_states_in = copy.deepcopy(ctx["rd_states"])
    orders_in = copy.deepcopy(ctx["acquisition_orders"])
    squadrons_in = copy.deepcopy(ctx["squadrons"])

    rd_rng = subsystem_rng(seed, "rd", year, quarter)
    next_rd, rd_events = tick_rd(
        rd_states_in, ctx["rd_specs"], allocation["rd"], rd_rng,
    )
    events.extend(rd_events)

    next_orders, acq_events = tick_acquisitions(
        orders_in, year, quarter, allocation["acquisition"],
    )
    events.extend(acq_events)

    readiness_rng = subsystem_rng(seed, "readiness", year, quarter)
    next_squadrons, rd_events2 = tick_readiness(
        squadrons_in, allocation["om"], allocation["spares"], readiness_rng,
    )
    events.extend(rd_events2)

    next_treasury = available_cr - sum(allocation.values())
    next_year, next_quarter = _next_clock(year, quarter)

    events.append({
        "event_type": "turn_advanced",
        "payload": {
            "from_year": year, "from_quarter": quarter,
            "to_year": next_year, "to_quarter": next_quarter,
            "grant_cr": grant,
            "allocation": allocation,
            "treasury_after_cr": next_treasury,
        },
    })

    return EngineResult(
        next_year=next_year,
        next_quarter=next_quarter,
        next_treasury_cr=next_treasury,
        next_rd_states=next_rd,
        next_acquisition_orders=next_orders,
        next_squadrons=next_squadrons,
        events=events,
    )
