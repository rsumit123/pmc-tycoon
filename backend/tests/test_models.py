from app.models.campaign import Campaign
from app.models.event import CampaignEvent


def test_create_campaign(db):
    c = Campaign(
        name="Singh-era modernization",
        seed=42,
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
    db.refresh(c)

    assert c.id is not None
    assert c.current_year == 2026
    assert c.current_quarter == 2
    assert c.budget_cr == 620000


def test_create_campaign_event(db):
    c = Campaign(
        name="Test",
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

    e = CampaignEvent(
        campaign_id=c.id,
        year=2026,
        quarter=2,
        event_type="campaign_created",
        payload={"note": "test"},
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    assert e.id is not None
    assert e.event_type == "campaign_created"
    assert e.payload["note"] == "test"
