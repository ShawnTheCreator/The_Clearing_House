import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { GatewayDaemon } from '../gateway/daemon.ts';
import { SwarmOrchestrator } from '../agents/swarm_orchestrator.ts';
import { MerkleTree } from '../contracts/evidence_ledger/merkle.ts';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3888;

export class DashboardServer {
  public server: http.Server;
  public daemon: GatewayDaemon;
  public swarm: SwarmOrchestrator;
  private sseClients: Set<http.ServerResponse> = new Set();

  constructor(daemon?: GatewayDaemon) {
    this.daemon = daemon || new GatewayDaemon();
    this.swarm = new SwarmOrchestrator(this.daemon);

    // Subscribe to daemon events to push to SSE / Web clients
    this.daemon.subscribe((event) => {
      this.broadcastEvent(event);
    });

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  private broadcastEvent(event: unknown): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private handleRequest(req: http.ServerRequest, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. SSE Live Stream Endpoint
    if (pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      this.sseClients.add(res);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // 2. Economy State API
    if (pathname === '/api/state') {
      const tasks = this.daemon.jobBoard.get_all_tasks();
      const receipts = this.daemon.evidenceLedger.get_all_receipts();
      const roots = this.daemon.evidenceLedger.get_all_roots();
      const stats = this.swarm.getStats();
      const subAccounts = Array.from(this.daemon.nearClient.subAccounts.values()).map((acc) => ({
        account_id: acc.account_id,
        role: acc.role,
        public_key: acc.public_key,
        gas_burnt_tgas: acc.total_gas_burnt_tgas,
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          stats,
          roots,
          task_count: tasks.length,
          receipt_count: receipts.length,
          subAccounts,
          latest_receipts: receipts.slice(-10).reverse(),
        })
      );
      return;
    }

    // 3. Trigger Swarm Batch API (for interactive demo video & testing)
    if (pathname === '/api/trigger_batch' && req.method === 'POST') {
      this.swarm.runMarketSuite().then(({ stats }) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, stats }));
      });
      return;
    }

    // 4. Receipt Verification Endpoint
    if (pathname.startsWith('/api/verify/')) {
      const receiptId = pathname.replace('/api/verify/', '');
      const receipt = this.daemon.evidenceLedger.get_receipt(receiptId);
      const proof = this.daemon.evidenceLedger.get_proof(receiptId);

      if (!receipt || !proof) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Receipt not found' }));
        return;
      }

      const valid = MerkleTree.verifyProof(proof);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ receipt, proof, valid }));
      return;
    }

    // 5. Static Files Serving
    const publicDir = path.resolve(process.cwd(), 'dashboard', 'public');
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(publicDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  public listen(port: number = PORT): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`[Dashboard] Terminal Noir streaming at http://localhost:${port}`);
        resolve();
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        client.end();
      }
      this.sseClients.clear();
      this.server.close(() => resolve());
    });
  }
}

// Standalone execution
if (process.argv[1]?.endsWith('server.ts')) {
  const srv = new DashboardServer();
  // Run an initial seed batch so dashboard loads with real data immediately
  srv.swarm.runMarketSuite().then(() => {
    srv.listen(PORT);
  });
}
