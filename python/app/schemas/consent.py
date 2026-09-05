from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class MailboxConsentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_email: Optional[str] = None
    provider: str
    consent_given: bool
    consent_timestamp: Optional[datetime] = None
    scopes_granted: Optional[str] = None
    is_sync_enabled: bool
    auto_create_applications: bool = True
    last_synced_at: Optional[datetime] = None
    last_history_id: Optional[str] = None


class MailboxConsentUpdate(BaseModel):
    consent_given: bool
    is_sync_enabled: Optional[bool] = None
    auto_create_applications: Optional[bool] = None
