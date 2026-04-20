from app.engine.acquisition import tick_acquisitions, total_quarters


def _order(
    order_id=1,
    platform_id="rafale_f4",
    quantity=12,
    first=(2027, 4),
    foc=(2030, 3),
    delivered=0,
    total_cost=120000,
):
    return {
        "id": order_id,
        "platform_id": platform_id,
        "quantity": quantity,
        "first_delivery_year": first[0],
        "first_delivery_quarter": first[1],
        "foc_year": foc[0],
        "foc_quarter": foc[1],
        "delivered": delivered,
        "total_cost_cr": total_cost,
    }


def test_total_quarters_counts_inclusive_range():
    # 2027-Q4 .. 2030-Q3 inclusive = 12 quarters
    assert total_quarters(2027, 4, 2030, 3) == 12
    assert total_quarters(2027, 1, 2027, 1) == 1
    assert total_quarters(2027, 1, 2027, 4) == 4


def test_no_delivery_before_first_delivery_quarter():
    out, events = tick_acquisitions(
        [_order(first=(2027, 4), foc=(2030, 3))],
        year=2027, quarter=3, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 0
    assert not any(e["event_type"] == "acquisition_delivery" for e in events)


def test_delivery_starts_on_first_delivery_quarter():
    # 12 airframes over 12 quarters = 1/qtr; 120000 / 12 = 10000 cr/qtr
    out, events = tick_acquisitions(
        [_order(quantity=12, first=(2027, 4), foc=(2030, 3), total_cost=120000)],
        year=2027, quarter=4, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 1
    delivery_events = [e for e in events if e["event_type"] == "acquisition_delivery"]
    assert len(delivery_events) == 1
    assert delivery_events[0]["payload"]["count"] == 1
    assert delivery_events[0]["payload"]["cost_cr"] == 10000


def test_no_delivery_after_foc_quarter():
    out, events = tick_acquisitions(
        [_order(first=(2027, 4), foc=(2030, 3), delivered=12)],
        year=2030, quarter=4, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 12
    assert not any(e["event_type"] == "acquisition_delivery" for e in events)


def test_remainder_lands_in_final_quarter():
    # 14 airframes over 12 quarters: 1/qtr * 11 + final qtr = 14 - 11 = 3
    out, events = tick_acquisitions(
        [_order(quantity=14, first=(2027, 4), foc=(2030, 3), total_cost=120000, delivered=11)],
        year=2030, quarter=3, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 14
    delivery_events = [e for e in events if e["event_type"] == "acquisition_delivery"]
    assert delivery_events[0]["payload"]["count"] == 3


def test_completion_event_on_final_delivery():
    out, events = tick_acquisitions(
        [_order(quantity=12, first=(2027, 4), foc=(2030, 3), delivered=11, total_cost=120000)],
        year=2030, quarter=3, acq_bucket_cr=1_000_000,
    )
    assert any(e["event_type"] == "acquisition_completed" for e in events)
    assert out[0]["delivered"] == 12


def test_severely_underfunded_bucket_slips_delivery():
    # Needs 10000 cr/q; bucket has 0 (<50% of per-qtr cost) → slip, no delivery.
    out, events = tick_acquisitions(
        [_order(quantity=12, first=(2027, 4), foc=(2030, 3), total_cost=120000)],
        year=2027, quarter=4, acq_bucket_cr=0,
    )
    assert out[0]["delivered"] == 0  # no free delivery
    assert any(e["event_type"] == "acquisition_slipped" for e in events)
    # FOC pushed from 2030-Q3 to 2030-Q4.
    assert (out[0]["foc_year"], out[0]["foc_quarter"]) == (2030, 4)


def test_partially_underfunded_bucket_logs_warning_but_delivers():
    # Needs 10000 cr/q; bucket has 6000 (>=50% but <100%) → proceed + log.
    out, events = tick_acquisitions(
        [_order(quantity=12, first=(2027, 4), foc=(2030, 3), total_cost=120000)],
        year=2027, quarter=4, acq_bucket_cr=6000,
    )
    assert out[0]["delivered"] == 1  # delivery proceeds
    assert any(e["event_type"] == "acquisition_underfunded" for e in events)


def test_multiple_orders_processed_independently():
    orders = [
        _order(order_id=1, first=(2027, 4), foc=(2030, 3)),
        _order(order_id=2, first=(2026, 1), foc=(2030, 4), delivered=0, quantity=20, total_cost=200000),
    ]
    out, events = tick_acquisitions(orders, year=2027, quarter=4, acq_bucket_cr=1_000_000)
    # Order 1 delivers 1; order 2 delivers 1 too (20/20=1)
    assert out[0]["delivered"] == 1
    assert out[1]["delivered"] == 1


def test_deterministic_with_same_inputs():
    orders = [_order(quantity=12, first=(2027, 4), foc=(2030, 3))]
    a, ev_a = tick_acquisitions([dict(o) for o in orders], 2027, 4, 1_000_000)
    b, ev_b = tick_acquisitions([dict(o) for o in orders], 2027, 4, 1_000_000)
    assert a == b
    assert ev_a == ev_b
