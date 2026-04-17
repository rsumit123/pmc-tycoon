from pathlib import Path
from app.content.loader import load_intel_templates


def test_templates_load():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    assert len(tpls) >= 12


def test_every_template_has_required_fields():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    for t in tpls:
        assert t.id
        assert t.faction in ("PLAAF", "PAF", "PLAN")
        assert t.source_types, "source_types must be non-empty"
        for s in t.source_types:
            assert s in ("HUMINT", "SIGINT", "IMINT", "OSINT", "ELINT")
        assert t.headline_template
        assert t.subject_type in (
            "base_rotation", "force_count", "doctrine_guess",
            "system_activation", "deployment_observation",
        )


def test_template_ids_are_unique():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    ids = [t.id for t in tpls]
    assert len(ids) == len(set(ids)), "template ids must be unique"


def test_registry_caches_templates():
    from app.content.registry import intel_templates
    a = intel_templates()
    b = intel_templates()
    assert a is b


def test_template_trigger_can_be_empty():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    # At least one template with no trigger (always eligible)
    assert any(t.trigger is None or t.trigger == {} for t in tpls)
