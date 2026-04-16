from app.models.campaign import Campaign
from app.models.squadron import Squadron
from app.models.campaign_base import CampaignBase
from app.models.rd_program import RDProgramState
from app.models.acquisition import AcquisitionOrder
from app.models.intel import IntelCard
from app.models.adversary import AdversaryState
from app.models.vignette import Vignette


def _make_campaign(db):
    c = Campaign(
        name="T",
        seed=1,
        starting_year=2026,
        starting_quarter=2,
        current_year=2026,
        current_quarter=2,
        difficulty="realistic",
        objectives_json=[],
        budget_cr=620000,
        reputation=50,
    )
    db.add(c)
    db.commit()
    return c


def test_squadron_create(db):
    c = _make_campaign(db)
    base = CampaignBase(
        campaign_id=c.id,
        template_id="ambala",
        shelter_count=24,
        fuel_depot_size=3,
        ad_integration_level=2,
        runway_class="heavy",
    )
    db.add(base)
    db.commit()

    sq = Squadron(
        campaign_id=c.id,
        name="17 Sqn Golden Arrows",
        call_sign="GA",
        platform_id="rafale_f4",
        base_id=base.id,
        strength=18,
        readiness_pct=82,
        xp=0,
    )
    db.add(sq)
    db.commit()
    db.refresh(sq)
    assert sq.id is not None
    assert sq.platform_id == "rafale_f4"


def test_rd_program_create(db):
    c = _make_campaign(db)
    p = RDProgramState(
        campaign_id=c.id,
        program_id="amca_mk1",
        progress_pct=0,
        funding_level="standard",
        status="active",
    )
    db.add(p)
    db.commit()
    assert p.id is not None


def test_acquisition_create(db):
    c = _make_campaign(db)
    ao = AcquisitionOrder(
        campaign_id=c.id,
        platform_id="rafale_f4",
        quantity=114,
        signed_year=2026,
        signed_quarter=1,
        first_delivery_year=2027,
        first_delivery_quarter=4,
        foc_year=2032,
        foc_quarter=1,
        delivered=0,
    )
    db.add(ao)
    db.commit()
    assert ao.id is not None


def test_intel_card_create(db):
    c = _make_campaign(db)
    card = IntelCard(
        campaign_id=c.id,
        appeared_year=2026,
        appeared_quarter=2,
        source_type="IMINT",
        confidence=0.8,
        truth_value=True,
        payload={"headline": "J-20 brigade rotated to Hotan"},
    )
    db.add(card)
    db.commit()
    assert card.id is not None


def test_adversary_state_create(db):
    c = _make_campaign(db)
    st = AdversaryState(
        campaign_id=c.id,
        faction="PLAAF",
        state={"j20_count": 500},
    )
    db.add(st)
    db.commit()
    assert st.id is not None


def test_vignette_create(db):
    c = _make_campaign(db)
    v = Vignette(
        campaign_id=c.id,
        year=2029,
        quarter=3,
        scenario_id="lac_air_incursion_limited",
        event_trace=[{"t": 0, "evt": "detect"}],
        aar_text="...",
        outcome={"india_kia": 1, "adversary_kia": 3},
    )
    db.add(v)
    db.commit()
    assert v.id is not None
