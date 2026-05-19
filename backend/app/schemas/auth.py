import uuid
from typing import Optional
from pydantic import BaseModel, model_validator


class RegisterRequest(BaseModel):
    email: str
    full_name: str
    password: str
    is_superuser: bool = False


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "analyst"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    is_superuser: bool
    role: str = "analyst"

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def set_role(self) -> "UserResponse":
        self.role = "admin" if self.is_superuser else "analyst"
        return self


class UserUpdateRequest(BaseModel):
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
