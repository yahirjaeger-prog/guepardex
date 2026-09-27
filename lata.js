// Lata 3D de Guepardex: flotación sutil + giro sobre su eje al pasar el cursor.
// WebGL2 puro, sin dependencias. La etiqueta llega desde etiqueta.js.
(() => {
  'use strict';

  const LABEL_SRC = window.GUEPARDEX_ETIQUETA;
  if (!LABEL_SRC) return;

  // ---- Lata 473 ml (mm) -------------------------------------------------------
  const R = 33;                 // radio del cuerpo (Ø 66 mm)
  const CAN_H = 160;            // alto total
  const WALL = [12, 141];       // tramo recto del cuerpo, donde va la etiqueta
  const LABEL_CENTER = 80.5;    // la etiqueta queda centrada en el alto de la lata
  const SEGMENTS = 256;         // divisiones alrededor del eje
  const CAN_COLOR = [255, 217, 0]; // amarillo de fondo de la etiqueta, para el cuerpo fuera de ella

  // ---- Movimiento -----------------------------------------------------------
  const FLOAT_AMP = 0.026 * CAN_H;   // amplitud de flotación
  const SPIN_SPEED = -0.85;          // rad/s al hacer hover (el diseño avanza de derecha a izquierda)
  const SPIN_IN = 0.55, SPIN_OUT = 0.85; // constantes de tiempo de la transición (s)
  const DEG = Math.PI / 180;

  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false });
  if (!gl) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Matrices (column-major) ---------------------------------------------
  const M4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    perspective(fovy, aspect, n, f) {
      const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = t / aspect; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
      return o;
    },
    lookAt(e, c, up) {
      let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]];
      const zl = Math.hypot(...z); z = z.map(v => v / zl);
      let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
      const xl = Math.hypot(...x); x = x.map(v => v / xl);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const d = (a) => a[0] * e[0] + a[1] * e[1] + a[2] * e[2];
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d(x), -d(y), -d(z), 1]);
    },
    translate(x, y, z) { const o = M4.identity(); o[12] = x; o[13] = y; o[14] = z; return o; },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    identity() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  };

  // ---- Perfil de revolución (r, y, pintado) desde el centro del fondo hasta el centro de la tapa.
  // "pintado" = 1 en el cuerpo (amarillo), 0 en el aluminio visto (borde superior, tapa y apoyo).
  function canProfile() {
    const pts = [[0, 8, 0]];
    let paint = 0;
    const bez = (p0, p1, p2, p3, n) => {
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], paint]);
      }
    };
    const line = (p0, p1, n) => {
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, paint]);
      }
    };
    bez([0, 8], [10, 8], [19, 5], [21.6, 1.8], 10);                  // domo inferior
    bez([21.6, 1.8], [22.2, 0.3], [24, -0.1], [25, 0.4], 6);          // anillo de apoyo
    paint = 1;
    bez([25, 0.4], [28, 2], [32.8, 5.5], [R, WALL[0]], 12);           // curva inferior del cuerpo
    line([R, WALL[0]], [R, WALL[1]], 12);                             // cuerpo recto
    bez([R, WALL[1]], [R, 146], [27.4, 149.5], [27.4, 154.5], 16);    // cuello
    paint = 0;
    bez([27.4, 154.5], [27.9, 155], [28.05, 156], [28.05, 157.6], 4); // pestaña del cierre
    bez([28.05, 157.6], [28.05, 159.4], [26.5, 160.3], [26.4, 158.6], 6);
    line([26.4, 158.6], [26.0, 155.2], 3);                            // pared interior del borde
    bez([26.0, 155.2], [25.9, 154.2], [25.1, 154.0], [24.6, 154.9], 4);
    bez([24.6, 154.9], [24.3, 155.3], [22, 155.4], [20, 155.4], 3);   // tapa
    line([20, 155.4], [0, 155.6], 6);
    return pts;
  }

  function buildCan() {
    const prof = canProfile(), P = prof.length;
    const nrm = prof.map((p, i) => {
      const a = prof[Math.max(0, i - 1)], b = prof[Math.min(P - 1, i + 1)];
      const tr = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tr, ty) || 1;
      return [ty / l, -tr / l];
    });
    const cols = SEGMENTS + 1;
    const data = new Float32Array(P * cols * 8);
    let k = 0;
    for (let i = 0; i < P; i++) {
      const [r, y, paint] = prof[i], [nr, ny] = nrm[i];
      for (let j = 0; j < cols; j++) {
        // u = 0 en el lateral izquierdo; el centro del panel frontal (u = 0.25) mira a cámara.
        const u = j / SEGMENTS, th = -Math.PI / 2 + u * Math.PI * 2;
        const s = Math.sin(th), c = Math.cos(th);
        data[k++] = r * s; data[k++] = y; data[k++] = r * c;
        data[k++] = nr * s; data[k++] = ny; data[k++] = nr * c;
        data[k++] = u; data[k++] = paint;
      }
    }
    const idx = new Uint32Array((P - 1) * SEGMENTS * 6);
    k = 0;
    for (let i = 0; i < P - 1; i++) for (let j = 0; j < SEGMENTS; j++) {
      const a = i * cols + j, b = a + cols;
      idx[k++] = a; idx[k++] = b; idx[k++] = a + 1;
      idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1;
    }
    return { data, idx };
  }

  // ---- Shaders ----------------------------------------------------------------
  const CAN_VS = `#version 300 es
    in vec3 aPos; in vec3 aNor; in float aU; in float aPaint;
    uniform mat4 uModel, uViewProj;
    out vec3 vPos; out vec3 vNor; out float vU; out float vY; out float vPaint;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vPos = w.xyz; vNor = mat3(uModel) * aNor; vU = aU; vY = aPos.y; vPaint = aPaint;
      gl_Position = uViewProj * w;
    }`;

  const CAN_FS = `#version 300 es
    precision highp float;
    in vec3 vPos; in vec3 vNor; in float vU; in float vY; in float vPaint;
    uniform sampler2D uLabel;
    uniform vec3 uEye, uCanColor;
    uniform float uLabelTop, uLabelH;
    out vec4 outColor;
    const float PI = 3.14159265;

    vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
    vec3 toSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float lobe(float a, float center, float w) {
      float d = abs(mod(a - center + PI, 2.0 * PI) - PI);
      return 1.0 - smoothstep(0.0, w, d);
    }
    // Dos paneles de luz verticales, suaves y neutros (estudio de producto)
    float softboxes(vec3 r) {
      float az = atan(r.x, r.z);
      float v = smoothstep(-0.55, -0.1, r.y) * (1.0 - smoothstep(0.55, 0.95, r.y));
      return (lobe(az, -1.75, 0.6) + 0.45 * lobe(az, 2.3, 0.5)) * v;
    }
    // Entorno neutro: luz cenital, suelo blanco y un horizonte gris que da lectura de metal
    float studio(vec3 r) {
      float b = 0.34 + 0.62 * smoothstep(0.05, 0.85, r.y) + 0.42 * smoothstep(0.05, 0.75, -r.y);
      return b * (1.0 - 0.3 * exp(-r.y * r.y / 0.006));
    }

    void main() {
      vec3 N = normalize(vNor);
      vec3 V = normalize(uEye - vPos);
      vec3 Rf = reflect(-V, N);
      float NdV = max(dot(N, V), 0.0);

      // Luz principal suave arriba-izquierda + relleno tenue abajo-derecha.
      // Calibrada para que el frente de la etiqueta quede a intensidad 1.0 (colores originales).
      float key  = max(dot(N, normalize(vec3(-0.5, 0.55, 0.65))), 0.0);
      float fill = max(dot(N, normalize(vec3(0.8, -0.2, 0.45))), 0.0);
      float dif = 0.516 * mix(0.85, 1.0, 0.5 + 0.5 * N.y) + 0.638 * key + 0.215 * fill;
      dif *= mix(0.86, 1.0, smoothstep(0.0, 0.45, NdV)); // caída suave hacia los bordes = volumen

      // Etiqueta: envuelta sobre el cilindro, sin escalado: alto = circunferencia / proporción
      float t = (uLabelTop - vY) / uLabelH;
      float aa = max(fwidth(t), 1e-6);
      float inside = clamp(t / aa + 0.5, 0.0, 1.0) * clamp((1.0 - t) / aa + 0.5, 0.0, 1.0);
      vec3 label = toLinear(texture(uLabel, vec2(vU, clamp(t, 0.0, 1.0))).rgb);

      // Cuerpo impreso: etiqueta sobre el amarillo de la lata, con la misma luz y barniz
      vec3 base = mix(toLinear(uCanColor), label, inside);
      float fres = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
      vec3 printed = base * dif + vec3(softboxes(Rf) * fres * 0.6);

      // Aluminio visto: borde superior, tapa y anillo de apoyo
      float env = studio(Rf) + 1.6 * softboxes(Rf);
      vec3 alu = vec3(0.90, 0.91, 0.93) * (0.88 * env + 0.08 * dif);

      outColor = vec4(toSRGB(mix(alu, printed, vPaint)), 1.0);
    }`;

  const SHADOW_VS = `#version 300 es
    in vec2 aP;
    uniform mat4 uViewProj; uniform vec3 uCenter; uniform vec2 uSize;
    out vec2 vP;
    void main() {
      vP = aP;
      gl_Position = uViewProj * vec4(uCenter + vec3(aP.x * uSize.x, 0.0, aP.y * uSize.y), 1.0);
    }`;

  const SHADOW_FS = `#version 300 es
    precision mediump float;
    in vec2 vP; uniform float uAlpha; out vec4 outColor;
    void main() {
      float d2 = dot(vP, vP);
      outColor = vec4(0.0, 0.0, 0.0, uAlpha * (0.6 * exp(-d2 * 9.0) + 0.4 * exp(-d2 * 3.6)));
    }`;

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--;) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  // ---- Estado de la escena --------------------------------------------------
  let image, scene = null;
  let labelTop = 0, labelH = 0;
  let viewProj, eye, cssW = 1, cssH = 1;
  let hitRect = null;

  function init() {
    const canProg = program(CAN_VS, CAN_FS);
    const shadowProg = program(SHADOW_VS, SHADOW_FS);

    const { data, idx } = buildCan();
    const canVao = gl.createVertexArray();
    gl.bindVertexArray(canVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const attrs = [['aPos', 3, 0], ['aNor', 3, 12], ['aU', 1, 24], ['aPaint', 1, 28]];
    for (const [name, size, offset] of attrs) {
      const loc = gl.getAttribLocation(canProg.p, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, offset);
    }

    const shadowVao = gl.createVertexArray();
    gl.bindVertexArray(shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const sLoc = gl.getAttribLocation(shadowProg.p, 'aP');
    gl.enableVertexAttribArray(sLoc);
    gl.vertexAttribPointer(sLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Textura de la etiqueta: sin redimensionar ni recolorear; mipmaps + filtrado anisótropo
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(16, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }

    // La etiqueta rodea la circunferencia completa conservando su proporción.
    labelH = 2 * Math.PI * R * image.naturalHeight / image.naturalWidth;
    labelTop = LABEL_CENTER + labelH / 2;

    scene = { canProg, shadowProg, canVao, shadowVao, tex, count: idx.length };
    resize();
  }

  // ---- Cámara y encuadre responsive -----------------------------------------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, canvas.clientWidth); cssH = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const aspect = cssW / cssH;
    const fov = 24 * DEG, tanH = Math.tan(fov / 2);
    // La lata ocupa ~56 % del alto y como mucho ~30 % del ancho: aire alrededor.
    const dist = Math.max(CAN_H / (0.56 * 2 * tanH), (2 * R) / (0.30 * 2 * tanH * aspect));
    const target = [0, -0.07 * CAN_H, 0], elev = 5 * DEG;
    eye = [0, target[1] + dist * Math.sin(elev), dist * Math.cos(elev)];
    viewProj = M4.mul(M4.perspective(fov, aspect, dist * 0.5, dist * 2), M4.lookAt(eye, target, [0, 1, 0]));
  }

  // Rectángulo en pantalla de la lata (para detectar el hover solo sobre ella)
  function screenRect(mvp) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [-R, R]) for (const y of [0, CAN_H]) for (const z of [-R, R]) {
      const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
      const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
      const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
      const sx = (cx / cw * 0.5 + 0.5) * cssW, sy = (0.5 - cy / cw * 0.5) * cssH;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x0, y0, x1, y1 };
  }

  // ---- Interacción ------------------------------------------------------------
  let pointer = null, touchSpin = false;
  const overCan = (x, y) => hitRect && x >= hitRect.x0 && x <= hitRect.x1 && y >= hitRect.y0 && y <= hitRect.y1;
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') pointer = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') pointer = null; });
  // En pantallas táctiles no existe hover: un toque sobre la lata alterna el giro.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') touchSpin = overCan(e.clientX, e.clientY) ? !touchSpin : false;
  });

  // ---- Bucle de animación ---------------------------------------------------
  let time = 0, last = 0, spin = 0, omega = 0, running = false, visible = true;

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 0;
    last = now;
    time += dt;

    const hovering = touchSpin || (pointer !== null && overCan(pointer[0], pointer[1]));
    const target = hovering ? SPIN_SPEED : 0;
    omega += (target - omega) * (1 - Math.exp(-dt / (hovering ? SPIN_IN : SPIN_OUT)));
    spin += omega * dt;

    // Flotación: suma de senos lentos (sin rebote) + balanceo casi imperceptible
    const TAU = Math.PI * 2;
    const f = reduceMotion ? 0 : 0.72 * Math.sin(TAU * time / 6.4) + 0.28 * Math.sin(TAU * time / 3.7 + 1.1);
    const tiltZ = reduceMotion ? 0 : 0.6 * DEG * Math.sin(TAU * time / 7.9 + 0.6);
    const tiltX = reduceMotion ? 0 : 0.45 * DEG * Math.sin(TAU * time / 9.7 + 2.0);

    const model = M4.mul(M4.translate(0, FLOAT_AMP * f, 0),
      M4.mul(M4.rotZ(tiltZ), M4.mul(M4.rotX(tiltX), M4.mul(M4.rotY(spin), M4.translate(0, -CAN_H / 2, 0)))));
    hitRect = screenRect(M4.mul(viewProj, model));

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sombra de contacto difusa: más amplia y tenue cuando la lata sube
    const { canProg, shadowProg } = scene;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(shadowProg.p);
    gl.uniformMatrix4fv(shadowProg.u.uViewProj, false, viewProj);
    gl.uniform3f(shadowProg.u.uCenter, 0, -CAN_H / 2 - 0.16 * CAN_H, 0);
    const spread = 1 + 0.08 * f;
    gl.uniform2f(shadowProg.u.uSize, 2.4 * R * spread, 2.4 * R * spread);
    gl.uniform1f(shadowProg.u.uAlpha, 0.15 * (1 - 0.2 * f));
    gl.bindVertexArray(scene.shadowVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(canProg.p);
    gl.uniformMatrix4fv(canProg.u.uModel, false, model);
    gl.uniformMatrix4fv(canProg.u.uViewProj, false, viewProj);
    gl.uniform3fv(canProg.u.uEye, eye);
    gl.uniform3f(canProg.u.uCanColor, CAN_COLOR[0] / 255, CAN_COLOR[1] / 255, CAN_COLOR[2] / 255);
    gl.uniform1f(canProg.u.uLabelTop, labelTop);
    gl.uniform1f(canProg.u.uLabelH, labelH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(canProg.u.uLabel, 0);
    gl.bindVertexArray(scene.canVao);
    gl.drawElements(gl.TRIANGLES, scene.count, gl.UNSIGNED_INT, 0);

    requestAnimationFrame(frame);
  }

  function setRunning(on) {
    on = on && visible && scene !== null && !document.hidden;
    if (on === running) return;
    running = on;
    if (on) { last = 0; requestAnimationFrame(frame); }
  }

  // Pausa cuando el embed no está en pantalla o la pestaña está oculta
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    setRunning(true);
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => setRunning(true));
  new ResizeObserver(() => { if (scene) resize(); }).observe(canvas);

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setRunning(false); scene = null; });
  canvas.addEventListener('webglcontextrestored', () => { init(); setRunning(true); });

  image = new Image();
  image.decoding = 'async';
  image.src = LABEL_SRC;
  image.decode().then(() => {
    init();
    setRunning(true);
    requestAnimationFrame(() => canvas.classList.add('ready'));
  });
})();
