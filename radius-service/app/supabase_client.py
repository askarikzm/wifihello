"""Supabase client for RADIUS service"""
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import structlog
from supabase import create_client, Client

from .config import get_settings

logger = structlog.get_logger()


class SupabaseClient:
    """Async-friendly Supabase client wrapper for RADIUS operations"""
    
    def __init__(self):
        settings = get_settings()
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_key
        )
    
    async def get_subscriber_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Fetch subscriber details by username (account_no or phone).
        Returns customer with subscription and service details.
        """
        try:
            # First try by account_no
            result = self.client.table("customers").select(
                "*, subscriptions(*, services(*))"
            ).eq("account_no", username).eq("subscriptions.status", "active").single().execute()
            
            if result.data:
                return result.data
            
            # Try by phone number
            result = self.client.table("customers").select(
                "*, subscriptions(*, services(*))"
            ).eq("phone", username).eq("subscriptions.status", "active").single().execute()
            
            return result.data
        except Exception as e:
            logger.error("Failed to fetch subscriber", username=username, error=str(e))
            return None
    
    async def get_subscriber_password_hash(self, customer_id: str) -> Optional[str]:
        """
        Get subscriber's RADIUS password hash.
        In production, this would be stored securely.
        """
        try:
            result = self.client.table("radius_credentials").select(
                "password_hash"
            ).eq("customer_id", customer_id).single().execute()
            
            return result.data.get("password_hash") if result.data else None
        except Exception:
            return None
    
    async def check_overdue_invoices(self, customer_id: str) -> bool:
        """Check if customer has overdue invoices"""
        try:
            result = self.client.table("invoices").select("id").eq(
                "status", "overdue"
            ).execute()
            
            # Check via subscription -> customer relationship
            invoices = self.client.rpc("check_customer_overdue", {
                "p_customer_id": customer_id
            }).execute()
            
            return bool(invoices.data)
        except Exception as e:
            logger.error("Failed to check overdue invoices", customer_id=customer_id, error=str(e))
            return False
    
    async def get_speed_profile(self, service_id: str) -> Dict[str, int]:
        """Get speed profile for a service"""
        try:
            result = self.client.table("services").select(
                "down_mbps, up_mbps"
            ).eq("id", service_id).single().execute()
            
            if result.data:
                return {
                    "download_mbps": result.data["down_mbps"],
                    "upload_mbps": result.data["up_mbps"],
                }
            return {"download_mbps": 10, "upload_mbps": 5}  # Default fallback
        except Exception as e:
            logger.error("Failed to get speed profile", service_id=service_id, error=str(e))
            return {"download_mbps": 10, "upload_mbps": 5}
    
    async def log_accounting_start(
        self,
        customer_id: str,
        session_id: str,
        nas_ip: str,
        framed_ip: Optional[str] = None,
    ) -> str:
        """Log RADIUS accounting start"""
        try:
            result = self.client.table("radius_sessions").insert({
                "customer_id": customer_id,
                "session_id": session_id,
                "nas_ip_address": nas_ip,
                "framed_ip_address": framed_ip,
                "session_start": datetime.utcnow().isoformat(),
                "status": "active",
            }).execute()
            
            logger.info("Accounting start logged", 
                       customer_id=customer_id, 
                       session_id=session_id)
            return result.data[0]["id"] if result.data else ""
        except Exception as e:
            logger.error("Failed to log accounting start", error=str(e))
            return ""
    
    async def log_accounting_interim(
        self,
        session_id: str,
        input_octets: int,
        output_octets: int,
        session_time: int,
    ) -> bool:
        """Log RADIUS accounting interim update"""
        try:
            # Update session with latest usage
            self.client.table("radius_sessions").update({
                "input_octets": input_octets,
                "output_octets": output_octets,
                "session_time": session_time,
                "last_update": datetime.utcnow().isoformat(),
            }).eq("session_id", session_id).execute()
            
            # Also log to usage_logs for analytics
            session = self.client.table("radius_sessions").select(
                "customer_id"
            ).eq("session_id", session_id).single().execute()
            
            if session.data:
                self.client.table("usage_logs").insert({
                    "customer_id": session.data["customer_id"],
                    "download_mb": output_octets // (1024 * 1024),
                    "upload_mb": input_octets // (1024 * 1024),
                    "session_id": session_id,
                }).execute()
            
            return True
        except Exception as e:
            logger.error("Failed to log accounting interim", 
                        session_id=session_id, error=str(e))
            return False
    
    async def log_accounting_stop(
        self,
        session_id: str,
        input_octets: int,
        output_octets: int,
        session_time: int,
        terminate_cause: str,
    ) -> bool:
        """Log RADIUS accounting stop"""
        try:
            self.client.table("radius_sessions").update({
                "input_octets": input_octets,
                "output_octets": output_octets,
                "session_time": session_time,
                "session_end": datetime.utcnow().isoformat(),
                "terminate_cause": terminate_cause,
                "status": "closed",
            }).eq("session_id", session_id).execute()
            
            # Final usage log entry
            session = self.client.table("radius_sessions").select(
                "customer_id"
            ).eq("session_id", session_id).single().execute()
            
            if session.data:
                self.client.table("usage_logs").insert({
                    "customer_id": session.data["customer_id"],
                    "download_mb": output_octets // (1024 * 1024),
                    "upload_mb": input_octets // (1024 * 1024),
                    "session_id": session_id,
                }).execute()
            
            logger.info("Accounting stop logged", session_id=session_id)
            return True
        except Exception as e:
            logger.error("Failed to log accounting stop", 
                        session_id=session_id, error=str(e))
            return False
    
    async def is_session_duplicate(self, session_id: str) -> bool:
        """Check if session already exists (duplicate packet protection)"""
        try:
            result = self.client.table("radius_sessions").select(
                "id"
            ).eq("session_id", session_id).execute()
            return bool(result.data)
        except Exception:
            return False
    
    async def log_auth_attempt(
        self,
        username: str,
        success: bool,
        nas_ip: str,
        reason: Optional[str] = None,
    ):
        """Log authentication attempt for auditing"""
        try:
            self.client.table("radius_auth_logs").insert({
                "username": username,
                "success": success,
                "nas_ip_address": nas_ip,
                "failure_reason": reason,
                "attempted_at": datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            logger.error("Failed to log auth attempt", error=str(e))
    
    async def check_rate_limit(self, username: str) -> bool:
        """Check if user is rate limited due to failed attempts"""
        settings = get_settings()
        try:
            cutoff = (datetime.utcnow() - timedelta(seconds=settings.lockout_duration)).isoformat()
            result = self.client.table("radius_auth_logs").select(
                "id", count="exact"
            ).eq("username", username).eq("success", False).gte(
                "attempted_at", cutoff
            ).execute()
            
            return result.count >= settings.max_auth_attempts
        except Exception:
            return False


# Singleton instance
_client: Optional[SupabaseClient] = None


def get_supabase_client() -> SupabaseClient:
    global _client
    if _client is None:
        _client = SupabaseClient()
    return _client
