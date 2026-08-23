from pydantic import BaseModel, Field


class FavoriteCreate(BaseModel):
    pt_slug: str = Field(min_length=1, max_length=150)


class FavoriteToggleOut(BaseModel):
    favorited: bool
    pt_slug: str
