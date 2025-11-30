"""OLT Vendor Abstraction Layer"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum
import structlog

logger = structlog.get_logger()


class ONUStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    LOS = "los"  # Loss of Signal
    DYING_GASP = "dying_gasp"
    POWER_OFF = "power_off"
    UNKNOWN = "unknown"


@dataclass
class ONUInfo:
    """ONU device information"""
    serial_number: str
    status: ONUStatus
    rx_power: Optional[float] = None  # dBm
    tx_power: Optional[float] = None  # dBm
    temperature: Optional[float] = None  # Celsius
    voltage: Optional[float] = None  # V
    distance: Optional[int] = None  # meters
    uptime: Optional[int] = None  # seconds
    last_online: Optional[str] = None
    frame: Optional[int] = None
    slot: Optional[int] = None
    port: Optional[int] = None
    onu_id: Optional[int] = None
    description: Optional[str] = None
    mac_address: Optional[str] = None
    firmware_version: Optional[str] = None


@dataclass
class OLTInfo:
    """OLT device information"""
    id: str
    vendor: str
    hostname: str
    ip_address: str
    model: Optional[str] = None
    firmware_version: Optional[str] = None
    uptime: Optional[int] = None
    total_ports: Optional[int] = None
    active_onus: Optional[int] = None


@dataclass
class SpeedProfile:
    """Speed profile for bandwidth management"""
    name: str
    download_kbps: int
    upload_kbps: int
    burst_download_kbps: Optional[int] = None
    burst_upload_kbps: Optional[int] = None


@dataclass 
class ONUProvisionParams:
    """Parameters for ONU provisioning"""
    serial_number: str
    frame: int
    slot: int
    port: int
    onu_id: int
    description: str
    speed_profile: SpeedProfile
    vlan_id: Optional[int] = None
    service_port_id: Optional[int] = None


class OLTDriver(ABC):
    """Abstract base class for OLT vendor drivers"""
    
    def __init__(self, host: str, username: str, password: str, port: int = 22):
        self.host = host
        self.username = username
        self.password = password
        self.port = port
        self.logger = logger.bind(driver=self.__class__.__name__, host=host)
    
    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection to OLT"""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Close connection to OLT"""
        pass
    
    @abstractmethod
    async def get_onu_status(self, frame: int, slot: int, port: int, onu_id: int) -> ONUInfo:
        """Get status of a specific ONU"""
        pass
    
    @abstractmethod
    async def get_onu_by_serial(self, serial_number: str) -> Optional[ONUInfo]:
        """Get ONU info by serial number"""
        pass
    
    @abstractmethod
    async def list_onus(self, frame: int, slot: int, port: int) -> List[ONUInfo]:
        """List all ONUs on a specific port"""
        pass
    
    @abstractmethod
    async def reboot_onu(self, frame: int, slot: int, port: int, onu_id: int) -> bool:
        """Reboot a specific ONU"""
        pass
    
    @abstractmethod
    async def provision_onu(self, params: ONUProvisionParams) -> bool:
        """Provision a new ONU"""
        pass
    
    @abstractmethod
    async def deprovision_onu(self, frame: int, slot: int, port: int, onu_id: int) -> bool:
        """Remove ONU provisioning"""
        pass
    
    @abstractmethod
    async def set_speed_profile(
        self, 
        frame: int, 
        slot: int, 
        port: int, 
        onu_id: int, 
        profile: SpeedProfile
    ) -> bool:
        """Set speed profile for an ONU"""
        pass
    
    @abstractmethod
    async def get_olt_info(self) -> OLTInfo:
        """Get OLT device information"""
        pass
    
    @abstractmethod
    async def get_alarms(self) -> List[Dict[str, Any]]:
        """Get current OLT alarms"""
        pass
