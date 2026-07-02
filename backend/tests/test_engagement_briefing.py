from app.engine.engagement import build_briefing


def _ps():
    return {
        "ao": {"region": "north", "name": "Sargodha AO", "lat": 32.0, "lon": 72.6},
        "roe_options": ["weapons_free", "weapons_tight"],
        "adversary_force": [
            {"platform_id": "jf17_blk3", "count": 6, "role": "strike"},
            {"platform_id": "j10c", "count": 4, "role": "escort"},
        ],
    }


def _committed_force(tanker=False):
    return {
        "squadrons": [{"squadron_id": 1, "airframes": 4}],
        "support": {"awacs": False, "tanker": tanker, "sead_package": False},
        "roe": "weapons_free",
    }


def _squadron_rows():
    return [
        {"id": 1, "call_sign": "Falcon", "platform_id": "su30mki", "base_id": 5, "strength": 16},
        {"id": 2, "call_sign": "Cobra", "platform_id": "tejas_mk1a", "base_id": 6, "strength": 12},
    ]


def _depot_stock():
    return {
        (5, "astra_mk1"): 40,
        (5, "r73"): 20,
        (6, "astra_mk1"): 10,
        (6, "r73"): 5,
    }


def _platform_specs():
    return {
        "su30mki": {"radar_range_km": 130, "rcs_band": "medium", "generation": 4.5},
        "tejas_mk1a": {"radar_range_km": 100, "rcs_band": "medium", "generation": 4.5},
    }


def _loadouts():
    return {
        "su30mki": {"bvr": ["astra_mk1"], "wvr": ["r73"]},
        "tejas_mk1a": {"bvr": ["astra_mk1"], "wvr": ["r73"]},
    }


def test_briefing_lists_only_committed_squadrons():
    ps = _ps()
    cf = _committed_force()
    briefing = build_briefing(ps, cf, _squadron_rows(), _depot_stock(), _platform_specs(), _loadouts())
    ids = [s["id"] for s in briefing["player_squadrons"]]
    assert ids == [1]
    assert briefing["player_squadrons"][0]["call_sign"] == "Falcon"
    assert briefing["player_squadrons"][0]["platform_id"] == "su30mki"
    assert briefing["player_squadrons"][0]["airframes_committed"] == 4
    assert briefing["player_squadrons"][0]["radar_range_km"] == 130


def test_briefing_depot_filtered_to_loadout_weapons_at_right_base():
    ps = _ps()
    cf = _committed_force()
    briefing = build_briefing(ps, cf, _squadron_rows(), _depot_stock(), _platform_specs(), _loadouts())
    depot = briefing["player_squadrons"][0]["depot"]
    assert depot == {"astra_mk1": 40, "r73": 20}


def test_briefing_tanker_flips_time_budget():
    ps = _ps()
    briefing_no_tanker = build_briefing(ps, _committed_force(tanker=False), _squadron_rows(), _depot_stock(), _platform_specs(), _loadouts())
    briefing_tanker = build_briefing(ps, _committed_force(tanker=True), _squadron_rows(), _depot_stock(), _platform_specs(), _loadouts())
    assert briefing_no_tanker["time_budget_s"] == 100
    assert briefing_tanker["time_budget_s"] == 150


def test_briefing_adversary_passthrough():
    ps = _ps()
    cf = _committed_force()
    briefing = build_briefing(ps, cf, _squadron_rows(), _depot_stock(), _platform_specs(), _loadouts())
    assert briefing["adversary"] == ps["adversary_force"]


def test_briefing_ao_roe_and_flare_stock():
    ps = _ps()
    cf = _committed_force()
    briefing = build_briefing(ps, cf, _squadron_rows(), _depot_stock(), _platform_specs(), _loadouts(), flare_stock=8)
    assert briefing["ao"] == ps["ao"]
    assert briefing["roe"] == "weapons_free"
    assert briefing["flare_stock"] == 8
    assert briefing["support"] == cf["support"]


def test_briefing_loadout_weapon_ids_bvr_and_wvr():
    ps = _ps()
    cf = _committed_force()
    briefing = build_briefing(ps, cf, _squadron_rows(), _depot_stock(), _platform_specs(), _loadouts())
    sqn = briefing["player_squadrons"][0]
    assert "loadout" in sqn
    assert sqn["loadout"]["bvr"] == ["astra_mk1"]
    assert sqn["loadout"]["wvr"] == ["r73"]
