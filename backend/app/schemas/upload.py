from typing import Dict

from pydantic import BaseModel, Field


class PresignRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=3, max_length=100)


class PresignResponse(BaseModel):
    upload_url: str
    method: str = "PUT"
    headers: Dict[str, str] = {}
    public_url: str
    # Local dev uploads go back to our own API and need the Bearer token; a GCS
    # signed URL must NOT carry one (it would conflict with the signature).
    requires_auth: bool = False
