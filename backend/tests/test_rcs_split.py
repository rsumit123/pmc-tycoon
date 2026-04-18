from app.engine.vignette.bvr import RCS_PK_MULTIPLIER, RCS_DETECTION_MULTIPLIER
from app.engine.vignette.detection import RCS_DETECTION_RANGE_MULTIPLIER


def test_detection_and_pk_multipliers_exist_independently():
    assert "VLO" in RCS_PK_MULTIPLIER
    assert "VLO" in RCS_DETECTION_RANGE_MULTIPLIER


def test_detection_multiplier_used_for_range():
    assert RCS_DETECTION_RANGE_MULTIPLIER["VLO"] < RCS_DETECTION_RANGE_MULTIPLIER["large"]


def test_pk_multiplier_used_for_combat():
    assert RCS_PK_MULTIPLIER["VLO"] < RCS_PK_MULTIPLIER["large"]


def test_detection_and_pk_have_independent_values():
    # VLO is harder to detect (0.20) than to kill once engaged (0.25)
    assert RCS_DETECTION_RANGE_MULTIPLIER["VLO"] < RCS_PK_MULTIPLIER["VLO"]


def test_backward_compat_alias():
    # RCS_DETECTION_MULTIPLIER is still importable and equals RCS_PK_MULTIPLIER
    assert RCS_DETECTION_MULTIPLIER is RCS_PK_MULTIPLIER


def test_all_rcs_bands_present_in_both():
    bands = {"VLO", "LO", "reduced", "conventional", "large"}
    assert bands == set(RCS_PK_MULTIPLIER.keys())
    assert bands == set(RCS_DETECTION_RANGE_MULTIPLIER.keys())
