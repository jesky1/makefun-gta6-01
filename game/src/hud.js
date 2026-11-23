// 2D canvas HUD: cash, health, wanted stars, ammo, mission text, bust meter,
// a minimap of Caldera Bay, and the title / pause / busted / wasted screens.
import { GRID_X, GRID_Z } from './city.js';

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  function draw(game, screen) {
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const p = game.player;
    if (screen === 'title') {
      ctx.fillStyle = 'rgba(8,10,24,0.72)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText('CALDERA HEAT', w / 2, h / 2 - 60);
      ctx.fillStyle = '#e8ecf4';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('An open-world caper in Caldera Bay', w / 2, h / 2 - 20);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('Press ENTER or click to play', w / 2, h / 2 + 24);
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = '#aeb8cc';
      ctx.fillText('WASD move / drive · SHIFT sprint · E enter car, talk, spray · Mouse aim · Click / F fire · R reload', w / 2, h / 2 + 58);
      ctx.fillText('P pause · F6 save · F9 load · M mute', w / 2, h / 2 + 82);
      return;
    }
    // Top-left: vitals.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(5,8,16,0.55)';
    ctx.fillRect(12, 12, 252, 96);
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('$' + p.cash, 22, 40);
    ctx.fillStyle = '#20242e';
    ctx.fillRect(22, 50, 180, 12);
    ctx.fillStyle = p.hp > 30 ? '#e84c3d' : '#ff2222';
    ctx.fillRect(22, 50, Math.max(0, p.hp) * 1.8, 12);
    ctx.fillStyle = '#e8ecf4';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(p.inCar != null ? 'DRIVING' : 'ON FOOT', 22, 82);
    ctx.fillText('Ammo ' + p.ammo + ' / ' + p.reserve + (game.reloadTicks > 0 ? '  (reloading)' : ''), 110, 82);
    // Wanted stars top-right.
    const stars = game.getStars();
    ctx.textAlign = 'right';
    ctx.font = '26px system-ui, sans-serif';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < stars ? '#ffd23e' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', w - 22 - (4 - i) * 28, 42);
    }
    if (p.bust > 0.02 && stars > 0) {
      ctx.fillStyle = '#20242e';
      ctx.fillRect(w - 172, 54, 150, 10);
      ctx.fillStyle = '#ff9f1a';
      ctx.fillRect(w - 172, 54, Math.min(1, p.bust) * 150, 10);
    }
    // Mission panel bottom-left.
    const m = game.mission();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(5,8,16,0.55)';
    ctx.fillRect(12, h - 118, 430, 106);
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 16px system-ui, sans-serif';
    if (game.storyDone) {
      ctx.fillText('Story complete — Caldera Bay is yours.', 22, h - 90);
      ctx.fillStyle = '#e8ecf4';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('Free roam: crates, taxis and trouble still pay.', 22, h - 66);
    } else if (m && game.missionActive) {
      ctx.fillText(m.title + ' — ' + m.giver, 22, h - 90);
      ctx.fillStyle = '#e8ecf4';
      ctx.font = '14px system-ui, sans-serif';
      wrap(m.text + (m.byCar ? ' (must arrive driving)' : ''), 22, h - 66, 410, 18);
    } else if (m) {
      ctx.fillText('Go to Cafe Ceniza and press E to meet Lu Vane.', 22, h - 90);
      ctx.fillStyle = '#e8ecf4';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('A gold marker on the minimap shows the way.', 22, h - 66);
    }
    if (game.missionText) {
      ctx.fillStyle = '#7dff8a';
      ctx.font = 'italic 13px system-ui, sans-serif';
      wrap(game.missionText, 22, h - 26, 410, 16);
    }
    drawMinimap(game, w, h);
    if (screen === 'paused') overlay(w, h, 'PAUSED', 'Press P to resume');
    if (game.noticeTicks > 0 && game.notice) overlay(w, h, game.notice, game.notice === 'BUSTED' ? 'The precinct takes its cut.' : 'St. Ash patches you up — for a price.');
  }
  function wrap(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const word of words) {
      if (ctx.measureText(line + word).width > maxW && line) { ctx.fillText(line, x, yy); yy += lh; line = ''; }
      line += word + ' ';
    }
    if (line) ctx.fillText(line, x, yy);
  }
  function overlay(w, h, big, small) {
    ctx.fillStyle = 'rgba(8,10,24,0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(big, w / 2, h / 2);
    ctx.fillStyle = '#e8ecf4';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(small, w / 2, h / 2 + 34);
  }
  function drawMinimap(game, w, h) {
    const S = 168, x0 = w - S - 14, y0 = h - S - 14;
    const px = (x) => x0 + ((x + 190) / 380) * S;
    const pz = (z) => y0 + ((z + 150) / 300) * S;
    ctx.fillStyle = 'rgba(10,16,26,0.78)';
    ctx.fillRect(x0, y0, S, S);
    ctx.strokeStyle = '#3a4356';
    for (const gx of GRID_X) { ctx.beginPath(); ctx.moveTo(px(gx), y0); ctx.lineTo(px(gx), y0 + S); ctx.stroke(); }
    for (const gz of GRID_Z) { ctx.beginPath(); ctx.moveTo(x0, pz(gz)); ctx.lineTo(x0 + S, pz(gz)); ctx.stroke(); }
    ctx.fillStyle = '#ffd23e';
    for (const c of game.crates) if (!c.taken) ctx.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3);
    ctx.fillStyle = '#3ea6ff';
    for (const car of game.cars) if (car.kind === 'police') ctx.fillRect(px(car.x) - 2, pz(car.z) - 2, 4, 4);
    const t = game.missionTarget();
    if (t && game.missionActive) {
      ctx.fillStyle = '#ff9f1a';
      ctx.beginPath(); ctx.arc(px(t.x), pz(t.z), 5, 0, Math.PI * 2); ctx.fill();
    }
    const p = game.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px(p.x), pz(p.z), 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(px(p.x), pz(p.z));
    ctx.lineTo(px(p.x) + Math.sin(p.angle) * 9, pz(p.z) + Math.cos(p.angle) * 9);
    ctx.stroke();
  }
  return { draw };
}
