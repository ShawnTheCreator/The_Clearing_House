import test from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { DashboardServer } from '../dashboard/server.ts';

function createMockReqRes(url: string, method: string = 'GET') {
  const req = Object.assign(new EventEmitter(), {
    url,
    method,
    headers: { host: 'localhost:3888' },
  });

  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
    },
    writeHead(code: number, headers?: Record<string, string>) {
      this.statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          this.setHeader(k, v);
        }
      }
    },
    write(chunk: any) {
      this.body += chunk.toString();
    },
    end(chunk?: any) {
      if (chunk) this.body += chunk.toString();
      this.emit('finish');
    },
  });

  return { req, res };
}

test('DashboardServer: handles /api/state and static HTML in-process', () => {
  const server = new DashboardServer();

  // Test /api/state
  const { req: stateReq, res: stateRes } = createMockReqRes('/api/state');
  (server as any).handleRequest(stateReq, stateRes);

  assert.strictEqual(stateRes.statusCode, 200);
  const stateData = JSON.parse(stateRes.body);
  assert.ok(stateData.stats !== undefined);
  assert.ok(stateData.subAccounts.length >= 8);

  // Test / (index.html)
  const { req: htmlReq, res: htmlRes } = createMockReqRes('/');
  (server as any).handleRequest(htmlReq, htmlRes);

  assert.strictEqual(htmlRes.statusCode, 200);
  assert.ok(htmlRes.body.includes('THE CLEARING HOUSE'));
  assert.ok(htmlRes.body.includes('DAILY MERKLE EVIDENCE ROOT'));
});
