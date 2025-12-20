#!/usr/bin/env python3
"""
NG Edge Manager Server

Starts the management API server with:
- Zone/Entry Point/Sensor CRUD
- Pipeline control
- Sensor simulation
- Drill execution

Usage:
    python -m ng_edge.server
    # or
    uvicorn ng_edge.api.manager:app --host 0.0.0.0 --port 8080 --reload
"""

import uvicorn
import argparse


def main():
    parser = argparse.ArgumentParser(description="NG Edge Manager Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    
    args = parser.parse_args()
    
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║           NG Edge Manager v7.4.2                          ║
║                                                           ║
║   Web UI:  http://{args.host}:{args.port}/                           ║
║   API:     http://{args.host}:{args.port}/docs                       ║
║                                                           ║
║   Features:                                               ║
║   - Zone/Entry Point/Sensor Management                    ║
║   - Simulated Sensor Triggering                           ║
║   - Pipeline Control (Mode, Disarm, Reset)                ║
║   - Drill Execution (NG-Drills-EDGE-v7.4.2.json)          ║
╚═══════════════════════════════════════════════════════════╝
""")
    
    uvicorn.run(
        "ng_edge.api.manager:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
