import http.server
import json
import os
import sys
import time

from agents.employer import EmployerAgent
from agents.worker import WorkerAgent

PORT = int(os.environ.get("PORT", 8000))

# Initialize AI Swarm Fleet
employer = EmployerAgent("employer1.clearing-house-swarm-01.testnet")
workers = [
    WorkerAgent("worker1.clearing-house-swarm-01.testnet", specialty="audit", discount_rate=0.22),
    WorkerAgent("worker2.clearing-house-swarm-01.testnet", specialty="verification", discount_rate=0.26),
    WorkerAgent("worker4.clearing.testnet", specialty="fuzzing", discount_rate=0.10),
]

class AISwarmHandler(http.server.BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            self._set_headers(200)
            res = {
                "status": "ok",
                "service": "The Clearing House · Python AI Swarm Backend",
                "version": "0.1.0",
                "employer": employer.account_id,
                "workers": [w.account_id for w in workers],
                "capabilities": ["mission_decomposition", "sealed_bidding", "work_execution", "quality_gate_inspection"]
            }
            self.wfile.write(json.dumps(res, indent=2).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            data = json.loads(body)
        except Exception:
            data = {}

        if self.path == "/ai/decompose_mission":
            mission = data.get("mission", "Audit contract")
            budget = float(data.get("budget_near", 0.05))
            subtasks = employer.decompose_mission(mission, budget)
            self._set_headers(200)
            self.wfile.write(json.dumps({"subtasks": subtasks}).encode("utf-8"))

        elif self.path == "/ai/bid":
            task = data.get("task", {})
            bids = [w.evaluate_and_bid(task) for w in workers]
            self._set_headers(200)
            self.wfile.write(json.dumps({"bids": bids}).encode("utf-8"))

        elif self.path == "/ai/execute":
            task = data.get("task", {})
            worker_id = data.get("worker_id", workers[0].account_id)
            inject_fault = data.get("inject_fault", False) or worker_id == "worker4.clearing.testnet"

            worker = next((w for w in workers if w.account_id == worker_id), workers[0])
            deliverable = worker.execute_work(task, inject_fault=inject_fault)
            self._set_headers(200)
            self.wfile.write(json.dumps({"deliverable": deliverable}).encode("utf-8"))

        elif self.path == "/ai/inspect":
            task_spec = data.get("task_spec", "")
            deliverable = data.get("deliverable", {})
            inspection = employer.inspect_deliverable(task_spec, deliverable)
            self._set_headers(200)
            self.wfile.write(json.dumps({"inspection": inspection}).encode("utf-8"))

        elif self.path == "/ai/run_auction":
            # Complete End-to-End Multi-Agent Swarm Auction Cycle:
            # 1. Mission Decomposition
            # 2. Competitive Sealed Bidding
            # 3. Lowest-Bid-Wins Award
            # 4. Work Execution & SHA-256 Digest
            # 5. Employer Quality Gate Inspection
            mission = data.get("mission", "Audit contract state mutations")
            budget = float(data.get("budget_near", 0.05))

            subtasks = employer.decompose_mission(mission, budget)
            cleared_subtasks = []

            for subtask in subtasks:
                # Workers bid
                bids = [w.evaluate_and_bid(subtask) for w in workers]
                # Filter valid and select lowest bid
                valid_bids = sorted(bids, key=lambda b: b["bid_price_near"])
                winner_bid = valid_bids[0]

                winning_worker = next(w for w in workers if w.account_id == winner_bid["worker_id"])
                # Execute work
                deliverable = winning_worker.execute_work(subtask, inject_fault=False)
                # Quality gate inspection
                inspection = employer.inspect_deliverable(subtask.get("task_spec", ""), deliverable)

                cleared_subtasks.append({
                    "subtask": subtask,
                    "bids": bids,
                    "winner": winner_bid,
                    "deliverable": deliverable,
                    "inspection": inspection
                })

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "mission": mission,
                "total_budget_near": budget,
                "cleared_subtasks": cleared_subtasks,
                "timestamp": int(time.time() * 1000)
            }, indent=2).encode("utf-8"))

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Unknown AI endpoint"}).encode("utf-8"))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run():
    server_address = ("", PORT)
    httpd = http.server.HTTPServer(server_address, AISwarmHandler)
    print(f"[AI] Python AI Swarm Backend listening on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Python AI Backend...")
        httpd.server_close()

if __name__ == "__main__":
    run()
