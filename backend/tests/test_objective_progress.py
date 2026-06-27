from app.engine.objectives import ObjectiveInputs, objective_progress

def _inputs(**kw):
    base = dict(
        squad_count=0, modern_frac=0.0, indigenous_count=0, vlo_count=0,
        has_amca_squadron=False, amca_rd_progress=0.0,
        tedbf_completed=False, tedbf_rd_progress=0.0,
        missile_sov_completed=0, deterrence_completed=0, ace_count=0,
        treasury_cr=10000, vignettes_won=0, vignettes_total=0,
    )
    base.update(kw)
    return ObjectiveInputs(**base)

def test_maintain_42_in_progress_then_met():
    p = objective_progress("maintain_42_squadrons", _inputs(squad_count=21))
    assert p.status == "in_progress" and abs(p.progress - 0.5) < 1e-9 and "21/42" in p.detail
    p2 = objective_progress("maintain_42_squadrons", _inputs(squad_count=42))
    assert p2.status == "met" and p2.progress == 1.0

def test_amca_uses_rd_progress_until_squadron_exists():
    p = objective_progress("amca_operational_by_2035", _inputs(amca_rd_progress=0.4))
    assert p.status == "in_progress" and abs(p.progress - 0.4) < 1e-9 and "40%" in p.detail
    p2 = objective_progress("amca_operational_by_2035", _inputs(has_amca_squadron=True))
    assert p2.status == "met"

def test_budget_discipline_at_risk_when_broke():
    assert objective_progress("budget_discipline", _inputs(treasury_cr=5000)).status == "met"
    assert objective_progress("budget_discipline", _inputs(treasury_cr=0)).status == "at_risk"

def test_combat_excellence_at_risk_after_enough_losses():
    p = objective_progress("combat_excellence", _inputs(vignettes_won=1, vignettes_total=6))
    assert p.status == "at_risk"
    p2 = objective_progress("combat_excellence", _inputs(vignettes_won=5, vignettes_total=6))
    assert p2.status == "met"
    p3 = objective_progress("combat_excellence", _inputs(vignettes_won=0, vignettes_total=0))
    assert p3.status == "in_progress"

def test_no_territorial_loss_flips_to_at_risk_on_a_loss():
    assert objective_progress("no_territorial_loss", _inputs(vignettes_won=3, vignettes_total=3)).status == "met"
    assert objective_progress("no_territorial_loss", _inputs(vignettes_won=2, vignettes_total=3)).status == "at_risk"

def test_unknown_objective_is_safe():
    p = objective_progress("not_a_real_objective", _inputs())
    assert p.status == "in_progress" and p.progress == 0.0
