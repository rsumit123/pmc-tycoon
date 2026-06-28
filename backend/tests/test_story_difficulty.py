import random
from app.engine.budget import compute_quarterly_grant
from app.engine.vignette.threat import (
    should_fire_vignette, DIFFICULTY_THREAT_MULTIPLIER,
)

def test_story_grant_is_double_base():
    assert compute_quarterly_grant("story", 2026) == 90000
    assert compute_quarterly_grant("realistic", 2026) == 45000

def test_threat_multiplier_table_defaults_to_one():
    assert DIFFICULTY_THREAT_MULTIPLIER.get("story") == 0.3
    assert DIFFICULTY_THREAT_MULTIPLIER.get("realistic", 1.0) == 1.0
    assert DIFFICULTY_THREAT_MULTIPLIER.get("hard_peer", 1.0) == 1.0

def test_story_threat_fires_less_often_than_default():
    base_fires = sum(should_fire_vignette(random.Random(s), 2031, 1) for s in range(400))
    story_fires = sum(should_fire_vignette(random.Random(s), 2031, 1, threat_multiplier=0.3) for s in range(400))
    assert story_fires < base_fires

def test_default_threat_multiplier_is_unchanged_behaviour():
    for s in range(50):
        a = should_fire_vignette(random.Random(s), 2030, 3)
        b = should_fire_vignette(random.Random(s), 2030, 3, threat_multiplier=1.0)
        assert a == b
