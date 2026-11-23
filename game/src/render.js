// WebGL1 low-poly renderer for Caldera Bay. Static city geometry is merged
// into one buffer (buildings get lit window quads); cars and people are built
// each frame from box and cylinder parts into a dynamic buffer.
function matPerspective(fov, asp, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function matLookAt(ex, ey, ez, tx, ty, tz) {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  let xx = 1 * zz - 0 * zy, xy = 0 * zx - 0 * zz, xz = 0 * zy - 1 * zx;
  const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1];
}
function matMul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
class Geo {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  quad(p1, p2, p3, p4, n, c) {
    const P = this.pos, N = this.nor, C = this.col;
    for (const p of [p1, p2, p3, p1, p3, p4]) P.push(p[0], p[1], p[2]);
    for (let i = 0; i < 6; i++) { N.push(n[0], n[1], n[2]); C.push(c[0], c[1], c[2]); }
  }
  box(cx, cy, cz, sx, sy, sz, c, ry = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, cs = Math.cos(ry), sn = Math.sin(ry);
    const R = (x, z) => [cx + x * cs + z * sn, cz - x * sn + z * cs];
    const corners = [];
    for (const [x, y, z] of [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]) {
      const [wx, wz] = R(x, z); corners.push([wx, cy + y, wz]);
    }
    const faces = [[0, 1, 2, 3, [0, -1, 0]], [4, 7, 6, 5, [0, 1, 0]], [0, 4, 5, 1, [0, 0, -1]], [2, 6, 7, 3, [0, 0, 1]], [1, 5, 6, 2, [1, 0, 0]], [3, 7, 4, 0, [-1, 0, 0]]];
    for (const [a, b, cc, d, n] of faces) {
      const wn = [n[0] * cs + n[2] * sn, n[1], -n[0] * sn + n[2] * cs];
      this.quad(corners[a], corners[b], corners[cc], corners[d], wn, c);
    }
  }
  cylinder(cx, cy, cz, r, h, c, axisX = false) {
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      const a1 = (i / seg) * Math.PI * 2, a2 = ((i + 1) / seg) * Math.PI * 2;
      let lo1, lo2, hi1, hi2;
      if (axisX) {
        lo1 = [cx - h / 2, cy + Math.cos(a1) * r, cz + Math.sin(a1) * r];
        lo2 = [cx - h / 2, cy + Math.cos(a2) * r, cz + Math.sin(a2) * r];
        hi1 = [cx + h / 2, cy + Math.cos(a1) * r, cz + Math.sin(a1) * r];
        hi2 = [cx + h / 2, cy + Math.cos(a2) * r, cz + Math.sin(a2) * r];
      } else {
        lo1 = [cx + Math.cos(a1) * r, cy - h / 2, cz + Math.sin(a1) * r];
        lo2 = [cx + Math.cos(a2) * r, cy - h / 2, cz + Math.sin(a2) * r];
        hi1 = [cx + Math.cos(a1) * r, cy + h / 2, cz + Math.sin(a1) * r];
        hi2 = [cx + Math.cos(a2) * r, cy + h / 2, cz + Math.sin(a2) * r];
      }
      const n = axisX ? [0, Math.cos((a1 + a2) / 2), Math.sin((a1 + a2) / 2)] : [Math.cos((a1 + a2) / 2), 0, Math.sin((a1 + a2) / 2)];
      this.quad(lo1, lo2, hi2, hi1, n, c);
    }
  }
}
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) return { draw() {}, ok: false };
  const vs = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
    uniform mat4 uMvp; varying vec3 vCol; varying float vLight;
    void main(){ gl_Position = uMvp * vec4(aPos,1.0);
      vec3 n = normalize(aNor); vLight = 0.45 + 0.55 * abs(dot(n, normalize(vec3(0.4,0.8,0.3))));
      vCol = aCol; }`;
  const fs = `precision mediump float; varying vec3 vCol; varying float vLight;
    void main(){ gl_FragColor = vec4(vCol * vLight, 1.0); }`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog); gl.useProgram(prog);
  const loc = { pos: gl.getAttribLocation(prog, 'aPos'), nor: gl.getAttribLocation(prog, 'aNor'), col: gl.getAttribLocation(prog, 'aCol'), mvp: gl.getUniformLocation(prog, 'uMvp') };
  function upload(geo, dynamic) {
    const verts = geo.pos.length / 3;
    const arr = new Float32Array(verts * 9);
    for (let i = 0; i < verts; i++) {
      arr.set(geo.pos.slice(i * 3, i * 3 + 3), i * 9);
      arr.set(geo.nor.slice(i * 3, i * 3 + 3), i * 9 + 3);
      arr.set(geo.col.slice(i * 3, i * 3 + 3), i * 9 + 6);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return { buf, count: verts };
  }
  function bind(b) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
    gl.enableVertexAttribArray(loc.pos); gl.enableVertexAttribArray(loc.nor); gl.enableVertexAttribArray(loc.col);
    gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(loc.nor, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(loc.col, 3, gl.FLOAT, false, 36, 24);
  }
  let staticBuf = null;
  function buildStatic(city) {
    const g = new Geo();
    g.box(0, -0.6, 0, 380, 1, 300, [0.16, 0.30, 0.20]);
    g.box(0, -1.6, 0, 470, 1, 390, [0.05, 0.16, 0.28]);
    for (const gx of [-150, -90, -30, 30, 90, 150]) g.box(gx, 0.02, 0, 13, 0.1, 236, [0.10, 0.10, 0.12]);
    for (const gz of [-110, -55, 0, 55, 110]) g.box(0, 0.02, gz, 316, 0.1, 13, [0.10, 0.10, 0.12]);
    for (const b of city.buildings) {
      g.box(b.x, b.h / 2, b.z, b.w, b.h, b.d, b.color);
      const rows = Math.min(6, Math.floor(b.h / 6)), cols = Math.min(5, Math.floor(b.w / 4));
      for (let r = 0; r < rows; r++) for (let cix = 0; cix < cols; cix++) {
        if ((r * 7 + cix * 13 + Math.floor(b.x)) % 3 === 0) continue;
        const wx = cols > 1 ? b.x - b.w / 2 + 2 + cix * ((b.w - 4) / (cols - 1)) : b.x;
        g.box(wx, 3 + r * 5.4, b.z + b.d / 2 + 0.06, 1.4, 2.0, 0.1, [0.95, 0.8, 0.4]);
      }
    }
    for (const p of city.palms) {
      g.cylinder(p.x, p.h / 2, p.z, 0.35, p.h, [0.4, 0.3, 0.18]);
      g.box(p.x, p.h + 0.4, p.z, 5.5, 0.35, 1.2, [0.15, 0.55, 0.25]);
      g.box(p.x, p.h + 0.4, p.z, 1.2, 0.35, 5.5, [0.15, 0.55, 0.25]);
    }
    const poiColors = { cafe: [0.95, 0.6, 0.2], spray: [0.2, 0.8, 0.9], hospital: [0.95, 0.95, 0.95], police: [0.2, 0.3, 0.95], docks: [0.7, 0.5, 0.2], overlook: [0.9, 0.3, 0.6] };
    for (const key of Object.keys(city.pois)) {
      const p = city.pois[key];
      g.cylinder(p.x, 3, p.z, 0.5, 6, poiColors[key] || [1, 1, 1]);
      g.box(p.x, 6.4, p.z, 2.4, 1.2, 2.4, poiColors[key] || [1, 1, 1]);
    }
    return upload(g, false);
  }
  function drawCar(g, car, t) {
    const { x, z, angle } = car;
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const at = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    const body = car.kind === 'police' ? [0.92, 0.92, 0.95] : car.color;
    let [bx, bz] = at(0, 0);
    g.box(bx, 0.75, bz, 2.0, 0.8, 4.2, body, angle);
    [bx, bz] = at(0, -0.2);
    g.box(bx, 1.45, bz, 1.7, 0.65, 2.0, car.kind === 'taxi' ? [0.95, 0.75, 0.15] : [0.12, 0.14, 0.2], angle);
    if (car.kind === 'taxi') { const [tx2, tz2] = at(0, -0.2); g.box(tx2, 1.9, tz2, 0.8, 0.25, 0.5, [0.95, 0.85, 0.2], angle); }
    if (car.kind === 'police') {
      const [lx2, lz2] = at(0, -0.2);
      g.box(lx2, 1.9, lz2, 1.2, 0.22, 0.5, (t % 30 < 15) ? [0.9, 0.1, 0.1] : [0.1, 0.2, 0.95], angle);
    }
    for (const [lx, lz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const [wx, wz] = at(lx, lz);
      // Wheel cylinders: axis across the car.
      const seg = 6;
      for (let i = 0; i < seg; i++) {
        const a1 = (i / seg) * Math.PI * 2, a2 = ((i + 1) / seg) * Math.PI * 2;
        const p = (s, a) => { const lx2 = lx + s * 0.16, lz2 = lz; const wy = 0.45 + Math.sin(a) * 0.45; const off = Math.cos(a) * 0.45; const [qx, qz] = at(lx2, lz2 + off); return [qx, wy, qz]; };
        g.quad(p(-1, a1), p(-1, a2), p(1, a2), p(1, a1), [0, 0, 1], [0.05, 0.05, 0.05]);
      }
    }
  }
  function drawPerson(g, x, z, angle, shirt, down = false) {
    if (down) { g.box(x, 0.25, z, 0.7, 0.4, 1.8, shirt, angle); return; }
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const at = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    g.box(x, 1.15, z, 0.62, 0.85, 0.34, shirt, angle);
    g.box(x, 1.85, z, 0.42, 0.45, 0.42, [0.85, 0.65, 0.5], angle);
    for (const s of [-1, 1]) {
      const [lx2, lz2] = at(s * 0.18, 0);
      g.cylinder(lx2, 0.4, lz2, 0.11, 0.8, [0.16, 0.16, 0.3]);
      const [ax, az] = at(s * 0.42, 0);
      g.cylinder(ax, 1.15, az, 0.09, 0.75, shirt);
    }
  }
  function draw(game) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.55, 0.75, 0.9, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!staticBuf) staticBuf = buildStatic(game.city);
    const p = game.player;
    let eye, target;
    if (game.camera) {
      const c = game.camera;
      eye = [c.x + Math.sin(c.angle) * c.dist, c.height, c.z + Math.cos(c.angle) * c.dist];
      target = [c.x, 2, c.z];
    } else {
      const back = p.inCar != null ? 15 : 10.5;
      const a = game.camAngle || 0;
      eye = [p.x - Math.sin(a) * back, p.inCar != null ? 6.5 : 5.2, p.z - Math.cos(a) * back];
      target = [p.x + Math.sin(a) * 6, 1.6, p.z + Math.cos(a) * 6];
    }
    const mvp = matMul(matPerspective(1.05, w / Math.max(1, h), 0.1, 700), matLookAt(eye[0], eye[1], eye[2], target[0], target[1], target[2]));
    gl.uniformMatrix4fv(loc.mvp, false, mvp);
    bind(staticBuf);
    gl.drawArrays(gl.TRIANGLES, 0, staticBuf.count);
    const g = new Geo();
    for (const c of game.crates) if (!c.taken) g.box(c.x, 0.6, c.z, 1.1, 1.1, 1.1, [0.85, 0.6, 0.15]);
    for (const car of game.cars) drawCar(g, car, game.tick);
    for (const ped of game.peds) drawPerson(g, ped.x, ped.z, ped.angle, [0.3 + ped.hue * 0.5, 0.4, 0.75 - ped.hue * 0.4], ped.down);
    for (const cop of game.cops) drawPerson(g, cop.x, cop.z, cop.angle, [0.1, 0.15, 0.5], cop.down);
    if (p.inCar == null) drawPerson(g, p.x, p.z, p.angle, [0.85, 0.25, 0.15]);
    const dyn = upload(g, true);
    bind(dyn);
    gl.drawArrays(gl.TRIANGLES, 0, dyn.count);
    gl.deleteBuffer(dyn.buf);
  }
  return { draw, ok: true };
}
