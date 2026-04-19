"""AD systems catalog is loaded + unlock target_ids resolve."""
from app.content.registry import rd_programs, ad_systems


def test_ad_systems_catalog_loads():
    specs = ad_systems()
    # S-400 is pre-seeded (Pathankot) — must be in catalog.
    assert "s400" in specs
    # Existing R&D unlocks must resolve.
    assert "long_range_sam" in specs
    assert "project_kusha" in specs
    assert "mrsam_air" in specs


def test_s400_has_150km_coverage():
    specs = ad_systems()
    assert specs["s400"].coverage_km == 150
    assert specs["s400"].install_cost_cr > 0


def test_all_ad_system_rd_unlocks_resolve():
    """Every R&D program that unlocks an ad_system must reference a known id."""
    rd = rd_programs()
    ad = ad_systems()
    for pid, spec in rd.items():
        if spec.unlocks.kind == "ad_system":
            assert spec.unlocks.target_id in ad, (
                f"{pid} unlocks unknown ad_system {spec.unlocks.target_id}"
            )
