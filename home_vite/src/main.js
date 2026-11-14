// The Clearing House — Vite Home Page Client Scripts
import './home.css';

// 1. Resolve Next.js Dashboard URL
const DASHBOARD_URL =
  import.meta.env.VITE_DASHBOARD_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://dashboard-ths.vercel.app/'
    : 'http://localhost:3000');

document.addEventListener('DOMContentLoaded', () => {
  // Update all workbench links dynamically
  const workbenchLinks = document.querySelectorAll(
    '.btn-nav-workbench, .btn-hero-primary, .card-link[href*="workbench"], a[href="/workbench"], a[href="http://localhost:3000"], a[href*=":3000"]'
  );
  workbenchLinks.forEach((link) => {
    link.href = DASHBOARD_URL;
  });
});

// 2. Draw and animate floating 4-pointed sparkle stars on canvas
(function initStarField() {
  const canvas = document.getElementById('starCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = canvas.parentElement.offsetWidth);
  let height = (canvas.height = canvas.parentElement.offsetHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = canvas.parentElement.offsetWidth;
    height = canvas.height = canvas.parentElement.offsetHeight;
  });

  const stars = [];
  const starCount = 38;

  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 24 + 10,
      alpha: Math.random() * 0.7 + 0.3,
      speedX: (Math.random() - 0.5) * 0.15,
      speedY: (Math.random() - 0.5) * 0.15,
      pulseSpeed: Math.random() * 0.02 + 0.01,
      pulsePhase: Math.random() * Math.PI * 2,
    });
  }

  function drawFourPointStar(cx, cy, spikes, outerRadius, innerRadius, alpha) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.3, `rgba(105, 242, 190, ${alpha * 0.95})`);
    grad.addColorStop(1, `rgba(66, 216, 159, 0)`);
    ctx.fillStyle = grad;
    ctx.shadowColor = '#69f2be';
    ctx.shadowBlur = outerRadius * 0.8;
    ctx.fill();
    ctx.restore();
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (const star of stars) {
      star.x += star.speedX;
      star.y += star.speedY;

      if (star.x < -star.size) star.x = width + star.size;
      if (star.x > width + star.size) star.x = -star.size;
      if (star.y < -star.size) star.y = height + star.size;
      if (star.y > height + star.size) star.y = -star.size;

      star.pulsePhase += star.pulseSpeed;
      const currentAlpha = star.alpha + Math.sin(star.pulsePhase) * 0.25;
      const safeAlpha = Math.max(0.15, Math.min(0.95, currentAlpha));

      drawFourPointStar(star.x, star.y, 4, star.size, star.size * 0.16, safeAlpha);
    }

    requestAnimationFrame(animate);
  }

  animate();
})();

// 3. Newsletter form interaction
const subscribeBtn = document.getElementById('subscribe-btn');
const subscribeInput = document.getElementById('subscribe-input');
const subscribeMsg = document.getElementById('subscribe-msg');

if (subscribeBtn && subscribeInput) {
  subscribeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const val = subscribeInput.value.trim();
    if (!val) {
      subscribeInput.placeholder = 'Please enter an email or NEAR account';
      return;
    }
    subscribeBtn.disabled = true;
    subscribeBtn.textContent = 'Subscribed ✓';
    subscribeBtn.style.backgroundColor = '#69f2be';
    subscribeBtn.style.color = '#000000';
    if (subscribeMsg) {
      subscribeMsg.style.display = 'block';
      subscribeMsg.textContent = `Subscribed ${val} to live telemetry & Merkle root feeds.`;
    }
  });
}
