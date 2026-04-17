from sqlalchemy.orm import Session

from app.models.campaign_base import CampaignBase
from app.models.squadron import Squadron
from app.content.registry import bases as bases_reg


def list_bases_for_campaign(db: Session, campaign_id: int) -> list[dict]:
    """Join CampaignBase rows with their YAML template (lat/lon/name) and
    the squadrons stationed at each base."""
    base_rows = db.query(CampaignBase).filter(
        CampaignBase.campaign_id == campaign_id
    ).all()
    templates = bases_reg()

    squadron_rows = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id
    ).all()
    by_base: dict[int, list[Squadron]] = {}
    for sq in squadron_rows:
        by_base.setdefault(sq.base_id, []).append(sq)

    out: list[dict] = []
    for row in base_rows:
        tpl = templates.get(row.template_id)
        if tpl is None:
            continue
        out.append({
            "id": row.id,
            "template_id": row.template_id,
            "name": tpl.name,
            "lat": tpl.lat,
            "lon": tpl.lon,
            "squadrons": [
                {
                    "id": sq.id,
                    "name": sq.name,
                    "call_sign": sq.call_sign,
                    "platform_id": sq.platform_id,
                    "strength": sq.strength,
                    "readiness_pct": sq.readiness_pct,
                    "xp": sq.xp,
                    "ace_name": sq.ace_name,
                }
                for sq in by_base.get(row.id, [])
            ],
        })
    out.sort(key=lambda b: b["template_id"])
    return out
