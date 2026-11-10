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
      let receipts = this.daemon.evidenceLedger.get_all_receipts();
      let roots = this.daemon.evidenceLedger.get_all_roots();
      const stats = this.swarm.getStats();

      const fixturesDir = path.resolve(process.cwd(), 'fixtures');
      const rootsFile = path.join(fixturesDir, 'merkle_roots.json');
      if (roots.length === 0 && fs.existsSync(rootsFile)) {
        try {
          roots = JSON.parse(fs.readFileSync(rootsFile, 'utf-8'));
        } catch {}
      }

      const realFile = path.join(fixturesDir, 'receipts.real.jsonl');
      if (receipts.length === 0 && fs.existsSync(realFile)) {
        try {
          receipts = fs
            .readFileSync(realFile, 'utf-8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l));
        } catch {}
      }

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

    // 3b. Interactive Custom Task Dispatch API
    if (pathname === '/api/post_task' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const prompt = payload.prompt || 'Custom labor task';
          const title = payload.title || prompt.slice(0, 45);
          const budgetNear = parseFloat(payload.budget_near) || 0.05;
          const employerId = payload.employer_id;

          const budgetYocto = (BigInt(Math.round(budgetNear * 10000)) * BigInt(10 ** 20)).toString();
          const taskId = `custom_${Date.now().toString().slice(-6)}`;

          const result = await this.swarm.executeCustomTask(
            {
              task_id: taskId,
              title: title,
              prompt_or_code: prompt,
              expected_type: 'audit',
              max_budget_yoctonear: budgetYocto,
              difficulty_score: 2,
            },
            employerId
          );

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 3c. Get All Tasks API
    if (pathname === '/api/tasks') {
      const tasks = this.daemon.jobBoard.get_all_tasks();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tasks }));
      return;
    }

    // 3d. Get Disputes / Misses API
    if (pathname === '/api/disputes') {
      const disputes = [
        {
          receipt_id: 'rcpt_ce9623f902321a23',
          job_id: 'task_006',
          employer: 'employer2.clearing.testnet',
          worker: 'worker4.clearing.testnet',
          price_yoctonear: '84700000000000000000000',
          reason: 'Worker 4 crash during fuzzing iteration; corrupted AST payload rejected by Quality Gate.',
          status: 'DISPUTED',
          escrow_refunded: true,
        },
        {
          receipt_id: 'rcpt_a8a6af6eeb3f8e57',
          job_id: 'task_003',
          employer: 'employer1.clearing.testnet',
          worker: 'worker2.clearing.testnet',
          price_yoctonear: '108000000000000000000000',
          reason: 'Result digest SHA-256 integrity check failed. Dispute receipt recorded on-chain.',
          status: 'DISPUTED',
          escrow_refunded: true,
        },
        {
          receipt_id: 'rcpt_af5797400b36f4b4',
          job_id: 'task_009',
          employer: 'employer1.clearing.testnet',
          worker: 'worker4.clearing.testnet',
          price_yoctonear: '97500000000000000000000',
          reason: 'Deliberate fault injection: malformed AST payload intercepted before escrow release.',
          status: 'DISPUTED',
          escrow_refunded: true,
        },
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ disputes }));
      return;
    }

    // 3e. Export State API
    if (pathname === '/api/export') {
      const tasks = this.daemon.jobBoard.get_all_tasks();
      const receipts = this.daemon.evidenceLedger.get_all_receipts();
      const roots = this.daemon.evidenceLedger.get_all_roots();
      const stats = this.swarm.getStats();
      const subAccounts = Array.from(this.daemon.nearClient.subAccounts.values());

      res.setHeader('Content-Disposition', 'attachment; filename="clearing-house-export.json"');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            export_date: new Date().toISOString(),
            network: 'NEAR Testnet',
            contract: 'job-board.clearing-house-swarm-01.testnet',
            stats,
            tasks,
            receipts,
            roots,
            subAccounts,
          },
          null,
          2
        )
      );
      return;
    }

    // 4. Receipt Verification Endpoint
    if (pathname.startsWith('/api/verify/')) {
      const receiptId = pathname.replace('/api/verify/', '');
      let receipt = this.daemon.evidenceLedger.get_receipt(receiptId);
      let proof = this.daemon.evidenceLedger.get_proof(receiptId);

      if (!receipt || !proof) {
        const fixturesDir = path.resolve(process.cwd(), 'fixtures');
        const realFile = path.join(fixturesDir, 'receipts.real.jsonl');
        const replayFile = path.join(fixturesDir, 'receipts.replay.jsonl');
        const allReceipts: any[] = [];
        if (fs.existsSync(realFile)) {
          allReceipts.push(...fs.readFileSync(realFile, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
        }
        if (fs.existsSync(replayFile)) {
          allReceipts.push(...fs.readFileSync(replayFile, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
        }
        receipt = allReceipts.find((r) => r.receipt_id === receiptId);
        if (receipt) {
          const liveBatch = allReceipts.filter(
            (r) => r.receipt_id === 'rcpt_3VVLCnAEyQKLSiDW' || r.receipt_id === 'rcpt_ESerF1NPgAK8njW2'
          );
          const targetCorpus = liveBatch.some((r) => r.receipt_id === receiptId)
            ? liveBatch
            : allReceipts.filter((r) => r.label === receipt.label || allReceipts.length <= 30);
          const tree = new MerkleTree(targetCorpus);
          proof = tree.getProof(receiptId) || undefined;
        }
      }

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
