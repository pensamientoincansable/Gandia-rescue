import { useEffect, useRef, useState } from 'react';

/**
 * Visor de panoramas equirrectangulares 360° estilo Street View.
 *
 * - Renderiza la imagen sobre una esfera virtual con WebGL (un quad a pantalla
 *   completa y proyección por píxel en el fragment shader).
 * - Arrastrar para mirar (con inercia), rueda/pellizco para el zoom,
 *   flechas del teclado para mirar.
 * - Los `hotspots` se proyectan cada fotograma sobre la pantalla como
 *   botones DOM (flechas de desplazamiento, marcadores de misiones...).
 * - Si WebGL no está disponible, muestra la imagen plana como respaldo.
 */

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vPos;
void main() {
  vPos = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision mediump float;
varying vec2 vPos;
uniform sampler2D uTex;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTan;
uniform float uAspect;
const float PI = 3.141592653589793;
void main() {
  vec3 dir = normalize(uFwd + uRight * (vPos.x * uTan * uAspect) + uUp * (vPos.y * uTan));
  float lon = atan(dir.x, -dir.z);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  gl_FragColor = texture2D(uTex, uv);
}`;

const DEG = Math.PI / 180;
const MIN_FOV = 46;
const MAX_FOV = 96;
const PITCH_LIMIT = 78;

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function Panorama360({
  src,
  hotspots = [],
  sensitivity = 0.65,       // 0.2 – 1.2 aprox
  initialYaw = 0,
  onLook,                   // ({headingDeg, pitchDeg, fovDeg}) => void (aprox. 8 Hz)
  className = '',
  overlayTop = null,        // nodo React opcional sobre el canvas
  loadingLabel = 'Cargando panorama 360°…',
  errorLabel = 'No se ha podido cargar la imagen 360°.',
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const hotspotsRef = useRef(null);
  const stateRef = useRef({
    yaw: initialYaw * DEG,
    pitch: -6 * DEG,
    fov: 74 * DEG,
    vyaw: 0,
    vpitch: 0,
    dragging: false,
    pointers: new Map(),
    pinchDist: 0,
    lastPointer: null,
  });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const texturesRef = useRef(new Map());
  const activeTexRef = useRef(null);
  const [webglFailed, setWebglFailed] = useState(false);
  /* Se incrementa para volver a montar el motor tras `webglcontextrestored`. */
  const [initToken, setInitToken] = useState(0);
  /* Se incrementa cada vez que hay un contexto WebGL listo (montaje inicial y
     restauración tras `webglcontextrestored`): las texturas se vuelven a subir. */
  const [glEpoch, setGlEpoch] = useState(0);
  /* Estado de carga de la imagen equirectangular: 'loading' | 'ready' | 'error'. */
  const [imageState, setImageState] = useState('loading');
  /* onLook se guarda en un ref para que el bucle RAF nunca use un cierre obsoleto. */
  const onLookRef = useRef(onLook);
  onLookRef.current = onLook;

  /* ------------------------------------------------ motor de render */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    /* El contexto se pierde si el navegador lo recicla; en ese caso se vuelve a
       montar el motor completo cuando el navegador lo restaura. */
    const onContextLost = (event) => {
      event.preventDefault();
      activeTexRef.current = null;
      texturesRef.current.clear();
      glRef.current = null;
    };
    const onContextRestored = () => setInitToken((n) => n + 1);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false }) || canvas.getContext('experimental-webgl');
    if (!gl || gl.isContextLost?.()) {
      setWebglFailed(true);
      container.classList.add('pano--flat');
      return () => {
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
      };
    }
    glRef.current = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const removeContextListeners = () => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
    };
    if (!vs || !fs) { setWebglFailed(true); return removeContextListeners; }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { setWebglFailed(true); return removeContextListeners; }
    gl.useProgram(program);
    programRef.current = program;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTex = gl.getUniformLocation(program, 'uTex');
    gl.uniform1i(uTex, 0);

    const uniforms = {
      fwd: gl.getUniformLocation(program, 'uFwd'),
      right: gl.getUniformLocation(program, 'uRight'),
      up: gl.getUniformLocation(program, 'uUp'),
      tan: gl.getUniformLocation(program, 'uTan'),
      aspect: gl.getUniformLocation(program, 'uAspect'),
    };

    setWebglFailed(false);
    /* Aviso al efecto de texturas: hay contexto listo al que subir la imagen. */
    setGlEpoch((n) => n + 1);

    let raf = 0;
    let lastT = performance.now();
    let lookEmit = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(2, Math.round(container.clientWidth * dpr));
      const h = Math.max(2, Math.round(container.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(container);
    resize();

    const frame = (now) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const st = stateRef.current;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // inercia
      if (!st.dragging) {
        st.yaw += st.vyaw * dt;
        st.pitch += st.vpitch * dt;
        st.vyaw *= Math.pow(0.06, dt);
        st.vpitch *= Math.pow(0.06, dt);
        if (Math.abs(st.vyaw) < 0.008) st.vyaw = 0;
        if (Math.abs(st.vpitch) < 0.008) st.vpitch = 0;
      }
      st.pitch = Math.max(-PITCH_LIMIT * DEG, Math.min(PITCH_LIMIT * DEG, st.pitch));
      st.fov = Math.max(MIN_FOV * DEG, Math.min(MAX_FOV * DEG, st.fov));

      const tex = activeTexRef.current;
      const gl2 = glRef.current;
      if (gl2 && !gl2.isContextLost() && tex) {
        gl2.clearColor(0.04, 0.08, 0.07, 1);
        gl2.clear(gl2.COLOR_BUFFER_BIT);
        /* La textura activa se vuelve a enlazar en cada fotograma: al viajar a
           una zona ya visitada se reutiliza una textura cacheada que no queda
           enlazada automáticamente y se seguiría viendo el panorama anterior. */
        gl2.activeTexture(gl2.TEXTURE0);
        gl2.bindTexture(gl2.TEXTURE_2D, tex);
        const yaw = st.yaw;
        const pitch = st.pitch;
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const cy = Math.cos(yaw);
        const sy = Math.sin(yaw);
        const fwd = [sy * cp, sp, -cy * cp];
        const right = [cy, 0, sy];
        const up = [-sy * sp, cp, cy * sp];
        gl2.uniform3fv(uniforms.fwd, fwd);
        gl2.uniform3fv(uniforms.right, right);
        gl2.uniform3fv(uniforms.up, up);
        gl2.uniform1f(uniforms.tan, Math.tan(st.fov / 2));
        gl2.uniform1f(uniforms.aspect, canvas.width / Math.max(1, canvas.height));
        gl2.drawArrays(gl2.TRIANGLES, 0, 3);
      }

      // proyección de hotspots
      const layer = hotspotsRef.current;
      if (layer) {
        const st2 = stateRef.current;
        const cp = Math.cos(st2.pitch);
        const sp = Math.sin(st2.pitch);
        const cy = Math.cos(st2.yaw);
        const sy = Math.sin(st2.yaw);
        const fwd = [sy * cp, sp, -cy * cp];
        const right = [cy, 0, sy];
        const up = [-sy * sp, cp, cy * sp];
        const tan = Math.tan(st2.fov / 2);
        const aspect = container.clientWidth / Math.max(1, container.clientHeight);
        for (const child of layer.children) {
          const hy = Number(child.dataset.yaw) * DEG;
          const hp = Number(child.dataset.pitch) * DEG;
          const v = [Math.sin(hy) * Math.cos(hp), Math.sin(hp), -Math.cos(hy) * Math.cos(hp)];
          const depth = v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2];
          if (depth < 0.18) {
            child.style.opacity = '0';
            child.style.pointerEvents = 'none';
            continue;
          }
          const sx = (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) / depth;
          const syv = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / depth;
          const px = (sx / (tan * aspect)) * 50;
          const py = -(syv / tan) * 50;
          if (Math.abs(px) > 60 || Math.abs(py) > 60) {
            child.style.opacity = '0';
            child.style.pointerEvents = 'none';
            continue;
          }
          child.style.opacity = '1';
          child.style.pointerEvents = 'auto';
          child.style.transform = `translate(-50%, -50%) translate(${px.toFixed(2)}%, ${py.toFixed(2)}%)`;
        }
      }

      if (onLookRef.current && now - lookEmit > 120) {
        lookEmit = now;
        const st3 = stateRef.current;
        let heading = (st3.yaw / DEG) % 360;
        if (heading < 0) heading += 360;
        onLookRef.current({ headingDeg: heading, pitchDeg: st3.pitch / DEG, fovDeg: st3.fov / DEG });
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      removeContextListeners();
      /* No se fuerza `WEBGL_lose_context`: el contexto quedaba inutilizable y,
         al remontar el componente (React StrictMode remonta cada efecto en
         desarrollo), `getContext` devolvía el mismo contexto ya perdido y el
         panorama no volvía a dibujarse nunca. */
      if (!gl.isContextLost()) {
        for (const tex of texturesRef.current.values()) gl.deleteTexture(tex);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
      texturesRef.current.clear();
      activeTexRef.current = null;
      glRef.current = null;
      programRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initToken]);

  /* ------------------------------------------------ carga de texturas */
  useEffect(() => {
    const gl = glRef.current;
    /* Sin WebGL se sigue cargando la imagen para el respaldo plano y para saber
       si la descarga ha funcionado. */
    const useGl = !!gl && !webglFailed && !gl.isContextLost();
    const image = new Image();
    let cancelled = false;
    setImageState((prev) => (prev === 'ready' ? prev : 'loading'));
    image.onload = () => {
      if (cancelled) return;
      const gl2 = glRef.current;
      if (useGl && gl2 && !gl2.isContextLost()) {
        let tex = texturesRef.current.get(src);
        if (!tex) {
          tex = gl2.createTexture();
          gl2.activeTexture(gl2.TEXTURE0);
          gl2.bindTexture(gl2.TEXTURE_2D, tex);
          gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, false);
          gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, image);
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
          texturesRef.current.set(src, tex);
        }
        activeTexRef.current = tex;
      }
      setImageState('ready');
    };
    /* Antes un 404 (o cualquier error de red) fallaba en silencio y el visor se
       quedaba en negro sin explicación: ahora se avisa por consola y en pantalla. */
    image.onerror = () => {
      if (cancelled) return;
      console.error('[Gandía] No se ha podido cargar el panorama 360°:', src);
      setImageState('error');
    };
    image.src = src;
    return () => { cancelled = true; };
  }, [src, webglFailed, glEpoch]);

  /* ------------------------------------------------ interacción */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const st = stateRef.current;

    const onPointerDown = (e) => {
      if (e.target.closest?.('.pano-hotspot')) return;
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      st.dragging = true;
      st.vyaw = 0;
      st.vpitch = 0;
      st.lastPointer = { x: e.clientX, y: e.clientY };
      container.classList.add('pano--dragging');
      if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        st.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      container.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!st.pointers.has(e.pointerId)) return;
      const prev = st.pointers.get(e.pointerId);
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (st.pinchDist > 0) {
          const scale = st.pinchDist / Math.max(1, dist);
          st.fov = Math.max(MIN_FOV * DEG, Math.min(MAX_FOV * DEG, st.fov * scale));
        }
        st.pinchDist = dist;
        return;
      }
      if (!st.lastPointer) return;
      const dx = e.clientX - st.lastPointer.x;
      const dy = e.clientY - st.lastPointer.y;
      st.lastPointer = { x: e.clientX, y: e.clientY };
      const k = (0.0016 + sensitivity * 0.0026) * (st.fov / (74 * DEG));
      st.yaw -= dx * k;
      st.pitch += dy * k;
      st.pitch = Math.max(-PITCH_LIMIT * DEG, Math.min(PITCH_LIMIT * DEG, st.pitch));
      st.vyaw = -dx * k * 14;
      st.vpitch = dy * k * 14;
    };

    const onPointerUp = (e) => {
      st.pointers.delete(e.pointerId);
      if (st.pointers.size === 0) {
        st.dragging = false;
        st.lastPointer = null;
        container.classList.remove('pano--dragging');
      }
      if (st.pointers.size < 2) st.pinchDist = 0;
    };

    const onWheel = (e) => {
      e.preventDefault();
      st.fov = Math.max(MIN_FOV * DEG, Math.min(MAX_FOV * DEG, st.fov * (1 + Math.sign(e.deltaY) * 0.08)));
    };

    const onKey = (e) => {
      const step = 6 * DEG * (0.5 + sensitivity);
      if (e.key === 'ArrowLeft') st.yaw -= step;
      else if (e.key === 'ArrowRight') st.yaw += step;
      else if (e.key === 'ArrowUp') st.pitch = Math.min(PITCH_LIMIT * DEG, st.pitch + step);
      else if (e.key === 'ArrowDown') st.pitch = Math.max(-PITCH_LIMIT * DEG, st.pitch - step);
      else if (e.key === '+') st.fov = Math.max(MIN_FOV * DEG, st.fov * 0.92);
      else if (e.key === '-') st.fov = Math.min(MAX_FOV * DEG, st.fov * 1.08);
      else return;
      e.preventDefault();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('keydown', onKey);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('keydown', onKey);
    };
  }, [sensitivity]);

  return (
    <div ref={containerRef} className={`pano ${className}`} tabIndex={0} role="application" aria-label="Vista 360 grados">
      <canvas ref={canvasRef} className="pano__canvas" />
      {(webglFailed || imageState === 'error') && (
        <div className="pano__flat-img" style={{ backgroundImage: `url(${src})` }} />
      )}
      {imageState !== 'ready' && (
        <div className={`pano__notice ${imageState === 'error' ? 'pano__notice--error' : ''}`} role="status" aria-live="polite">
          {imageState === 'error' ? errorLabel : loadingLabel}
        </div>
      )}
      <div ref={hotspotsRef} className="pano__hotspots">
        {hotspots.map((spot) => (
          <button
            key={spot.id}
            type="button"
            className={`pano-hotspot ${spot.kind === 'arrow' ? 'pano-hotspot--arrow' : ''} ${spot.className ?? ''}`}
            data-yaw={spot.yaw}
            data-pitch={spot.pitch ?? -14}
            onClick={(e) => { e.stopPropagation(); spot.onClick?.(); }}
            aria-label={spot.label}
          >
            {spot.node}
          </button>
        ))}
      </div>
      {overlayTop}
    </div>
  );
}
