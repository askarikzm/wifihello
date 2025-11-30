"""FiberHome OLT Driver (AN5516 Series)"""
import asyncio
import asyncssh
import re
from typing import Optional, List, Dict, Any
import structlog

from .base import OLTDriver, ONUInfo, OLTInfo, ONUStatus, SpeedProfile, ONUProvisionParams

logger = structlog.get_logger()


class FiberHomeDriver(OLTDriver):
    """Driver for FiberHome AN5516 series OLTs"""
    
    VENDOR = "fiberhome"
    SUPPORTED_MODELS = ["AN5516-01", "AN5516-04", "AN5516-06"]
    
    def __init__(self, host: str, username: str, password: str, port: int = 22):
        super().__init__(host, username, password, port)
        self.conn: Optional[asyncssh.SSHClientConnection] = None
        self.command_timeout = 30
    
    async def connect(self) -> bool:
        """Establish SSH connection to FiberHome OLT"""
        try:
            self.conn = await asyncssh.connect(
                self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                known_hosts=None,
                connect_timeout=10,
            )
            self.logger.info("Connected to FiberHome OLT")
            
            # Enter config mode
            await self._send_command("enable")
            await self._send_command("config")
            
            return True
        except Exception as e:
            self.logger.error("Failed to connect to FiberHome OLT", error=str(e))
            return False
    
    async def disconnect(self) -> None:
        """Close SSH connection"""
        if self.conn:
            self.conn.close()
            await self.conn.wait_closed()
            self.conn = None
            self.logger.info("Disconnected from FiberHome OLT")
    
    async def _send_command(self, command: str, timeout: int = None) -> str:
        """Send command and return output"""
        if not self.conn:
            raise ConnectionError("Not connected to OLT")
        
        timeout = timeout or self.command_timeout
        
        try:
            result = await asyncio.wait_for(
                self.conn.run(command, check=False),
                timeout=timeout
            )
            return result.stdout
        except asyncio.TimeoutError:
            self.logger.error("Command timeout", command=command)
            raise
    
    async def get_onu_status(self, frame: int, slot: int, port: int, onu_id: int) -> ONUInfo:
        """Get ONU status using FiberHome CLI commands"""
        try:
            # Get ONU info
            state_cmd = f"show onu running config slot {slot} pon {port} onu {onu_id}"
            state_output = await self._send_command(state_cmd)
            
            # Get optical info
            optical_cmd = f"show onu optical-transceiver-diagnosis slot {slot} pon {port} onu {onu_id}"
            optical_output = await self._send_command(optical_cmd)
            
            return self._parse_onu_info(state_output, optical_output, frame, slot, port, onu_id)
            
        except Exception as e:
            self.logger.error("Failed to get ONU status", error=str(e))
            return ONUInfo(
                serial_number="unknown",
                status=ONUStatus.UNKNOWN,
                frame=frame,
                slot=slot,
                port=port,
                onu_id=onu_id,
            )
    
    def _parse_onu_info(
        self,
        state_output: str,
        optical_output: str,
        frame: int,
        slot: int,
        port: int,
        onu_id: int,
    ) -> ONUInfo:
        """Parse FiberHome ONU information"""
        info = ONUInfo(
            serial_number="",
            status=ONUStatus.UNKNOWN,
            frame=frame,
            slot=slot,
            port=port,
            onu_id=onu_id,
        )
        
        # Parse state
        state_match = re.search(r"state\s*:\s*(\w+)", state_output, re.IGNORECASE)
        if state_match:
            state = state_match.group(1).lower()
            if state in ["online", "active", "up"]:
                info.status = ONUStatus.ONLINE
            elif state in ["offline", "down"]:
                info.status = ONUStatus.OFFLINE
            elif "los" in state:
                info.status = ONUStatus.LOS
        
        # Parse serial number
        sn_match = re.search(r"sn\s*:\s*([A-Za-z0-9]+)", state_output, re.IGNORECASE)
        if sn_match:
            info.serial_number = sn_match.group(1)
        
        # Parse optical parameters
        rx_match = re.search(r"rx[_-]?power\s*:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if rx_match:
            try:
                info.rx_power = float(rx_match.group(1))
            except ValueError:
                pass
        
        tx_match = re.search(r"tx[_-]?power\s*:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if tx_match:
            try:
                info.tx_power = float(tx_match.group(1))
            except ValueError:
                pass
        
        temp_match = re.search(r"temperature\s*:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if temp_match:
            try:
                info.temperature = float(temp_match.group(1))
            except ValueError:
                pass
        
        return info
    
    async def get_onu_by_serial(self, serial_number: str) -> Optional[ONUInfo]:
        """Find ONU by serial number"""
        try:
            cmd = f"show onu by-sn {serial_number}"
            output = await self._send_command(cmd)
            
            # Parse location
            location_match = re.search(
                r"slot\s*(\d+)\s+pon\s*(\d+)\s+onu\s*(\d+)",
                output,
                re.IGNORECASE
            )
            
            if location_match:
                slot = int(location_match.group(1))
                port = int(location_match.group(2))
                onu_id = int(location_match.group(3))
                return await self.get_onu_status(0, slot, port, onu_id)
            
            return None
        except Exception as e:
            self.logger.error("Failed to find ONU by serial", serial=serial_number, error=str(e))
            return None
    
    async def list_onus(self, frame: int, slot: int, port: int) -> List[ONUInfo]:
        """List all ONUs on a PON port"""
        try:
            cmd = f"show onu-register slot {slot} pon {port}"
            output = await self._send_command(cmd)
            
            onus = []
            for match in re.finditer(
                r"(\d+)\s+([A-Za-z0-9]+)\s+(\w+)",
                output
            ):
                onu_id = int(match.group(1))
                serial = match.group(2)
                state = match.group(3).lower()
                
                status = ONUStatus.ONLINE if "online" in state else ONUStatus.OFFLINE
                
                onus.append(ONUInfo(
                    serial_number=serial,
                    status=status,
                    frame=frame,
                    slot=slot,
                    port=port,
                    onu_id=onu_id,
                ))
            
            return onus
        except Exception as e:
            self.logger.error("Failed to list ONUs", error=str(e))
            return []
    
    async def reboot_onu(self, frame: int, slot: int, port: int, onu_id: int) -> bool:
        """Reboot ONU"""
        try:
            cmd = f"onu reset slot {slot} pon {port} onu {onu_id}"
            await self._send_command(cmd)
            self.logger.info("ONU reboot command sent",
                           slot=slot, port=port, onu_id=onu_id)
            return True
        except Exception as e:
            self.logger.error("Failed to reboot ONU", error=str(e))
            return False
    
    async def provision_onu(self, params: ONUProvisionParams) -> bool:
        """Provision new ONU on FiberHome OLT"""
        try:
            commands = [
                f"pon-onu-mng slot {params.slot} pon {params.port} onu {params.onu_id}",
                f"sn {params.serial_number}",
                f"name {params.description}",
                "commit",
                "exit",
            ]
            
            for cmd in commands:
                await self._send_command(cmd)
            
            await self.set_speed_profile(
                params.frame, params.slot, params.port, params.onu_id,
                params.speed_profile
            )
            
            self.logger.info("ONU provisioned", serial=params.serial_number)
            return True
            
        except Exception as e:
            self.logger.error("Failed to provision ONU", error=str(e))
            return False
    
    async def deprovision_onu(self, frame: int, slot: int, port: int, onu_id: int) -> bool:
        """Remove ONU from FiberHome OLT"""
        try:
            cmd = f"no onu slot {slot} pon {port} onu {onu_id}"
            await self._send_command(cmd)
            
            self.logger.info("ONU deprovisioned", slot=slot, port=port, onu_id=onu_id)
            return True
        except Exception as e:
            self.logger.error("Failed to deprovision ONU", error=str(e))
            return False
    
    async def set_speed_profile(
        self,
        frame: int,
        slot: int,
        port: int,
        onu_id: int,
        profile: SpeedProfile,
    ) -> bool:
        """Set bandwidth profile for ONU"""
        try:
            commands = [
                f"pon-onu-mng slot {slot} pon {port} onu {onu_id}",
                f"flow-profile down-cir {profile.download_kbps} up-cir {profile.upload_kbps}",
                "commit",
                "exit",
            ]
            
            for cmd in commands:
                await self._send_command(cmd)
            
            self.logger.info("Speed profile set",
                           profile=profile.name,
                           download=profile.download_kbps,
                           upload=profile.upload_kbps)
            return True
        except Exception as e:
            self.logger.error("Failed to set speed profile", error=str(e))
            return False
    
    async def get_olt_info(self) -> OLTInfo:
        """Get FiberHome OLT system information"""
        try:
            version_output = await self._send_command("show version")
            
            model_match = re.search(r"(AN\d+[-\w]*)", version_output)
            model = model_match.group(1) if model_match else "Unknown"
            
            version_match = re.search(r"software version\s*:\s*([\w.]+)", version_output, re.IGNORECASE)
            version = version_match.group(1) if version_match else "Unknown"
            
            return OLTInfo(
                id=self.host,
                vendor="fiberhome",
                hostname=self.host,
                ip_address=self.host,
                model=model,
                firmware_version=version,
            )
        except Exception as e:
            self.logger.error("Failed to get OLT info", error=str(e))
            return OLTInfo(
                id=self.host,
                vendor="fiberhome",
                hostname=self.host,
                ip_address=self.host,
            )
    
    async def get_alarms(self) -> List[Dict[str, Any]]:
        """Get current alarms from FiberHome OLT"""
        try:
            output = await self._send_command("show alarm")
            alarms = []
            
            for line in output.split("\n"):
                if any(t in line for t in ["LOS", "Dying", "Power", "Critical"]):
                    alarms.append({
                        "type": "onu_alarm",
                        "message": line.strip(),
                        "severity": "critical" if "LOS" in line or "Critical" in line else "warning",
                    })
            
            return alarms
        except Exception as e:
            self.logger.error("Failed to get alarms", error=str(e))
            return []
