from pathlib import Path
import pytest
import yaml

from app.content.loader import load_platforms, PlatformSpec


def test_load_platforms_returns_dict_by_id(tmp_path: Path):
    yaml_path = tmp_path / "platforms.yaml"
    yaml_path.write_text(yaml.safe_dump({
        "platforms": [
            {
                "id": "rafale_f4",
                "name": "Dassault Rafale F4",
                "origin": "France",
                "role": "multirole",
                "generation": "4.5",
                "combat_radius_km": 1850,
                "payload_kg": 9500,
                "rcs_band": "reduced",
                "radar_range_km": 200,
                "cost_cr": 4500,
                "intro_year": 2020,
            }
        ]
    }))

    result = load_platforms(yaml_path)

    assert "rafale_f4" in result
    assert isinstance(result["rafale_f4"], PlatformSpec)
    assert result["rafale_f4"].name == "Dassault Rafale F4"
    assert result["rafale_f4"].combat_radius_km == 1850


def test_load_platforms_missing_required_field_raises(tmp_path: Path):
    yaml_path = tmp_path / "platforms.yaml"
    yaml_path.write_text(yaml.safe_dump({
        "platforms": [
            {"id": "broken", "name": "Broken"}
        ]
    }))

    with pytest.raises(Exception):
        load_platforms(yaml_path)


def test_load_platforms_empty_file_returns_empty_dict(tmp_path: Path):
    yaml_path = tmp_path / "platforms.yaml"
    yaml_path.write_text("")

    result = load_platforms(yaml_path)

    assert result == {}
