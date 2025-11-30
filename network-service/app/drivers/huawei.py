"""Huawei OLT Driver (MA5800 Series)"""
import asyncio
import asyncssh
import re
from typing import Optional, List, Dict, Any
import structlog

from .base import OLTDriver, ONUInfo, OLTInfo, ONUStatus, SpeedProfile, ONUProvisionParams

logger = structlog.get_logger()


class HuaweiDriver(OLTDriver):
    """Driver for Huawei MA5800 series OLTs"""
    
    VENDOR = "huawei"
    SUPPORTED_MODELS = ["MA5800-X2", "MA5800-X7", "MA5800-X15", "MA5800-X17"]
    
    def __init__(self, host: str, username: str, password: str, port: int = 22):
        super().__init__(host, username, password, port)
        self.conn: Optional[asyncssh.SSHClientConnection] = None
        self.enable_password: Optional[str] = None
        self.command_timeout = 30
    
    async def connect(self) -> bool:
        """Establish SSH connection to Huawei OLT"""
        try:
            self.conn = await asyncssh.connect(
                self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                known_hosts=None,
                connect_timeout=10,
            )
            self.logger.info("Connected to Huawei OLT")
            
            # Enter enable mode
            await self._send_command("enable")
            await self._send_command("config")
            
            return True
        except Exception as e:
            self.logger.error("Failed to connect to Huawei OLT", error=str(e))
            return False
    
    async def disconnect(self) -> None:
        """Close SSH connection"""
        if self.conn:
            self.conn.close()
            await self.conn.wait_closed()
            self.conn = None
            self.logger.info("Disconnected from Huawei OLT")
    
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
        """Get ONU status using Huawei CLI commands"""
        try:
            # Get ONU state
            state_cmd = f"display ont info {frame} {slot} {port} {onu_id}"
            state_output = await self._send_command(state_cmd)
            
            # Get optical info
            optical_cmd = f"display ont optical-info {frame} {slot} {port} {onu_id}"
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
        """Parse Huawei ONU information from command outputs"""
        info = ONUInfo(
            serial_number="",
            status=ONUStatus.UNKNOWN,
            frame=frame,
            slot=slot,
            port=port,
            onu_id=onu_id,
        )
        
        # Parse state output
        # Example: "Run state : online"
        run_state_match = re.search(r"Run state\s*:\s*(\w+)", state_output, re.IGNORECASE)
        if run_state_match:
            state = run_state_match.group(1).lower()
            if state == "online":
                info.status = ONUStatus.ONLINE
            elif state == "offline":
                info.status = ONUStatus.OFFLINE
            elif "los" in state:
                info.status = ONUStatus.LOS
            elif "dying" in state:
                info.status = ONUStatus.DYING_GASP
        
        # Parse serial number
        # Example: "SN : 48575443xxxxxxxx"
        sn_match = re.search(r"SN\s*:\s*([A-Fa-f0-9]+)", state_output)
        if sn_match:
            info.serial_number = sn_match.group(1)
        
        # Parse description
        desc_match = re.search(r"Description\s*:\s*(.+)", state_output)
        if desc_match:
            info.description = desc_match.group(1).strip()
        
        # Parse optical info
        # RX optical power(dBm) : -18.50
        rx_match = re.search(r"RX optical power.*?:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if rx_match:
            try:
                info.rx_power = float(rx_match.group(1))
            except ValueError:
                pass
        
        # TX optical power(dBm) : 2.30
        tx_match = re.search(r"TX optical power.*?:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if tx_match:
            try:
                info.tx_power = float(tx_match.group(1))
            except ValueError:
                pass
        
        # OLT RX ONT optical power(dBm) : -19.20
        distance_match = re.search(r"ONU Distance.*?:\s*(\d+)", optical_output, re.IGNORECASE)
        if distance_match:
            try:
                info.distance = int(distance_match.group(1))
            except ValueError:
                pass
        
        # Temperature
        temp_match = re.search(r"Temperature.*?:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if temp_match:
            try:
                info.temperature = float(temp_match.group(1))
            except ValueError:
                pass
        
        return info
    
    async def get_onu_by_serial(self, serial_number: str) -> Optional[ONUInfo]:
        """Find ONU by serial number"""
        try:
            cmd = f"display ont info by-sn {serial_number}"
            output = await self._send_command(cmd)
            
            # Parse frame/slot/port/onu from output
            location_match = re.search(
                r"(\d+)\s+(\d+)\s+(\d+)\s+(\d+)", 
                output
            )
            
            if location_match:
                frame = int(location_match.group(1))
                slot = int(location_match.group(2))
                port = int(location_match.group(3))
                onu_id = int(location_match.group(4))
                return await self.get_onu_status(frame, slot, port, onu_id)
            
            return None
        except Exception as e:
            self.logger.error("Failed to find ONU by serial", serial=serial_number, error=str(e))
            return None
    
    async def list_onus(self, frame: int, slot: int, port: int) -> List[ONUInfo]:
        """List all ONUs on a PON port"""
        try:
            cmd = f"display ont info {frame} {slot} {port} all"
            output = await self._send_command(cmd)
            
            onus = []
            # Parse each ONU line
            for match in re.finditer(
                r"(\d+)\s+([A-Fa-f0-9]+)\s+(\w+)",
                output
            ):
                onu_id = int(match.group(1))
                serial = match.group(2)
                state = match.group(3).lower()
                
                status = ONUStatus.UNKNOWN
                if state == "online":
                    status = ONUStatus.ONLINE
                elif state == "offline":
                    status = ONUStatus.OFFLINE
                
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
        """Reboot ONU using Huawei command"""
        try:
            cmd = f"ont reset {frame} {slot} {port} {onu_id}"
            await self._send_command(cmd)
            self.logger.info("ONU reboot command sent", 
                           frame=frame, slot=slot, port=port, onu_id=onu_id)
            return True
        except Exception as e:
            self.logger.error("Failed to reboot ONU", error=str(e))
            return False
    
    async def provision_onu(self, params: ONUProvisionParams) -> bool:
        """Provision new ONU on Huawei OLT"""
        try:
            commands = [
                f"interface gpon {params.frame}/{params.slot}",
                f"ont add {params.port} {params.onu_id} sn-auth {params.serial_number} "
                f"omci ont-lineprofile-id 1 ont-srvprofile-id 1 desc {params.description}",
                "quit",
            ]
            
            # Add service port if VLAN specified
            if params.vlan_id:
                service_port_id = params.service_port_id or (params.port * 1000 + params.onu_id)
                commands.extend([
                    f"service-port {service_port_id} vlan {params.vlan_id} gpon {params.frame}/{params.slot}/{params.port} "
                    f"ont {params.onu_id} gemport 1 multi-service user-vlan {params.vlan_id}",
                ])
            
            for cmd in commands:
                await self._send_command(cmd)
            
            # Set speed profile
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
        """Remove ONU from Huawei OLT"""
        try:
            commands = [
                f"interface gpon {frame}/{slot}",
                f"ont delete {port} {onu_id}",
                "quit",
            ]
            
            for cmd in commands:
                await self._send_command(cmd)
            
            self.logger.info("ONU deprovisioned", frame=frame, slot=slot, port=port, onu_id=onu_id)
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
            # Create or use existing traffic table
            commands = [
                f"traffic table ip index {profile.download_kbps} cir {profile.download_kbps} pir {profile.download_kbps}",
                f"interface gpon {frame}/{slot}",
                f"ont port native-vlan {port} {onu_id} eth 1 vlan 1 priority 0",
                "quit",
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
        """Get Huawei OLT system information"""
        try:
            version_output = await self._send_command("display version")
            
            model_match = re.search(r"(MA\d+[-\w]+)", version_output)
            model = model_match.group(1) if model_match else "Unknown"
            
            version_match = re.search(r"Version\s*:\s*([\d.]+)", version_output)
            version = version_match.group(1) if version_match else "Unknown"
            
            uptime_match = re.search(r"Uptime.*?(\d+)\s*days?", version_output)
            uptime = int(uptime_match.group(1)) * 86400 if uptime_match else None
            
            return OLTInfo(
                id=self.host,
                vendor="huawei",
                hostname=self.host,
                ip_address=self.host,
                model=model,
                firmware_version=version,
                uptime=uptime,
            )
        except Exception as e:
            self.logger.error("Failed to get OLT info", error=str(e))
            return OLTInfo(
                id=self.host,
                vendor="huawei",
                hostname=self.host,
                ip_address=self.host,
            )
    
    async def get_alarms(self) -> List[Dict[str, Any]]:
        """Get current alarms from Huawei OLT"""
        try:
            output = await self._send_command("display alarm active")
            alarms = []
            
            # Parse alarm entries
            for line in output.split("\n"):
                if "LOS" in line or "Dying-Gasp" in line or "Power-fail" in line:
                    alarms.append({
                        "type": "onu_alarm",
                        "message": line.strip(),
                        "severity": "critical" if "LOS" in line else "warning",
                    })
            
            return alarms
        except Exception as e:
            self.logger.error("Failed to get alarms", error=str(e))
            return []
