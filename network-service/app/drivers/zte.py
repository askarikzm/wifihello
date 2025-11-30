"""ZTE OLT Driver (C300/C320/C600 Series)"""
import asyncio
import asyncssh
import re
from typing import Optional, List, Dict, Any
import structlog

from .base import OLTDriver, ONUInfo, OLTInfo, ONUStatus, SpeedProfile, ONUProvisionParams

logger = structlog.get_logger()


class ZTEDriver(OLTDriver):
    """Driver for ZTE C300/C320/C600 series OLTs"""
    
    VENDOR = "zte"
    SUPPORTED_MODELS = ["C300", "C320", "C600", "C650"]
    
    def __init__(self, host: str, username: str, password: str, port: int = 22):
        super().__init__(host, username, password, port)
        self.conn: Optional[asyncssh.SSHClientConnection] = None
        self.command_timeout = 30
    
    async def connect(self) -> bool:
        """Establish SSH connection to ZTE OLT"""
        try:
            self.conn = await asyncssh.connect(
                self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                known_hosts=None,
                connect_timeout=10,
            )
            self.logger.info("Connected to ZTE OLT")
            
            # Enter enable mode
            await self._send_command("enable")
            await self._send_command("configure terminal")
            
            return True
        except Exception as e:
            self.logger.error("Failed to connect to ZTE OLT", error=str(e))
            return False
    
    async def disconnect(self) -> None:
        """Close SSH connection"""
        if self.conn:
            self.conn.close()
            await self.conn.wait_closed()
            self.conn = None
            self.logger.info("Disconnected from ZTE OLT")
    
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
        """Get ONU status using ZTE CLI commands"""
        try:
            # Get ONU running config
            state_cmd = f"show gpon onu state gpon-olt_{frame}/{slot}/{port}:{onu_id}"
            state_output = await self._send_command(state_cmd)
            
            # Get optical info
            optical_cmd = f"show gpon onu detail-info gpon-onu_{frame}/{slot}/{port}:{onu_id}"
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
        """Parse ZTE ONU information from command outputs"""
        info = ONUInfo(
            serial_number="",
            status=ONUStatus.UNKNOWN,
            frame=frame,
            slot=slot,
            port=port,
            onu_id=onu_id,
        )
        
        # Parse state - ZTE format: "Admin State: enable, Phase State: working"
        phase_match = re.search(r"Phase State\s*:\s*(\w+)", state_output, re.IGNORECASE)
        if phase_match:
            state = phase_match.group(1).lower()
            if state == "working":
                info.status = ONUStatus.ONLINE
            elif state == "los":
                info.status = ONUStatus.LOS
            elif state == "dyinggasp" or state == "dying-gasp":
                info.status = ONUStatus.DYING_GASP
            elif state == "offline":
                info.status = ONUStatus.OFFLINE
        
        # Parse serial number
        sn_match = re.search(r"Serial Number\s*:\s*([A-Za-z0-9]+)", optical_output)
        if sn_match:
            info.serial_number = sn_match.group(1)
        
        # Parse RX power - ZTE format: "Rx optical power: -18.50dBm"
        rx_match = re.search(r"Rx optical power\s*:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if rx_match:
            try:
                info.rx_power = float(rx_match.group(1))
            except ValueError:
                pass
        
        # Parse TX power
        tx_match = re.search(r"Tx optical power\s*:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if tx_match:
            try:
                info.tx_power = float(tx_match.group(1))
            except ValueError:
                pass
        
        # Parse temperature
        temp_match = re.search(r"Temperature\s*:\s*([-\d.]+)", optical_output, re.IGNORECASE)
        if temp_match:
            try:
                info.temperature = float(temp_match.group(1))
            except ValueError:
                pass
        
        # Parse distance
        distance_match = re.search(r"Distance\s*:\s*(\d+)", optical_output, re.IGNORECASE)
        if distance_match:
            try:
                info.distance = int(distance_match.group(1))
            except ValueError:
                pass
        
        return info
    
    async def get_onu_by_serial(self, serial_number: str) -> Optional[ONUInfo]:
        """Find ONU by serial number"""
        try:
            cmd = f"show gpon onu by sn {serial_number}"
            output = await self._send_command(cmd)
            
            # Parse location from output - format: gpon-onu_0/1/1:1
            location_match = re.search(
                r"gpon-onu_(\d+)/(\d+)/(\d+):(\d+)",
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
            cmd = f"show gpon onu state gpon-olt_{frame}/{slot}/{port}"
            output = await self._send_command(cmd)
            
            onus = []
            # Parse ZTE format - each line has ONU info
            for match in re.finditer(
                r"gpon-onu_\d+/\d+/\d+:(\d+)\s+(\w+)\s+(\w+)",
                output
            ):
                onu_id = int(match.group(1))
                admin_state = match.group(2).lower()
                phase_state = match.group(3).lower()
                
                status = ONUStatus.UNKNOWN
                if phase_state == "working":
                    status = ONUStatus.ONLINE
                elif phase_state == "los":
                    status = ONUStatus.LOS
                elif phase_state == "offline" or admin_state == "disable":
                    status = ONUStatus.OFFLINE
                
                onus.append(ONUInfo(
                    serial_number="",  # Would need separate query
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
        """Reboot ONU using ZTE command"""
        try:
            cmd = f"gpon-onu-reset gpon-onu_{frame}/{slot}/{port}:{onu_id}"
            await self._send_command(cmd)
            self.logger.info("ONU reboot command sent",
                           frame=frame, slot=slot, port=port, onu_id=onu_id)
            return True
        except Exception as e:
            self.logger.error("Failed to reboot ONU", error=str(e))
            return False
    
    async def provision_onu(self, params: ONUProvisionParams) -> bool:
        """Provision new ONU on ZTE OLT"""
        try:
            commands = [
                f"interface gpon-olt_{params.frame}/{params.slot}/{params.port}",
                f"onu {params.onu_id} type auto sn {params.serial_number}",
                "exit",
                f"interface gpon-onu_{params.frame}/{params.slot}/{params.port}:{params.onu_id}",
                f"description {params.description}",
            ]
            
            # Add VLAN configuration if specified
            if params.vlan_id:
                commands.extend([
                    f"switchport mode trunk vport 1",
                    f"service-port 1 vport 1 user-vlan {params.vlan_id} vlan {params.vlan_id}",
                ])
            
            commands.append("exit")
            
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
        """Remove ONU from ZTE OLT"""
        try:
            commands = [
                f"interface gpon-olt_{frame}/{slot}/{port}",
                f"no onu {onu_id}",
                "exit",
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
        """Set bandwidth profile for ONU on ZTE"""
        try:
            commands = [
                f"interface gpon-onu_{frame}/{slot}/{port}:{onu_id}",
                f"tcont 1 profile {profile.name}",
                f"gemport 1 tcont 1",
                f"rate-limit downstream {profile.download_kbps}",
                f"rate-limit upstream {profile.upload_kbps}",
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
        """Get ZTE OLT system information"""
        try:
            version_output = await self._send_command("show version")
            
            model_match = re.search(r"(C\d+)", version_output)
            model = model_match.group(1) if model_match else "Unknown"
            
            version_match = re.search(r"Software Version\s*:\s*([\w.]+)", version_output)
            version = version_match.group(1) if version_match else "Unknown"
            
            uptime_match = re.search(r"System uptime\s*:\s*(\d+)\s*days?", version_output)
            uptime = int(uptime_match.group(1)) * 86400 if uptime_match else None
            
            return OLTInfo(
                id=self.host,
                vendor="zte",
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
                vendor="zte",
                hostname=self.host,
                ip_address=self.host,
            )
    
    async def get_alarms(self) -> List[Dict[str, Any]]:
        """Get current alarms from ZTE OLT"""
        try:
            output = await self._send_command("show alarm current")
            alarms = []
            
            # Parse alarm entries
            for line in output.split("\n"):
                if any(alarm_type in line for alarm_type in ["LOS", "Dying", "Power"]):
                    severity = "critical" if "LOS" in line else "warning"
                    alarms.append({
                        "type": "onu_alarm",
                        "message": line.strip(),
                        "severity": severity,
                    })
            
            return alarms
        except Exception as e:
            self.logger.error("Failed to get alarms", error=str(e))
            return []
