# NG Edge v7.5.0 Alignment Audit Report

Date: 2025-12-20

## Included artifacts
- PRD: NG-EDGE-PRD-v7.5.0-Integrated-Final.md
- Drills: NG-Drills-EDGE-v7.5.0.json
- Contracts: ng-contracts-v1.1.zip
- Docs aligned: 00_README / 01-07 (versioned copies)

## Drills quick stats
- schemaVersion: drill-suite.v2.3.5
- totalCases (declared): 50
- totalCases (actual): 50
- workflowClass breakdown:
{
  "SECURITY_HEAVY": 36,
  "NONE": 4,
  "SUSPICION_LIGHT": 5,
  "LIFE_SAFETY": 3,
  "LOGISTICS": 2
}

## Remote Verify coverage (new)
Cases that assert `expected.remoteVerify`:
- RV-AWAY-001, RV-AWAY-002, RV-NIGHT-001, MAINT-001

Coverage requirement `remoteVerifyRequirements`:
{
  "minCases": 3,
  "requiredModes": [
    "away",
    "night"
  ],
  "requiredRemoteVerifyModes": [
    "segment_stream"
  ],
  "requiredIncidentPacketCases": 2
}

## Contracts (ng-contracts-v1.1) additions summary
- events.ingest.request/eventDetail/eventSummary: optional fields
  - edge_schema_version, workflowClass, mode, userAlertLevel, dispatchReadinessLevel
  - edgeAssessment (capability/presence/threat/avs)
  - remoteVerify, incidentPacket, eventDisposition
- evidence.manifest item: role/origin/sequenceNo/captureContext

## Known limitations / recommended future audit
1) `userAlertLevel/dispatchReadinessLevel` 对于历史用例已做“推断补齐”，建议在实现 Runner 时逐步收敛为“由规则计算出来的期望值”，避免测试过宽。
2) 视频“类直播”目前以 segments 拼接为默认；若未来支持真正 live stream，需要补充相应 Drills 与接口细节（会话鉴权、带宽控制、过期策略）。
3) Incident Packet 的 PDF/可打印版为可选（P1）；当前仅定义 JSON 结构与 manifest 对齐要求。

