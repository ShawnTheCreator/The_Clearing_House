import { spawn } from 'node:child_process';

console.log('======================================================================');
console.log('  THE CLEARING HOUSE · THREE-TIER HYBRID ARCHITECTURE STARTUP');
console.log('======================================================================');
console.log('  1. Frontend:           http://localhost:3000 (Devin Workbench UI)');
console.log('  2. C# General Backend: http://localhost:5000 (ASP.NET Core Web API)');
console.log('  3. Python AI Backend:  http://localhost:8000 (AI Swarm Intelligence)');
console.log('======================================================================\n');

// 1. Python AI Backend
console.log('[1/3] Starting Python AI Swarm Backend (port 8000)...');
const py = spawn('python', ['backend_python/main.py'], {
  stdio: 'inherit',
  shell: true,
});

// 2. C# General Backend
console.log('[2/3] Starting C# General Backend (port 5000)...');
const cs = spawn('dotnet', ['run', '--project', 'backend_csharp/TheClearingHouse.Api'], {
  stdio: 'inherit',
  shell: true,
});

// 3. Frontend Static & Proxy Server
console.log('[3/3] Starting Frontend Server (port 3000)...');
const fe = spawn('node', ['frontend/serve.js'], {
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\nGracefully shutting down all services...');
  try { py.kill(); } catch {}
  try { cs.kill(); } catch {}
  try { fe.kill(); } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
