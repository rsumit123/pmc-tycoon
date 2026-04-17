from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.acquisition import create_order, list_orders, PlatformNotFound, InvalidDeliveryWindow
from app.schemas.acquisition import AcquisitionCreatePayload, AcquisitionRead, AcquisitionListResponse

router = APIRouter(prefix="/api/campaigns", tags=["acquisitions"])


@router.get("/{campaign_id}/acquisitions", response_model=AcquisitionListResponse)
def list_acquisitions_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_orders(db, campaign_id)
    return AcquisitionListResponse(
        orders=[AcquisitionRead.model_validate(r) for r in rows]
    )


@router.post(
    "/{campaign_id}/acquisitions",
    response_model=AcquisitionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_acquisition_endpoint(
    campaign_id: int,
    payload: AcquisitionCreatePayload,
    db: Session = Depends(get_db),
):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return create_order(
            db, campaign,
            platform_id=payload.platform_id,
            quantity=payload.quantity,
            first_delivery_year=payload.first_delivery_year,
            first_delivery_quarter=payload.first_delivery_quarter,
            foc_year=payload.foc_year,
            foc_quarter=payload.foc_quarter,
            total_cost_cr=payload.total_cost_cr,
        )
    except PlatformNotFound:
        raise HTTPException(status_code=404, detail=f"Platform {payload.platform_id} not in registry")
    except InvalidDeliveryWindow as e:
        raise HTTPException(status_code=400, detail=str(e))
