import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.contract import ActiveContract, MissionStatus
from app.api.simulation import run_mission_simulation

logger = logging.getLogger(__name__)

class MissionTickSystem:
    """Background system to process active missions"""
    
    def __init__(self):
        self.is_running = False
        self.task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the tick system"""
        if self.is_running:
            logger.warning("Tick system is already running")
            return
        
        self.is_running = True
        self.task = asyncio.create_task(self._tick_loop())
        logger.info("Mission tick system started")
    
    async def stop(self):
        """Stop the tick system"""
        if not self.is_running:
            logger.warning("Tick system is not running")
            return
        
        self.is_running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Mission tick system stopped")
    
    async def _tick_loop(self):
        """Main tick loop that processes missions"""
        while self.is_running:
            try:
                await self._process_tick()
                # Tick every 30 seconds (adjust as needed)
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in tick loop: {e}")
                await asyncio.sleep(5)  # Short delay before retrying
    
    async def _process_tick(self):
        """Process a single tick - check for expired missions, etc."""
        db = SessionLocal()
        try:
            # Get all active contracts
            active_contracts = db.query(ActiveContract).filter(
                ActiveContract.status == MissionStatus.ACTIVE
            ).all()
            
            logger.info(f"Processing tick for {len(active_contracts)} active contracts")
            
            for contract in active_contracts:
                # Check if contract has expired
                if contract.expires_at and datetime.now() > contract.expires_at:
                    logger.info(f"Contract {contract.id} has expired")
                    # Mark as failed due to timeout
                    contract.status = MissionStatus.CANCELLED
                    # In a real system, we might apply penalties
                
                # For now, we'll just log that we're checking
                # In a full implementation, we'd simulate mission progress here
                # and potentially auto-complete missions based on time elapsed
                
            db.commit()
            
        except Exception as e:
            logger.error(f"Error processing tick: {e}")
            db.rollback()
        finally:
            db.close()

# Global tick system instance
tick_system = MissionTickSystem()

# Function to start the tick system (to be called from main app)
def start_tick_system():
    """Start the background tick system"""
    loop = asyncio.get_event_loop()
    if not tick_system.is_running:
        loop.create_task(tick_system.start())

# Function to stop the tick system
def stop_tick_system():
    """Stop the background tick system"""
    loop = asyncio.get_event_loop()
    if tick_system.is_running:
        loop.create_task(tick_system.stop())