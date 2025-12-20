"""
NG Edge Drill Runner - PRD v7.4.2

Executes drills from NG-Drills-EDGE-v7.4.2.json against the signal pipeline.
Provides simulated sensor interface for testing before hardware integration.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Callable
from pathlib import Path
import uuid

from ..domain.enums import (
    SignalType,
    ZoneType,
    LocationType,
    HouseMode,
    NightSubMode,
    AlarmState,
    WorkflowClass,
    EventDisposition,
    UserAlertLevel,
    DispatchReadinessLevel,
    CapabilityTier,
)
from ..domain.models import Signal, Zone, EntryPoint, Topology, ModeConfig
from .signal_pipeline import SignalPipeline, DebounceConfig, ProcessedSignal
from .alarm_sm import AlarmSMConfig


# =============================================================================
# Drill Case Structures
# =============================================================================

@dataclass
class DrillSignal:
    """Signal definition from drill case."""
    t: float  # Time offset in seconds
    sensor_id: str
    signal_type: str
    confidence: float = 1.0
    duration_sec: Optional[float] = None
    meta: Optional[dict] = None


@dataclass
class DrillExpectation:
    """Expected results from drill case."""
    should_create_event: bool
    workflow_class: Optional[str] = None
    user_alert_level: Optional[int] = None
    dispatch_readiness_level: Optional[int] = None
    alarm_sm: Optional[dict] = None
    event_disposition: Optional[dict] = None
    avs_assessment: Optional[dict] = None


@dataclass
class DrillCase:
    """A single drill test case."""
    case_id: str
    title: str
    mode: str
    signals: list[DrillSignal]
    expected: DrillExpectation
    tags: list[str] = field(default_factory=list)
    night_sub_mode: Optional[str] = None
    dispatch_policy_profile_id: Optional[str] = None


@dataclass
class DrillResult:
    """Result of running a single drill."""
    case_id: str
    passed: bool = False
    failures: list[str] = field(default_factory=list)
    transitions: list[dict] = field(default_factory=list)
    final_state: Optional[str] = None
    event_created: bool = False
    workflow_class: Optional[str] = None
    user_alert_level: Optional[int] = None
    dispatch_readiness_level: Optional[int] = None
    duration_ms: float = 0


# =============================================================================
# Sensor Bindings (from Drills assumptions)
# =============================================================================

@dataclass
class SensorBinding:
    """Sensor to zone/entry point binding."""
    sensor_id: str
    sensor_type: str
    zone_id: Optional[str]
    zone_type: Optional[ZoneType]
    location_type: LocationType
    entry_point_id: Optional[str]
    
    @classmethod
    def from_drill_binding(cls, sensor_id: str, sensor_def: dict, binding: dict) -> "SensorBinding":
        """Create from drill assumptions."""
        zone_type = None
        if binding.get("zoneType"):
            zone_type_map = {
                "ENTRY_EXIT": ZoneType.ENTRY_EXIT,
                "PERIMETER": ZoneType.PERIMETER,
                "INTERIOR_FOLLOWER": ZoneType.INTERIOR,
                "INTERIOR": ZoneType.INTERIOR,
                "EXTERIOR": ZoneType.EXTERIOR,
                "FIRE_24H": ZoneType.FIRE_24H,
                "CO_24H": ZoneType.CO_24H,
            }
            zone_type = zone_type_map.get(binding["zoneType"])
        
        location_type_map = {
            "OUTDOOR": LocationType.OUTDOOR,
            "INDOOR": LocationType.INDOOR,
            "ENTRY": LocationType.THRESHOLD,
            "SYSTEM": LocationType.INDOOR,
        }
        location_type = location_type_map.get(
            binding.get("locationType", "INDOOR"),
            LocationType.INDOOR
        )
        
        return cls(
            sensor_id=sensor_id,
            sensor_type=sensor_def.get("sensorType", "unknown"),
            zone_id=binding.get("zoneId"),
            zone_type=zone_type,
            location_type=location_type,
            entry_point_id=binding.get("entryPointId"),
        )


# =============================================================================
# Simulated Sensor Interface
# =============================================================================

class SimulatedSensor:
    """A simulated sensor for testing."""
    
    def __init__(
        self,
        sensor_id: str,
        sensor_type: str,
        binding: SensorBinding,
        on_signal: Optional[Callable[[Signal], None]] = None,
    ):
        self.sensor_id = sensor_id
        self.sensor_type = sensor_type
        self.binding = binding
        self.on_signal = on_signal
        self._last_signal_time: Optional[datetime] = None
    
    def trigger(
        self,
        signal_type: SignalType,
        confidence: float = 1.0,
        timestamp: Optional[datetime] = None,
    ) -> Signal:
        """Trigger the sensor and generate a signal."""
        timestamp = timestamp or datetime.now(timezone.utc)
        
        signal = Signal(
            signal_id=f"sig_{uuid.uuid4().hex[:8]}",
            timestamp=timestamp,
            sensor_id=self.sensor_id,
            sensor_type=self.sensor_type,
            signal_type=signal_type,
            zone_id=self.binding.zone_id or "unknown",
            entry_point_id=self.binding.entry_point_id,
            confidence=confidence,
        )
        
        self._last_signal_time = timestamp
        
        if self.on_signal:
            self.on_signal(signal)
        
        return signal


class SensorSimulator:
    """Manages simulated sensors for testing."""
    
    def __init__(self):
        self.sensors: dict[str, SimulatedSensor] = {}
        self.bindings: dict[str, SensorBinding] = {}
        self._signal_callback: Optional[Callable[[Signal], None]] = None
    
    def set_signal_callback(self, callback: Callable[[Signal], None]) -> None:
        """Set callback for all sensor signals."""
        self._signal_callback = callback
        for sensor in self.sensors.values():
            sensor.on_signal = callback
    
    def add_sensor(self, binding: SensorBinding) -> SimulatedSensor:
        """Add a simulated sensor."""
        sensor = SimulatedSensor(
            sensor_id=binding.sensor_id,
            sensor_type=binding.sensor_type,
            binding=binding,
            on_signal=self._signal_callback,
        )
        self.sensors[binding.sensor_id] = sensor
        self.bindings[binding.sensor_id] = binding
        return sensor
    
    def get_sensor(self, sensor_id: str) -> Optional[SimulatedSensor]:
        """Get a sensor by ID."""
        return self.sensors.get(sensor_id)
    
    def trigger_sensor(
        self,
        sensor_id: str,
        signal_type: SignalType,
        confidence: float = 1.0,
        timestamp: Optional[datetime] = None,
    ) -> Optional[Signal]:
        """Trigger a sensor by ID."""
        sensor = self.sensors.get(sensor_id)
        if sensor:
            return sensor.trigger(signal_type, confidence, timestamp)
        return None
    
    def build_topology(self) -> Topology:
        """Build topology from sensor bindings."""
        zones: dict[str, Zone] = {}
        entry_points: dict[str, EntryPoint] = {}
        
        for binding in self.bindings.values():
            if binding.zone_id and binding.zone_id not in zones:
                zones[binding.zone_id] = Zone(
                    zone_id=binding.zone_id,
                    name=binding.zone_id.replace("zone.", "").replace("_", " ").title(),
                    zone_type=binding.zone_type or ZoneType.EXTERIOR,
                    location_type=binding.location_type,
                    entry_point_ids=[binding.entry_point_id] if binding.entry_point_id else [],
                )
            
            if binding.entry_point_id and binding.entry_point_id not in entry_points:
                entry_points[binding.entry_point_id] = EntryPoint(
                    entry_point_id=binding.entry_point_id,
                    name=binding.entry_point_id.replace("ep.", "").replace("_", " ").title(),
                    zone_id=binding.zone_id or "unknown",
                    entry_delay_away_sec=30,
                    entry_delay_night_sec=15,
                )
        
        return Topology(zones=zones, entry_points=entry_points)
    
    def list_sensors(self) -> list[dict]:
        """List all sensors."""
        return [
            {
                "sensor_id": b.sensor_id,
                "sensor_type": b.sensor_type,
                "zone_id": b.zone_id,
                "zone_type": b.zone_type.value if b.zone_type else None,
                "entry_point_id": b.entry_point_id,
            }
            for b in self.bindings.values()
        ]


# =============================================================================
# Drill Runner
# =============================================================================

class DrillRunner:
    """Runs drill cases against the signal pipeline."""
    
    def __init__(self, drills_path: Optional[str] = None):
        self.drills_data: Optional[dict] = None
        self.cases: list[DrillCase] = []
        self.simulator = SensorSimulator()
        
        if drills_path:
            self.load_drills(drills_path)
    
    def load_drills(self, path: str) -> None:
        """Load drills from JSON file."""
        with open(path, "r") as f:
            self.drills_data = json.load(f)
        
        # Setup sensors from assumptions
        sensors = self.drills_data.get("assumptions", {}).get("sensors", {})
        bindings = self.drills_data.get("assumptions", {}).get("sensorBindings", {})
        
        for sensor_id, sensor_def in sensors.items():
            binding_data = bindings.get(sensor_id, {})
            binding = SensorBinding.from_drill_binding(sensor_id, sensor_def, binding_data)
            self.simulator.add_sensor(binding)
        
        # Parse cases
        for case_data in self.drills_data.get("cases", []):
            self.cases.append(self._parse_case(case_data))
    
    def _parse_case(self, data: dict) -> DrillCase:
        """Parse a drill case from JSON."""
        signals = []
        for sig in data.get("signals", []):
            signals.append(DrillSignal(
                t=sig.get("t", 0),
                sensor_id=sig.get("sensorId", ""),
                signal_type=sig.get("signalType", ""),
                confidence=sig.get("confidence", 1.0),
                duration_sec=sig.get("durationSec"),
                meta=sig.get("meta"),
            ))
        
        expected_data = data.get("expected", {})
        expected = DrillExpectation(
            should_create_event=expected_data.get("shouldCreateEvent", True),
            workflow_class=expected_data.get("workflowClass"),
            user_alert_level=expected_data.get("userAlertLevel"),
            dispatch_readiness_level=expected_data.get("dispatchReadinessLevel"),
            alarm_sm=expected_data.get("alarmSM"),
            event_disposition=expected_data.get("eventDisposition"),
            avs_assessment=expected_data.get("avsAssessment"),
        )
        
        return DrillCase(
            case_id=data.get("caseId", "UNKNOWN"),
            title=data.get("title", ""),
            mode=data.get("mode", "away"),
            signals=signals,
            expected=expected,
            tags=data.get("tags", []),
            night_sub_mode=data.get("nightSubMode"),
            dispatch_policy_profile_id=data.get("dispatchPolicyProfileId"),
        )
    
    def run_case(self, case: DrillCase) -> DrillResult:
        """Run a single drill case."""
        import time
        start_time = time.time()
        
        result = DrillResult(case_id=case.case_id)
        failures = []
        transitions = []
        
        # Setup pipeline
        topology = self.simulator.build_topology()
        
        # Configure alarm SM based on policy
        alarm_config = AlarmSMConfig(
            entry_delay_away_sec=30,
            entry_delay_night_occupied_sec=15,
            entry_delay_night_perimeter_sec=0,
            entry_delay_home_sec=30,
            follower_path_sec=20,
        )
        
        pipeline = SignalPipeline(
            topology=topology,
            alarm_config=alarm_config,
            debounce_config=DebounceConfig(
                motion_cooldown_sec=0,  # Disable for testing
                camera_cooldown_sec=0,
            ),
        )
        
        # Set mode
        mode_map = {
            "away": HouseMode.AWAY,
            "home": HouseMode.HOME,
            "night": HouseMode.NIGHT,
            "disarmed": HouseMode.DISARMED,
        }
        house_mode = mode_map.get(case.mode, HouseMode.AWAY)
        
        night_sub = None
        if case.night_sub_mode:
            night_sub_map = {
                "occupied": NightSubMode.NIGHT_OCCUPIED,
                "perimeter": NightSubMode.NIGHT_PERIMETER,
            }
            night_sub = night_sub_map.get(case.night_sub_mode)
        
        pipeline.set_mode(house_mode, night_sub)
        
        # Process signals in time order
        base_time = datetime.now(timezone.utc)
        sorted_signals = sorted(case.signals, key=lambda s: s.t)
        
        for drill_sig in sorted_signals:
            signal_time = base_time + timedelta(seconds=drill_sig.t)
            
            # Handle system signals (disarm, verification)
            if drill_sig.sensor_id == "system":
                if drill_sig.signal_type == "disarm":
                    trans = pipeline.disarm(signal_time)
                    if trans and trans.success:
                        transitions.append({
                            "t": drill_sig.t,
                            "state": trans.to_state.value,
                            "trigger": trans.trigger.value,
                        })
                elif drill_sig.signal_type == "entry_delay_expired":
                    trans = pipeline.trigger_entry_delay_expired(signal_time)
                    if trans and trans.success:
                        transitions.append({
                            "t": drill_sig.t,
                            "state": trans.to_state.value,
                            "trigger": trans.trigger.value,
                        })
                elif drill_sig.signal_type == "verification_confirmed_true":
                    # Update event disposition to verified_true
                    if pipeline.active_event:
                        pipeline.active_event.event_disposition = EventDisposition.VERIFIED_TRUE
                elif drill_sig.signal_type == "verification_confirmed_false":
                    if pipeline.active_event:
                        pipeline.active_event.event_disposition = EventDisposition.VERIFIED_FALSE
                continue
            
            # Get sensor binding
            binding = self.simulator.bindings.get(drill_sig.sensor_id)
            if not binding:
                failures.append(f"Unknown sensor: {drill_sig.sensor_id}")
                continue
            
            # Map signal type
            signal_type = self._map_signal_type(drill_sig.signal_type)
            if not signal_type:
                failures.append(f"Unknown signal type: {drill_sig.signal_type}")
                continue
            
            # Create signal
            signal = Signal(
                signal_id=f"sig_{uuid.uuid4().hex[:8]}",
                timestamp=signal_time,
                sensor_id=drill_sig.sensor_id,
                sensor_type=binding.sensor_type,
                signal_type=signal_type,
                zone_id=binding.zone_id or "unknown",
                entry_point_id=binding.entry_point_id,
                confidence=drill_sig.confidence,
            )
            
            # Process signal
            proc_result = pipeline.process(signal, now=signal_time)
            
            # Record transition if any
            if proc_result.transition and proc_result.transition.success:
                transitions.append({
                    "t": drill_sig.t,
                    "state": proc_result.transition.to_state.value,
                    "trigger": proc_result.transition.trigger.value,
                })
            
            # Check for entry delay expiry (simulate timer)
            if pipeline.alarm_sm.state == AlarmState.PENDING:
                delay = pipeline.alarm_sm.entry_delay_sec
                expire_time = base_time + timedelta(seconds=drill_sig.t + delay)
                
                # Check if next signal is after expiry
                next_signals = [s for s in sorted_signals if s.t > drill_sig.t]
                if next_signals:
                    next_time = base_time + timedelta(seconds=next_signals[0].t)
                    if next_time > expire_time:
                        # Expire before next signal
                        trans = pipeline.trigger_entry_delay_expired(expire_time)
                        if trans and trans.success:
                            transitions.append({
                                "t": drill_sig.t + delay,
                                "state": trans.to_state.value,
                                "trigger": trans.trigger.value,
                            })
        
        # Collect results
        result.transitions = transitions
        result.final_state = pipeline.alarm_state.value
        result.event_created = pipeline.active_event is not None
        
        if pipeline.active_event:
            result.workflow_class = pipeline.active_event.workflow_class.value
            result.user_alert_level = pipeline.active_event.user_alert_level
            result.dispatch_readiness_level = pipeline.active_event.dispatch_readiness_local
        
        # Validate expectations
        failures.extend(self._validate_case(case, result, pipeline))
        
        result.failures = failures
        result.passed = len(failures) == 0
        result.duration_ms = (time.time() - start_time) * 1000
        
        return result
    
    def _map_signal_type(self, type_str: str) -> Optional[SignalType]:
        """Map drill signal type string to enum."""
        mapping = {
            "person_detected": SignalType.PERSON_DETECTED,
            "vehicle_detected": SignalType.VEHICLE_DETECTED,
            "door_open": SignalType.DOOR_OPEN,
            "door_close": SignalType.DOOR_CLOSE,
            "window_open": SignalType.WINDOW_OPEN,
            "motion_active": SignalType.MOTION_ACTIVE,
            "glass_break": SignalType.GLASS_BREAK,
            "forced_entry": SignalType.FORCED_ENTRY,
            "smoke_detected": SignalType.SMOKE_DETECTED,
            "co_detected": SignalType.CO_DETECTED,
            "package_delivered": SignalType.PACKAGE_DELIVERED,
            "package_removed": SignalType.PACKAGE_REMOVED,
            "loiter": SignalType.LOITER,
            "approach_entry": SignalType.APPROACH_ENTRY,
            "weapon_detected": SignalType.PERSON_DETECTED,  # Map to person for now
            "tailgate": SignalType.PERSON_DETECTED,
        }
        return mapping.get(type_str)
    
    def _validate_case(
        self,
        case: DrillCase,
        result: DrillResult,
        pipeline: SignalPipeline,
    ) -> list[str]:
        """Validate result against expectations."""
        failures = []
        exp = case.expected
        
        # Validate event creation
        if exp.should_create_event != result.event_created:
            failures.append(
                f"Event creation: expected {exp.should_create_event}, got {result.event_created}"
            )
        
        # Validate workflow class
        if exp.workflow_class and result.workflow_class:
            if exp.workflow_class != result.workflow_class:
                failures.append(
                    f"Workflow class: expected {exp.workflow_class}, got {result.workflow_class}"
                )
        
        # Validate alarm state transitions
        if exp.alarm_sm:
            expected_trans = exp.alarm_sm.get("expectedTransitions", [])
            for i, exp_t in enumerate(expected_trans):
                exp_state = exp_t.get("state", "").lower()
                exp_time = exp_t.get("atOrBeforeSec")
                
                # Find matching transition
                found = False
                for actual_t in result.transitions:
                    if actual_t["state"] == exp_state:
                        if exp_time is not None and actual_t["t"] > exp_time:
                            failures.append(
                                f"Transition {exp_state}: expected at/before {exp_time}s, got at {actual_t['t']}s"
                            )
                        found = True
                        break
                
                if not found:
                    failures.append(f"Expected transition to {exp_state} not found")
            
            # Check mustNotReach
            must_not_reach = exp.alarm_sm.get("mustNotReach", [])
            for state in must_not_reach:
                if any(t["state"] == state.lower() for t in result.transitions):
                    failures.append(f"State {state} was reached but should not have been")
        
        # Validate event disposition
        if exp.event_disposition and pipeline.active_event:
            exp_disp = exp.event_disposition.get("expected")
            actual_disp = pipeline.active_event.event_disposition.value
            if exp_disp and exp_disp != actual_disp:
                failures.append(
                    f"Event disposition: expected {exp_disp}, got {actual_disp}"
                )
        
        return failures
    
    def run_all(self, tags: Optional[list[str]] = None) -> list[DrillResult]:
        """Run all drill cases (optionally filtered by tags)."""
        results = []
        
        for case in self.cases:
            if tags:
                if not any(tag in case.tags for tag in tags):
                    continue
            
            result = self.run_case(case)
            results.append(result)
        
        return results
    
    def get_summary(self, results: list[DrillResult]) -> dict:
        """Get summary of drill run."""
        passed = sum(1 for r in results if r.passed)
        failed = sum(1 for r in results if not r.passed)
        
        return {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "pass_rate": f"{100 * passed / len(results):.1f}%" if results else "N/A",
            "failures": [
                {"case_id": r.case_id, "failures": r.failures}
                for r in results if not r.passed
            ],
        }
