"""Network Integration Service Configuration"""
import os
import json
from typing import Dict, Any, Optional
from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Configuration settings for Network Integration Service"""
    
    port: int = Field(default=9100, alias="NETWORK_SERVICE_PORT")
    network_api_key: str = Field(default="replace_with_generated_key", alias="NETWORK_SERVICE_API_KEY")
    
    # Supabase for OLT inventory (optional)
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    
    # Connection timeouts
    ssh_timeout: int = Field(default=30, alias="SSH_TIMEOUT")
    command_timeout: int = Field(default=60, alias="COMMAND_TIMEOUT")
    
    # SNMP settings
    snmp_community: str = Field(default="public", alias="SNMP_COMMUNITY")
    snmp_version: str = Field(default="2c", alias="SNMP_VERSION")
    
    # Supported vendors
    vendors: list[str] = ["huawei", "zte", "fiberhome"]
    
    # OLT configurations - loaded separately
    olts: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    
    class Config:
        env_file = ".env"
        populate_by_name = True
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.olts:
            self.olts = self._load_olt_config()
    
    def _load_olt_config(self) -> Dict[str, Dict[str, Any]]:
        """Load OLT configurations from environment or file"""
        config_file = os.getenv("OLT_CONFIG_FILE", "/app/config/olts.json")
        
        if os.path.exists(config_file):
            try:
                with open(config_file) as f:
                    return json.load(f)
            except Exception:
                pass
        
        olt_config_json = os.getenv("OLT_CONFIG", "")
        if olt_config_json:
            try:
                return json.loads(olt_config_json)
            except Exception:
                pass
        
        # Default configuration for development
        return {
            "olt-001": {
                "vendor": "huawei",
                "ip": os.getenv("OLT_001_IP", "10.0.1.1"),
                "username": os.getenv("OLT_001_USER", "admin"),
                "password": os.getenv("OLT_001_PASS", "admin"),
                "port": 22,
                "model": "MA5800-X7",
            },
            "olt-002": {
                "vendor": "zte",
                "ip": os.getenv("OLT_002_IP", "10.0.1.2"),
                "username": os.getenv("OLT_002_USER", "admin"),
                "password": os.getenv("OLT_002_PASS", "admin"),
                "port": 22,
                "model": "C320",
            },
            "olt-003": {
                "vendor": "fiberhome",
                "ip": os.getenv("OLT_003_IP", "10.0.1.3"),
                "username": os.getenv("OLT_003_USER", "admin"),
                "password": os.getenv("OLT_003_PASS", "admin"),
                "port": 22,
                "model": "AN5516-04",
            },
        }
    
    def get_olt_config(self, olt_id: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific OLT"""
        return self.olts.get(olt_id)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
