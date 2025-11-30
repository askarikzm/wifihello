"""RADIUS packet handlers for Authentication, Authorization, and Accounting"""
import hashlib
from typing import Optional, Tuple, Dict, Any
import structlog
from pyrad import packet
from pyrad.dictionary import Dictionary

from .config import get_settings
from .supabase_client import get_supabase_client

logger = structlog.get_logger()


# RADIUS attribute constants
VENDOR_MIKROTIK = 14988
VENDOR_HUAWEI = 2011

# Common RADIUS attributes
ATTR_USER_NAME = "User-Name"
ATTR_USER_PASSWORD = "User-Password"
ATTR_CHAP_PASSWORD = "CHAP-Password"
ATTR_CHAP_CHALLENGE = "CHAP-Challenge"
ATTR_NAS_IP_ADDRESS = "NAS-IP-Address"
ATTR_NAS_PORT = "NAS-Port"
ATTR_SERVICE_TYPE = "Service-Type"
ATTR_FRAMED_PROTOCOL = "Framed-Protocol"
ATTR_FRAMED_IP_ADDRESS = "Framed-IP-Address"
ATTR_FRAMED_IP_NETMASK = "Framed-IP-Netmask"
ATTR_SESSION_TIMEOUT = "Session-Timeout"
ATTR_IDLE_TIMEOUT = "Idle-Timeout"
ATTR_ACCT_STATUS_TYPE = "Acct-Status-Type"
ATTR_ACCT_SESSION_ID = "Acct-Session-Id"
ATTR_ACCT_INPUT_OCTETS = "Acct-Input-Octets"
ATTR_ACCT_OUTPUT_OCTETS = "Acct-Output-Octets"
ATTR_ACCT_SESSION_TIME = "Acct-Session-Time"
ATTR_ACCT_TERMINATE_CAUSE = "Acct-Terminate-Cause"
ATTR_ACCT_INTERIM_INTERVAL = "Acct-Interim-Interval"


class AuthResult:
    """Authentication result container"""
    def __init__(
        self,
        success: bool,
        customer_id: Optional[str] = None,
        reject_reason: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None,
    ):
        self.success = success
        self.customer_id = customer_id
        self.reject_reason = reject_reason
        self.attributes = attributes or {}


async def handle_authentication(
    request: packet.AuthPacket,
    dictionary: Dictionary,
) -> Tuple[bool, Dict[str, Any], Optional[str]]:
    """
    Handle RADIUS Access-Request packet.
    
    Returns:
        Tuple of (success, reply_attributes, reject_reason)
    """
    settings = get_settings()
    db = get_supabase_client()
    
    # Extract request attributes
    username = request.get(ATTR_USER_NAME, [b""])[0]
    if isinstance(username, bytes):
        username = username.decode("utf-8")
    
    nas_ip = request.get(ATTR_NAS_IP_ADDRESS, ["0.0.0.0"])[0]
    if isinstance(nas_ip, bytes):
        nas_ip = nas_ip.decode("utf-8")
    
    logger.info("Authentication request", username=username, nas_ip=nas_ip)
    
    # Check rate limiting
    if await db.check_rate_limit(username):
        await db.log_auth_attempt(username, False, nas_ip, "Rate limited")
        return False, {}, "Too many failed attempts. Please try again later."
    
    # Fetch subscriber
    subscriber = await db.get_subscriber_by_username(username)
    
    if not subscriber:
        await db.log_auth_attempt(username, False, nas_ip, "User not found")
        logger.warn("Subscriber not found", username=username)
        return False, {}, "User not found"
    
    customer_id = subscriber["id"]
    status = subscriber.get("status", "active")
    
    # Check account status
    if status == "suspended":
        await db.log_auth_attempt(username, False, nas_ip, "Account suspended")
        return False, {}, "Account suspended. Please contact support."
    
    if status == "blocked":
        await db.log_auth_attempt(username, False, nas_ip, "Account blocked")
        return False, {}, "Account blocked. Please contact support."
    
    # Check for overdue invoices
    if await db.check_overdue_invoices(customer_id):
        await db.log_auth_attempt(username, False, nas_ip, "Overdue invoices")
        return False, {}, "Payment overdue. Please clear your balance."
    
    # Validate password (PAP)
    user_password = request.get(ATTR_USER_PASSWORD)
    if user_password:
        password = request.PwDecrypt(user_password[0])
        stored_hash = await db.get_subscriber_password_hash(customer_id)
        
        if stored_hash:
            # Verify password hash
            input_hash = hashlib.sha256(password.encode()).hexdigest()
            if input_hash != stored_hash:
                await db.log_auth_attempt(username, False, nas_ip, "Invalid password")
                return False, {}, "Invalid credentials"
    
    # CHAP authentication
    chap_password = request.get(ATTR_CHAP_PASSWORD)
    if chap_password:
        # CHAP validation would go here
        # For now, we trust NAS-side CHAP validation
        pass
    
    # Get subscription and service details
    subscriptions = subscriber.get("subscriptions", [])
    if not subscriptions:
        await db.log_auth_attempt(username, False, nas_ip, "No active subscription")
        return False, {}, "No active subscription"
    
    active_sub = subscriptions[0]
    service = active_sub.get("services", {})
    
    # Get speed profile
    speed_profile = await db.get_speed_profile(service.get("id", ""))
    
    # Build reply attributes
    reply_attrs = {
        ATTR_SERVICE_TYPE: "Framed-User",
        ATTR_FRAMED_PROTOCOL: "PPP",
        ATTR_SESSION_TIMEOUT: settings.default_session_timeout,
        ATTR_IDLE_TIMEOUT: 1800,  # 30 minutes
        ATTR_ACCT_INTERIM_INTERVAL: settings.default_interim_interval,
    }
    
    # Add vendor-specific speed attributes (MikroTik format)
    download_rate = speed_profile["download_mbps"] * 1000000  # Convert to bps
    upload_rate = speed_profile["upload_mbps"] * 1000000
    
    # MikroTik rate limit format: rx-rate[/tx-rate] [rx-burst-rate/tx-burst-rate]
    rate_limit = f"{upload_rate}/{download_rate}"
    reply_attrs["Mikrotik-Rate-Limit"] = rate_limit
    
    # Log successful auth
    await db.log_auth_attempt(username, True, nas_ip)
    
    logger.info("Authentication successful", 
               username=username, 
               customer_id=customer_id,
               speed_profile=speed_profile)
    
    return True, reply_attrs, None


async def handle_accounting(
    request: packet.AcctPacket,
    dictionary: Dictionary,
) -> bool:
    """
    Handle RADIUS Accounting-Request packet.
    
    Supports Start, Interim-Update, and Stop accounting types.
    """
    db = get_supabase_client()
    
    # Extract common attributes
    username = request.get(ATTR_USER_NAME, [b""])[0]
    if isinstance(username, bytes):
        username = username.decode("utf-8")
    
    session_id = request.get(ATTR_ACCT_SESSION_ID, [b""])[0]
    if isinstance(session_id, bytes):
        session_id = session_id.decode("utf-8")
    
    nas_ip = request.get(ATTR_NAS_IP_ADDRESS, ["0.0.0.0"])[0]
    if isinstance(nas_ip, bytes):
        nas_ip = nas_ip.decode("utf-8")
    
    acct_status = request.get(ATTR_ACCT_STATUS_TYPE, [0])[0]
    
    # Get usage data
    input_octets = request.get(ATTR_ACCT_INPUT_OCTETS, [0])[0]
    output_octets = request.get(ATTR_ACCT_OUTPUT_OCTETS, [0])[0]
    session_time = request.get(ATTR_ACCT_SESSION_TIME, [0])[0]
    
    # Get framed IP
    framed_ip = request.get(ATTR_FRAMED_IP_ADDRESS)
    framed_ip = framed_ip[0] if framed_ip else None
    if isinstance(framed_ip, bytes):
        framed_ip = framed_ip.decode("utf-8")
    
    logger.info("Accounting request",
               username=username,
               session_id=session_id,
               acct_status=acct_status,
               input_octets=input_octets,
               output_octets=output_octets)
    
    # Get customer ID
    subscriber = await db.get_subscriber_by_username(username)
    if not subscriber:
        logger.warn("Accounting for unknown subscriber", username=username)
        return True  # Accept anyway to avoid NAS retry storms
    
    customer_id = subscriber["id"]
    
    # Handle different accounting types
    if acct_status == 1:  # Start
        # Check for duplicate
        if await db.is_session_duplicate(session_id):
            logger.info("Duplicate accounting start", session_id=session_id)
            return True
        
        await db.log_accounting_start(
            customer_id=customer_id,
            session_id=session_id,
            nas_ip=nas_ip,
            framed_ip=framed_ip,
        )
        
    elif acct_status == 3:  # Interim-Update
        await db.log_accounting_interim(
            session_id=session_id,
            input_octets=input_octets,
            output_octets=output_octets,
            session_time=session_time,
        )
        
    elif acct_status == 2:  # Stop
        terminate_cause = request.get(ATTR_ACCT_TERMINATE_CAUSE, ["Unknown"])[0]
        if isinstance(terminate_cause, bytes):
            terminate_cause = terminate_cause.decode("utf-8")
        
        await db.log_accounting_stop(
            session_id=session_id,
            input_octets=input_octets,
            output_octets=output_octets,
            session_time=session_time,
            terminate_cause=str(terminate_cause),
        )
    
    return True
