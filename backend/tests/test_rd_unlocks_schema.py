"""Every R&D program has a well-formed unlocks field."""
from app.content.registry import rd_programs


VALID_KINDS = {"missile", "ad_system", "isr_drone", "strike_platform", "platform", "none"}


def test_all_rd_programs_declare_unlocks():
    specs = rd_programs()
    assert len(specs) >= 20
    for pid, spec in specs.items():
        assert hasattr(spec, "unlocks"), f"{pid} missing unlocks field"
        assert spec.unlocks is not None, f"{pid} unlocks is None"
        assert spec.unlocks.kind in VALID_KINDS, f"{pid} has invalid unlock kind {spec.unlocks.kind}"


def test_missile_unlocks_reference_real_weapon_ids():
    from app.engine.vignette.bvr import WEAPONS
    specs = rd_programs()
    for pid, spec in specs.items():
        if spec.unlocks.kind == "missile":
            assert spec.unlocks.target_id in WEAPONS, \
                f"{pid} unlocks unknown missile {spec.unlocks.target_id}"


def test_eligible_platforms_are_valid_on_missile_unlocks():
    from app.content.registry import platforms
    plats = platforms()
    specs = rd_programs()
    for pid, spec in specs.items():
        if spec.unlocks.kind == "missile":
            assert spec.unlocks.eligible_platforms, f"{pid} missile has empty eligible_platforms"
            for p in spec.unlocks.eligible_platforms:
                assert p in plats, f"{pid} missile targets unknown platform {p}"
