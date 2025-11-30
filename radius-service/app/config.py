"""RADIUS Service Configuration"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # RADIUS Configuration
    radius_secret: str = "testing123"
    radius_auth_port: int = 1812
    radius_acct_port: int = 1813
    radius_bind_address: str = "0.0.0.0"
    
    # Supabase Configuration
    supabase_url: str = ""
    supabase_service_key: str = ""
    
    # Network Configuration
    default_dns_primary: str = "8.8.8.8"
    default_dns_secondary: str = "8.8.4.4"
    default_session_timeout: int = 86400  # 24 hours
    default_interim_interval: int = 300   # 5 minutes
    
    # Rate Limiting
    max_auth_attempts: int = 5
    lockout_duration: int = 300  # 5 minutes
    
    # Health Check
    health_port: int = 8080
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
