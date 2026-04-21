from pydantic import BaseModel


class Notification(BaseModel):
    id: str
    kind: str
    severity: str
    title: str
    body: str
    action_url: str
    created_at: str | None = None


class NotificationListResponse(BaseModel):
    notifications: list[Notification]
