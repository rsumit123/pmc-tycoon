from app.engine.loadout_upgrade import tick_loadout_upgrades


def test_tick_completes_upgrade_when_due():
    upgrades = [
        {"id": 1, "squadron_id": 10, "weapon_id": "astra_mk3",
         "base_loadout": ["meteor", "mica_ir"],
         "completion_year": 2027, "completion_quarter": 2, "status": "pending"},
    ]
    completed, remaining = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    assert len(completed) == 1
    assert completed[0]["squadron_id"] == 10
    assert "astra_mk3" in completed[0]["final_loadout"]
    assert remaining == []


def test_tick_keeps_pending_upgrades():
    upgrades = [
        {"id": 2, "squadron_id": 11, "weapon_id": "astra_mk3",
         "base_loadout": ["meteor"],
         "completion_year": 2027, "completion_quarter": 4, "status": "pending"},
    ]
    completed, remaining = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    assert completed == []
    assert len(remaining) == 1


def test_tick_replaces_same_class_weapon_in_loadout():
    """Installing astra_mk3 should REPLACE astra_mk2 in the loadout."""
    upgrades = [
        {"id": 3, "squadron_id": 12, "weapon_id": "astra_mk3",
         "base_loadout": ["astra_mk2", "mica_ir"],
         "completion_year": 2027, "completion_quarter": 2, "status": "pending"},
    ]
    completed, _ = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    final = completed[0]["final_loadout"]
    assert "astra_mk3" in final
    assert "astra_mk2" not in final
    assert "mica_ir" in final


def test_tick_skips_non_pending_upgrades():
    upgrades = [
        {"id": 4, "squadron_id": 13, "weapon_id": "astra_mk3",
         "base_loadout": [],
         "completion_year": 2027, "completion_quarter": 2, "status": "completed"},
    ]
    completed, remaining = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    assert completed == []
    # Non-pending upgrades are NOT copied into remaining either
    assert remaining == []


def test_tick_handles_overdue_upgrade():
    """If a turn passes without tick (shouldn't happen, but safe), complete it."""
    upgrades = [
        {"id": 5, "squadron_id": 14, "weapon_id": "astra_mk3",
         "base_loadout": ["meteor"],
         "completion_year": 2026, "completion_quarter": 4, "status": "pending"},
    ]
    completed, _ = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    assert len(completed) == 1
