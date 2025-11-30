"""OLT Driver Package"""
from .base import OLTDriver, ONUInfo, OLTInfo, ONUStatus, SpeedProfile, ONUProvisionParams
from .huawei import HuaweiDriver
from .zte import ZTEDriver
from .fiberhome import FiberHomeDriver

__all__ = [
    "OLTDriver",
    "ONUInfo",
    "OLTInfo",
    "ONUStatus",
    "SpeedProfile",
    "ONUProvisionParams",
    "HuaweiDriver",
    "ZTEDriver",
    "FiberHomeDriver",
]


def get_driver(vendor: str, host: str, username: str, password: str, port: int = 22) -> OLTDriver:
    """Factory function to get the appropriate OLT driver"""
    vendor = vendor.lower()
    
    if vendor == "huawei":
        return HuaweiDriver(host, username, password, port)
    elif vendor == "zte":
        return ZTEDriver(host, username, password, port)
    elif vendor == "fiberhome":
        return FiberHomeDriver(host, username, password, port)
    else:
        raise ValueError(f"Unsupported OLT vendor: {vendor}")
