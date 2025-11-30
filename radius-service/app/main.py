"""WANCOM RADIUS AAA Service - Main Entry Point"""
import asyncio
import signal
import sys
from typing import Optional
import structlog
from pyrad import dictionary, packet, server
from aiohttp import web

from .config import get_settings
from .handlers import handle_authentication, handle_accounting

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


class WancomRadiusServer(server.Server):
    """Custom RADIUS server for WANCOM ISP"""
    
    def __init__(self, dictionary_path: str = "/usr/share/freeradius/dictionary"):
        # Load RADIUS dictionary
        try:
            rad_dict = dictionary.Dictionary(dictionary_path)
        except Exception:
            # Use minimal built-in dictionary if file not found
            rad_dict = dictionary.Dictionary()
            self._add_basic_attributes(rad_dict)
        
        settings = get_settings()
        
        # Initialize server
        super().__init__(
            dict=rad_dict,
            addresses=[settings.radius_bind_address],
            authport=settings.radius_auth_port,
            acctport=settings.radius_acct_port,
        )
        
        # Add NAS clients (in production, load from database)
        self.hosts["0.0.0.0"] = server.RemoteHost(
            settings.radius_bind_address,
            settings.radius_secret.encode(),
            "default"
        )
        
        self.dictionary = rad_dict
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        
        logger.info("RADIUS server initialized",
                   auth_port=settings.radius_auth_port,
                   acct_port=settings.radius_acct_port)
    
    def _add_basic_attributes(self, rad_dict: dictionary.Dictionary):
        """Add basic RADIUS attributes if dictionary file not available"""
        # This is a fallback for containerized environments
        basic_attrs = [
            (1, "User-Name", "string"),
            (2, "User-Password", "string"),
            (3, "CHAP-Password", "octets"),
            (4, "NAS-IP-Address", "ipaddr"),
            (5, "NAS-Port", "integer"),
            (6, "Service-Type", "integer"),
            (7, "Framed-Protocol", "integer"),
            (8, "Framed-IP-Address", "ipaddr"),
            (9, "Framed-IP-Netmask", "ipaddr"),
            (27, "Session-Timeout", "integer"),
            (28, "Idle-Timeout", "integer"),
            (40, "Acct-Status-Type", "integer"),
            (44, "Acct-Session-Id", "string"),
            (42, "Acct-Input-Octets", "integer"),
            (43, "Acct-Output-Octets", "integer"),
            (46, "Acct-Session-Time", "integer"),
            (49, "Acct-Terminate-Cause", "integer"),
            (85, "Acct-Interim-Interval", "integer"),
        ]
        
        for attr_id, attr_name, attr_type in basic_attrs:
            rad_dict.attributes[attr_name] = (attr_id, attr_type)
    
    def HandleAuthPacket(self, pkt: packet.AuthPacket):
        """Handle incoming authentication request"""
        if self.loop:
            asyncio.run_coroutine_threadsafe(
                self._async_handle_auth(pkt),
                self.loop
            )
        else:
            asyncio.run(self._async_handle_auth(pkt))
    
    async def _async_handle_auth(self, pkt: packet.AuthPacket):
        """Async authentication handler"""
        try:
            success, attrs, reject_reason = await handle_authentication(
                pkt, self.dictionary
            )
            
            if success:
                reply = pkt.CreateReply(packet.AccessAccept)
                for attr_name, attr_value in attrs.items():
                    try:
                        reply[attr_name] = attr_value
                    except Exception:
                        pass  # Skip unsupported attributes
            else:
                reply = pkt.CreateReply(packet.AccessReject)
                if reject_reason:
                    reply["Reply-Message"] = reject_reason
            
            self.SendReplyPacket(pkt.fd, reply)
            
        except Exception as e:
            logger.error("Authentication handler error", error=str(e))
            reply = pkt.CreateReply(packet.AccessReject)
            reply["Reply-Message"] = "Internal server error"
            self.SendReplyPacket(pkt.fd, reply)
    
    def HandleAcctPacket(self, pkt: packet.AcctPacket):
        """Handle incoming accounting request"""
        if self.loop:
            asyncio.run_coroutine_threadsafe(
                self._async_handle_acct(pkt),
                self.loop
            )
        else:
            asyncio.run(self._async_handle_acct(pkt))
    
    async def _async_handle_acct(self, pkt: packet.AcctPacket):
        """Async accounting handler"""
        try:
            success = await handle_accounting(pkt, self.dictionary)
            
            if success:
                reply = pkt.CreateReply()
                self.SendReplyPacket(pkt.fd, reply)
            
        except Exception as e:
            logger.error("Accounting handler error", error=str(e))
            # Still send response to avoid NAS retries
            reply = pkt.CreateReply()
            self.SendReplyPacket(pkt.fd, reply)


async def health_check_handler(request: web.Request) -> web.Response:
    """Health check endpoint for container orchestration"""
    return web.json_response({
        "status": "healthy",
        "service": "radius-aaa",
        "version": "0.1.0"
    })


async def start_health_server():
    """Start HTTP health check server"""
    settings = get_settings()
    app = web.Application()
    app.router.add_get("/health", health_check_handler)
    
    runner = web.AppRunner(app)
    await runner.setup()
    
    site = web.TCPSite(runner, "0.0.0.0", settings.health_port)
    await site.start()
    
    logger.info("Health check server started", port=settings.health_port)
    return runner


def main():
    """Main entry point"""
    logger.info("Starting WANCOM RADIUS AAA Service")
    
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Start health check server
    health_runner = loop.run_until_complete(start_health_server())
    
    # Create and start RADIUS server
    radius_server = WancomRadiusServer()
    radius_server.loop = loop
    
    # Handle shutdown signals
    def shutdown_handler(signum, frame):
        logger.info("Shutdown signal received")
        loop.run_until_complete(health_runner.cleanup())
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)
    
    logger.info("RADIUS server running")
    
    try:
        # Run RADIUS server in a thread
        import threading
        radius_thread = threading.Thread(target=radius_server.Run, daemon=True)
        radius_thread.start()
        
        # Keep main loop running
        loop.run_forever()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        loop.run_until_complete(health_runner.cleanup())


if __name__ == "__main__":
    main()
