"""Network Integration Service - FastAPI Application"""

from fastapi import FastAPI, HTTPException, Depends, Security, BackgroundTasks
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
import os
import structlog

from .config import get_settings
from .drivers import get_driver, ONUInfo, OLTInfo, ONUStatus, SpeedProfile, ONUProvisionParams

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
)
logger = structlog.get_logger()

# OLT connection pool
olt_connections: Dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Network Integration Service")
    # Initialize OLT connections on startup if configured
    yield
    # Cleanup connections on shutdown
    for olt_id, driver in olt_connections.items():
        try:
            await driver.disconnect()
        except Exception as e:
            logger.error("Error disconnecting OLT", olt_id=olt_id, error=str(e))
    logger.info("Network Integration Service stopped")


app = FastAPI(
    title="WANCOM Network Integration Service",
    description="Unified vendor-neutral OLT/ONU telemetry and actions for Huawei, ZTE, and FiberHome",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(API_KEY_HEADER)):
    settings = get_settings()
    if not api_key or api_key != settings.network_api_key:
        raise HTTPException(status_code=403, detail="Invalid or missing API key")
    return api_key


# Request/Response Models
class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class ONUStatusResponse(BaseModel):
    serial_number: str
    status: str
    rx_power: Optional[float] = None
    tx_power: Optional[float] = None
    temperature: Optional[float] = None
    voltage: Optional[float] = None
    distance: Optional[int] = None
    uptime: Optional[int] = None
    last_online: Optional[str] = None
    frame: Optional[int] = None
    slot: Optional[int] = None
    port: Optional[int] = None
    onu_id: Optional[int] = None
    description: Optional[str] = None


class OLTStatusResponse(BaseModel):
    id: str
    vendor: str
    hostname: str
    ip_address: str
    model: Optional[str] = None
    firmware_version: Optional[str] = None
    uptime: Optional[int] = None
    status: str = "online"


class RebootRequest(BaseModel):
    olt_id: str
    frame: int = 0
    slot: int
    port: int
    onu_id: int


class ProvisionRequest(BaseModel):
    olt_id: str
    serial_number: str
    frame: int = 0
    slot: int
    port: int
    onu_id: int
    description: str
    download_kbps: int
    upload_kbps: int
    vlan_id: Optional[int] = None


class SpeedProfileRequest(BaseModel):
    olt_id: str
    frame: int = 0
    slot: int
    port: int
    onu_id: int
    profile_name: str
    download_kbps: int
    upload_kbps: int


class AlarmResponse(BaseModel):
    type: str
    message: str
    severity: str
    olt_id: Optional[str] = None
    timestamp: Optional[str] = None


class ActionResponse(BaseModel):
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None


async def get_olt_driver(olt_id: str):
    """Get or create OLT driver connection"""
    settings = get_settings()
    
    if olt_id in olt_connections:
        return olt_connections[olt_id]
    
    # Look up OLT configuration
    olt_config = settings.get_olt_config(olt_id)
    if not olt_config:
        raise HTTPException(status_code=404, detail=f"OLT {olt_id} not found in configuration")
    
    driver = get_driver(
        vendor=olt_config["vendor"],
        host=olt_config["ip"],
        username=olt_config["username"],
        password=olt_config["password"],
        port=olt_config.get("port", 22),
    )
    
    if not await driver.connect():
        raise HTTPException(status_code=503, detail=f"Failed to connect to OLT {olt_id}")
    
    olt_connections[olt_id] = driver
    return driver


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        service="network-integration",
        version="0.2.0"
    )


@app.get("/api/v1/olts", response_model=List[OLTStatusResponse], dependencies=[Depends(verify_api_key)])
async def list_olts():
    """List all configured OLTs with their status"""
    settings = get_settings()
    olts = []
    
    for olt_id, config in settings.olts.items():
        status = "online" if olt_id in olt_connections else "configured"
        olts.append(OLTStatusResponse(
            id=olt_id,
            vendor=config["vendor"],
            hostname=config.get("hostname", config["ip"]),
            ip_address=config["ip"],
            model=config.get("model"),
            status=status,
        ))
    
    return olts


@app.get("/api/v1/olt/{olt_id}", response_model=OLTStatusResponse, dependencies=[Depends(verify_api_key)])
async def get_olt_status(olt_id: str):
    """Get detailed OLT status"""
    driver = await get_olt_driver(olt_id)
    info = await driver.get_olt_info()
    
    return OLTStatusResponse(
        id=info.id,
        vendor=info.vendor,
        hostname=info.hostname,
        ip_address=info.ip_address,
        model=info.model,
        firmware_version=info.firmware_version,
        uptime=info.uptime,
        status="online",
    )


@app.get("/api/v1/onu/{serial_number}", response_model=ONUStatusResponse, dependencies=[Depends(verify_api_key)])
async def get_onu_status(serial_number: str, olt_id: Optional[str] = None):
    """Get ONU status by serial number"""
    settings = get_settings()
    
    # Search across all OLTs if olt_id not specified
    olts_to_search = [olt_id] if olt_id else list(settings.olts.keys())
    
    for search_olt_id in olts_to_search:
        try:
            driver = await get_olt_driver(search_olt_id)
            onu_info = await driver.get_onu_by_serial(serial_number)
            
            if onu_info:
                return ONUStatusResponse(
                    serial_number=onu_info.serial_number,
                    status=onu_info.status.value,
                    rx_power=onu_info.rx_power,
                    tx_power=onu_info.tx_power,
                    temperature=onu_info.temperature,
                    voltage=onu_info.voltage,
                    distance=onu_info.distance,
                    uptime=onu_info.uptime,
                    last_online=onu_info.last_online,
                    frame=onu_info.frame,
                    slot=onu_info.slot,
                    port=onu_info.port,
                    onu_id=onu_info.onu_id,
                    description=onu_info.description,
                )
        except Exception as e:
            logger.warning("ONU search failed on OLT", olt_id=search_olt_id, error=str(e))
            continue
    
    raise HTTPException(status_code=404, detail=f"ONU {serial_number} not found")


@app.get("/api/v1/olt/{olt_id}/port/{slot}/{port}/onus", 
         response_model=List[ONUStatusResponse], 
         dependencies=[Depends(verify_api_key)])
async def list_onus_on_port(olt_id: str, slot: int, port: int, frame: int = 0):
    """List all ONUs on a specific PON port"""
    driver = await get_olt_driver(olt_id)
    onus = await driver.list_onus(frame, slot, port)
    
    return [
        ONUStatusResponse(
            serial_number=onu.serial_number,
            status=onu.status.value,
            rx_power=onu.rx_power,
            tx_power=onu.tx_power,
            frame=onu.frame,
            slot=onu.slot,
            port=onu.port,
            onu_id=onu.onu_id,
        )
        for onu in onus
    ]


@app.post("/api/v1/onu/reboot", response_model=ActionResponse, dependencies=[Depends(verify_api_key)])
async def reboot_onu(request: RebootRequest, background_tasks: BackgroundTasks):
    """Reboot an ONU"""
    driver = await get_olt_driver(request.olt_id)
    
    success = await driver.reboot_onu(
        request.frame, request.slot, request.port, request.onu_id
    )
    
    if success:
        logger.info("ONU reboot initiated",
                   olt_id=request.olt_id,
                   slot=request.slot,
                   port=request.port,
                   onu_id=request.onu_id)
        return ActionResponse(
            success=True,
            message=f"Reboot command sent to ONU {request.onu_id}",
            details={"olt_id": request.olt_id, "onu_id": request.onu_id}
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to reboot ONU")


@app.post("/api/v1/onu/provision", response_model=ActionResponse, dependencies=[Depends(verify_api_key)])
async def provision_onu(request: ProvisionRequest):
    """Provision a new ONU"""
    driver = await get_olt_driver(request.olt_id)
    
    params = ONUProvisionParams(
        serial_number=request.serial_number,
        frame=request.frame,
        slot=request.slot,
        port=request.port,
        onu_id=request.onu_id,
        description=request.description,
        speed_profile=SpeedProfile(
            name=f"profile_{request.download_kbps}_{request.upload_kbps}",
            download_kbps=request.download_kbps,
            upload_kbps=request.upload_kbps,
        ),
        vlan_id=request.vlan_id,
    )
    
    success = await driver.provision_onu(params)
    
    if success:
        logger.info("ONU provisioned",
                   serial=request.serial_number,
                   olt_id=request.olt_id)
        return ActionResponse(
            success=True,
            message=f"ONU {request.serial_number} provisioned successfully",
            details={"serial_number": request.serial_number}
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to provision ONU")


@app.delete("/api/v1/onu/{olt_id}/{slot}/{port}/{onu_id}", 
            response_model=ActionResponse, 
            dependencies=[Depends(verify_api_key)])
async def deprovision_onu(olt_id: str, slot: int, port: int, onu_id: int, frame: int = 0):
    """Remove ONU provisioning"""
    driver = await get_olt_driver(olt_id)
    
    success = await driver.deprovision_onu(frame, slot, port, onu_id)
    
    if success:
        logger.info("ONU deprovisioned",
                   olt_id=olt_id,
                   slot=slot,
                   port=port,
                   onu_id=onu_id)
        return ActionResponse(
            success=True,
            message=f"ONU {onu_id} deprovisioned",
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to deprovision ONU")


@app.post("/api/v1/onu/speed-profile", response_model=ActionResponse, dependencies=[Depends(verify_api_key)])
async def set_speed_profile(request: SpeedProfileRequest):
    """Set speed profile for an ONU"""
    driver = await get_olt_driver(request.olt_id)
    
    profile = SpeedProfile(
        name=request.profile_name,
        download_kbps=request.download_kbps,
        upload_kbps=request.upload_kbps,
    )
    
    success = await driver.set_speed_profile(
        request.frame, request.slot, request.port, request.onu_id, profile
    )
    
    if success:
        logger.info("Speed profile updated",
                   olt_id=request.olt_id,
                   onu_id=request.onu_id,
                   profile=request.profile_name)
        return ActionResponse(
            success=True,
            message=f"Speed profile set to {request.download_kbps}/{request.upload_kbps} kbps",
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to set speed profile")


@app.get("/api/v1/alarms", response_model=List[AlarmResponse], dependencies=[Depends(verify_api_key)])
async def get_alarms(olt_id: Optional[str] = None):
    """Get current alarms from OLTs"""
    settings = get_settings()
    all_alarms = []
    
    olts_to_query = [olt_id] if olt_id else list(settings.olts.keys())
    
    for query_olt_id in olts_to_query:
        try:
            driver = await get_olt_driver(query_olt_id)
            alarms = await driver.get_alarms()
            
            for alarm in alarms:
                all_alarms.append(AlarmResponse(
                    type=alarm.get("type", "unknown"),
                    message=alarm.get("message", ""),
                    severity=alarm.get("severity", "info"),
                    olt_id=query_olt_id,
                ))
        except Exception as e:
            logger.warning("Failed to get alarms from OLT", olt_id=query_olt_id, error=str(e))
    
    return all_alarms


@app.post("/api/v1/onu/{serial_number}/suspend", response_model=ActionResponse, dependencies=[Depends(verify_api_key)])
async def suspend_onu(serial_number: str, olt_id: Optional[str] = None):
    """Suspend an ONU (set minimum speed profile)"""
    settings = get_settings()
    
    # Find the ONU first
    olts_to_search = [olt_id] if olt_id else list(settings.olts.keys())
    
    for search_olt_id in olts_to_search:
        try:
            driver = await get_olt_driver(search_olt_id)
            onu_info = await driver.get_onu_by_serial(serial_number)
            
            if onu_info:
                # Set to minimum speed (essentially suspended)
                suspend_profile = SpeedProfile(
                    name="suspended",
                    download_kbps=64,  # Minimal speed
                    upload_kbps=64,
                )
                
                success = await driver.set_speed_profile(
                    onu_info.frame or 0,
                    onu_info.slot or 0,
                    onu_info.port or 0,
                    onu_info.onu_id or 0,
                    suspend_profile,
                )
                
                if success:
                    logger.info("ONU suspended", serial=serial_number)
                    return ActionResponse(
                        success=True,
                        message=f"ONU {serial_number} suspended",
                    )
        except Exception as e:
            logger.warning("Suspend failed", olt_id=search_olt_id, error=str(e))
            continue
    
    raise HTTPException(status_code=404, detail=f"ONU {serial_number} not found")


@app.post("/api/v1/onu/{serial_number}/resume", response_model=ActionResponse, dependencies=[Depends(verify_api_key)])
async def resume_onu(serial_number: str, download_kbps: int, upload_kbps: int, olt_id: Optional[str] = None):
    """Resume an ONU with specified speed profile"""
    settings = get_settings()
    
    olts_to_search = [olt_id] if olt_id else list(settings.olts.keys())
    
    for search_olt_id in olts_to_search:
        try:
            driver = await get_olt_driver(search_olt_id)
            onu_info = await driver.get_onu_by_serial(serial_number)
            
            if onu_info:
                resume_profile = SpeedProfile(
                    name=f"active_{download_kbps}_{upload_kbps}",
                    download_kbps=download_kbps,
                    upload_kbps=upload_kbps,
                )
                
                success = await driver.set_speed_profile(
                    onu_info.frame or 0,
                    onu_info.slot or 0,
                    onu_info.port or 0,
                    onu_info.onu_id or 0,
                    resume_profile,
                )
                
                if success:
                    logger.info("ONU resumed", serial=serial_number)
                    return ActionResponse(
                        success=True,
                        message=f"ONU {serial_number} resumed with {download_kbps}/{upload_kbps} kbps",
                    )
        except Exception as e:
            logger.warning("Resume failed", olt_id=search_olt_id, error=str(e))
            continue
    
    raise HTTPException(status_code=404, detail=f"ONU {serial_number} not found")


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
