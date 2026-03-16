"""Tests for the campaign chapter system seed data."""

import pytest
from app.seed.chapter_data import CHAPTERS


EXPECTED_CHAPTER_KEYS = ["sahara_crisis", "pacific_tensions", "arctic_shadow"]
REQUIRED_FIELDS = ["title", "description", "briefing", "min_rank", "reward_money", "reward_rp"]


class TestChapterData:
    """Tests for CHAPTERS seed data."""

    def test_has_3_chapters(self):
        assert len(CHAPTERS) == 3

    def test_expected_chapter_keys(self):
        for key in EXPECTED_CHAPTER_KEYS:
            assert key in CHAPTERS, f"Missing chapter: {key}"

    @pytest.mark.parametrize("key", EXPECTED_CHAPTER_KEYS)
    def test_chapter_has_required_fields(self, key):
        chapter = CHAPTERS[key]
        for field in REQUIRED_FIELDS:
            assert field in chapter, f"Chapter '{key}' missing field: {field}"

    def test_sahara_min_rank_0(self):
        assert CHAPTERS["sahara_crisis"]["min_rank"] == 0

    def test_pacific_min_rank_1(self):
        assert CHAPTERS["pacific_tensions"]["min_rank"] == 1

    def test_arctic_min_rank_2(self):
        assert CHAPTERS["arctic_shadow"]["min_rank"] == 2

    def test_reward_money_increases_with_rank(self):
        sahara = CHAPTERS["sahara_crisis"]["reward_money"]
        pacific = CHAPTERS["pacific_tensions"]["reward_money"]
        arctic = CHAPTERS["arctic_shadow"]["reward_money"]
        assert sahara < pacific < arctic, \
            f"Rewards should increase: sahara={sahara}, pacific={pacific}, arctic={arctic}"

    def test_reward_rp_increases_with_rank(self):
        sahara = CHAPTERS["sahara_crisis"]["reward_rp"]
        pacific = CHAPTERS["pacific_tensions"]["reward_rp"]
        arctic = CHAPTERS["arctic_shadow"]["reward_rp"]
        assert sahara < pacific < arctic

    def test_titles_are_nonempty_strings(self):
        for key, chapter in CHAPTERS.items():
            assert isinstance(chapter["title"], str) and len(chapter["title"]) > 0

    def test_descriptions_are_nonempty(self):
        for key, chapter in CHAPTERS.items():
            assert isinstance(chapter["description"], str) and len(chapter["description"]) > 10

    def test_briefings_are_nonempty(self):
        for key, chapter in CHAPTERS.items():
            assert isinstance(chapter["briefing"], str) and len(chapter["briefing"]) > 10

    def test_rewards_are_positive(self):
        for key, chapter in CHAPTERS.items():
            assert chapter["reward_money"] > 0, f"{key} reward_money not positive"
            assert chapter["reward_rp"] > 0, f"{key} reward_rp not positive"

    def test_min_rank_is_non_negative(self):
        for key, chapter in CHAPTERS.items():
            assert chapter["min_rank"] >= 0
