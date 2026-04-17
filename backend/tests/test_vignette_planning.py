from app.engine.vignette.planning import haversine_km, compute_eligible_squadrons


def test_haversine_known_distance_ambala_to_hasimara():
    # Ambala (30.37, 76.81) to Hasimara (26.68, 89.35) ~ 1320 km
    d = haversine_km(30.37, 76.81, 26.68, 89.35)
    assert 1250 < d < 1400


def test_haversine_zero_distance_for_same_point():
    assert haversine_km(30.37, 76.81, 30.37, 76.81) == 0.0


def _sqn(sid=17, name="17 Sqn", platform="rafale_f4",
         base_id=1, strength=18, readiness=82, xp=0):
    return {
        "id": sid, "name": name, "platform_id": platform,
        "base_id": base_id, "strength": strength,
        "readiness_pct": readiness, "xp": xp,
    }


def _bases():
    return {
        1: {"name": "Ambala", "lat": 30.37, "lon": 76.81},
        2: {"name": "Hasimara", "lat": 26.68, "lon": 89.35},
        3: {"name": "Jodhpur", "lat": 26.25, "lon": 73.05},
    }


def _platforms():
    return {
        "rafale_f4":  {"combat_radius_km": 1850, "generation": "4.5"},
        "su30_mki":   {"combat_radius_km": 1500, "generation": "4.5"},
        "tejas_mk1a": {"combat_radius_km": 500,  "generation": "4.5"},
    }


def test_compute_eligible_returns_in_range_squadron():
    planning = {"ao": {"lat": 34.0, "lon": 78.5}}
    out = compute_eligible_squadrons(
        planning, [_sqn()], _bases(), _platforms(),
    )
    assert len(out) == 1
    row = out[0]
    assert row["squadron_id"] == 17
    assert row["in_range"] is True
    assert row["distance_km"] > 0
    # Airframes available = int(18 * 0.82) = 14
    assert row["airframes_available"] == 14


def test_compute_eligible_flags_out_of_range_but_still_lists():
    # Tejas Mk1A combat radius 500 km; Jodhpur to AO (lat=34, lon=78.5) > 600 km
    planning = {"ao": {"lat": 34.0, "lon": 78.5}}
    sq = _sqn(sid=99, platform="tejas_mk1a", base_id=3, strength=12, readiness=80)
    out = compute_eligible_squadrons(planning, [sq], _bases(), _platforms())
    assert len(out) == 1
    assert out[0]["in_range"] is False


def test_compute_eligible_zero_readiness_zero_airframes():
    planning = {"ao": {"lat": 34.0, "lon": 78.5}}
    sq = _sqn(readiness=0)
    out = compute_eligible_squadrons(planning, [sq], _bases(), _platforms())
    assert out[0]["airframes_available"] == 0


def test_compute_eligible_populates_loadout():
    planning = {"ao": {"lat": 34.0, "lon": 78.5}}
    out = compute_eligible_squadrons(planning, [_sqn()], _bases(), _platforms())
    assert "meteor" in out[0]["loadout"]
    assert "mica_ir" in out[0]["loadout"]


def test_compute_eligible_skips_squadron_without_known_base():
    planning = {"ao": {"lat": 34.0, "lon": 78.5}}
    sq = _sqn(base_id=999)
    out = compute_eligible_squadrons(planning, [sq], _bases(), _platforms())
    assert out == []


def test_compute_eligible_skips_squadron_without_known_platform():
    planning = {"ao": {"lat": 34.0, "lon": 78.5}}
    sq = _sqn(platform="mystery_jet")
    out = compute_eligible_squadrons(planning, [sq], _bases(), _platforms())
    assert out == []
