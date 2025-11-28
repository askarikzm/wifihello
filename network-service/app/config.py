from functools import lru_cache

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    api_key: str = Field(..., env="OLT_API_KEY")
    vendors: list[str] = ["huawei", "zte", "fiberhome"]

    class Config:
        env_file = ".env"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
