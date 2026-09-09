import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from app.config import BACKGROUND_SYNC_ENABLED, BACKGROUND_SYNC_INTERVAL_SECONDS
from app.db.database import SessionLocal
from app.db.models import UserMailboxConsent, utc_now
from app.services.mailbox_sync import sync_mailbox_history_events
from app.services.consent_manager import setup_gmail_watch

logger = logging.getLogger(__name__)


class GmailBackgroundSyncWorker:
    """
    Asynchronous Background Worker for Event-Based Mailbox Sync:
    Periodically checks for newly arrived emails across all active user consent records,
    extracts job status transitions, and automatically advances candidate applications in the background.
    """

    def __init__(self, interval_seconds: int = BACKGROUND_SYNC_INTERVAL_SECONDS):
        self.interval_seconds = max(10, interval_seconds)
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        # Telemetry & Status
        self.last_run_at: Optional[datetime] = None
        self.next_run_at: Optional[datetime] = None
        self.last_status: str = "idle"  # idle, syncing, paused, error
        self.last_error: Optional[str] = None
        self.total_cycles: int = 0
        self.total_updates_detected: int = 0
        self.last_cycle_summary: Dict = {}

    def get_status(self) -> Dict:
        return {
            "is_running": self.is_running,
            "interval_seconds": self.interval_seconds,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
            "last_status": self.last_status,
            "last_error": self.last_error,
            "total_cycles": self.total_cycles,
            "total_updates_detected": self.total_updates_detected,
            "last_cycle_summary": self.last_cycle_summary,
        }

    async def start(self):
        async with self._lock:
            if self.is_running:
                logger.info("Background sync worker is already running.")
                return

            self.is_running = True
            self.last_status = "idle"
            self._task = asyncio.create_task(self._run_loop())
            logger.info("Gmail background sync worker started with interval %ss.", self.interval_seconds)

    async def stop(self):
        async with self._lock:
            if not self.is_running:
                return

            self.is_running = False
            self.last_status = "paused"
            self.next_run_at = None
            if self._task and not self._task.done():
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            logger.info("Gmail background sync worker stopped.")

    def set_interval(self, seconds: int):
        self.interval_seconds = max(10, seconds)
        if self.is_running and self.last_run_at:
            self.next_run_at = datetime.fromtimestamp(
                self.last_run_at.timestamp() + self.interval_seconds,
                timezone.utc,
            )
        logger.info("Background sync worker interval updated to %ss.", self.interval_seconds)

    async def trigger_cycle(self) -> Dict:
        """Manually trigger an immediate background cycle."""
        logger.info("Manual trigger received for background sync worker cycle.")
        return await self._execute_sync_cycle()

    async def _run_loop(self):
        # Initial slight delay on startup to let server settle
        await asyncio.sleep(2)
        while self.is_running:
            try:
                await self._execute_sync_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Unexpected error in background sync loop: %s", e)
                self.last_status = "error"
                self.last_error = str(e)

            if not self.is_running:
                break

            self.next_run_at = datetime.fromtimestamp(
                utc_now().timestamp() + self.interval_seconds,
                timezone.utc,
            )
            try:
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break

    async def _execute_sync_cycle(self) -> Dict:
        self.last_status = "syncing"
        self.last_run_at = utc_now()
        self.last_error = None
        cycle_updates = 0
        cycle_processed = 0
        users_synced = 0
        details = []

        # Run DB-bound sync operations in default executor to avoid blocking the event loop
        loop = asyncio.get_running_loop()

        def _db_work():
            nonlocal cycle_updates, cycle_processed, users_synced
            db = SessionLocal()
            try:
                # Query all user consents where sync is active
                consents = (
                    db.query(UserMailboxConsent)
                    .filter(
                        UserMailboxConsent.consent_given == True,  # noqa: E712
                        UserMailboxConsent.is_sync_enabled == True,  # noqa: E712
                    )
                    .all()
                )

                for consent in consents:
                    # Maintain active Pub/Sub Gmail watch (auto-renew if missing or expiring within 24h)
                    try:
                        now = utc_now()
                        watch_exp = consent.watch_expiration
                        if watch_exp is not None and watch_exp.tzinfo is None:
                            watch_exp = watch_exp.replace(tzinfo=timezone.utc)
                        if not watch_exp or (watch_exp - now).total_seconds() < 86400:
                            setup_gmail_watch(db, consent)
                    except Exception as w_err:
                        logger.warning("Auto watch renewal failed for %s: %s", consent.user_email, w_err)

                    try:
                        res = sync_mailbox_history_events(db, consent=consent)
                        updates = res.get("updates_count", 0)
                        processed = res.get("processed_count", 0)
                        cycle_updates += updates
                        cycle_processed += processed
                        users_synced += 1
                        details.append({
                            "user_email": consent.user_email,
                            "updates_count": updates,
                            "processed_count": processed,
                            "status": res.get("status"),
                        })
                    except Exception as ex:
                        logger.error("Error syncing history for user %s: %s", consent.user_email, ex)
                        details.append({
                            "user_email": consent.user_email,
                            "error": str(ex),
                        })
            finally:
                db.close()

        try:
            await loop.run_in_executor(None, _db_work)
            self.total_cycles += 1
            self.total_updates_detected += cycle_updates
            self.last_status = "idle"
            self.last_cycle_summary = {
                "timestamp": self.last_run_at.isoformat(),
                "users_synced": users_synced,
                "cycle_processed": cycle_processed,
                "cycle_updates": cycle_updates,
                "details": details,
            }
            if cycle_updates > 0:
                logger.info(
                    "Background sync cycle finished: %d updates detected across %d user(s).",
                    cycle_updates,
                    users_synced,
                )
            return self.last_cycle_summary
        except Exception as e:
            self.last_status = "error"
            self.last_error = str(e)
            logger.error("Background sync cycle failed: %s", e)
            return {"status": "error", "error": str(e)}


# Global instance
background_worker = GmailBackgroundSyncWorker()
