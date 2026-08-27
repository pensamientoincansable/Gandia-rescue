import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Compass, Maximize2, Minimize2, Plus, Minus, Smartphone, Navigation, Eye, Check,
} from 'lucide-react';

/**
 * Visor de panoramas equirrectangulares 360° estilo Google Street View.
 *
 * Características técnicas:
 * - Renderizado en esfera virtual WebGL con proyección matemática equirrectangular completa (360° x 180°).
 * - Filtrado anisotrópico (EXT_texture_filter_anisotropic) y soporte de alta resolución DPR (Retina/4K).
 * - Transición cinemática Street View (dolly zoom y crossfade suave entre nodos consecutivos).
 * - Proyección en tiempo real de hotspots interactivos en coordenadas 3D sobre la pantalla.
 * - Brújula interactiva (clic para reorientar al Norte), controles flotantes de zoom (+/-),
 *   pantalla completa y giroscopio móvil para mover la vista inclinando el dispositivo.
 * - Inercia física natural al arrastrar con ratón / táctil, zoom con rueda o pellizco,
 *   y respaldo plano si WebGL no está disponible.
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
uniform sampler2D uTexPrev;
uniform float uBlend;
uniform float uZoom;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTan;
uniform float uAspect;
const float PI = 3.141592653589793;

vec4 sampleSphere(sampler2D tex, vec3 dir) {
  float lon = atan(dir.x, -dir.z);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  vec2 uv = vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI);
  return texture2D(tex, uv);
}

void main() {
  vec3 dir = normalize(uFwd + (uRight * (vPos.x * uTan * uAspect) + uUp * (vPos.y * uTan)) / max(0.01, uZoom));
  vec4 colNext = sampleSphere(uTex, dir);
  vec4 color;
  if (uBlend < 0.999) {
    vec4 colPrev = sampleSphere(uTexPrev, dir);
    color = mix(colPrev, colNext, uBlend);
  } else {
    color = colNext;
  }
  // Mejora de contraste fotográfico y luminancia estilo Street View
  vec3 rgb = pow(color.rgb, vec3(0.96));
  gl_FragColor = vec4(rgb, color.a);
}`;

const DEG = Math.PI / 180;
const MIN_FOV = 42;
const MAX_FOV = 96;
const PITCH_LIMIT = 82;

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
  sensitivity = 0.65,
  initialYaw = 0,
  onLook,
  className = '',
  overlayTop = null,
  loadingLabel = 'Cargando vista 360°…',
  errorLabel = 'No se ha podido cargar el panorama 360°.',
  zoneName = '',
  zoneCoord = '',
  t = (k) => k,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const hotspotsRef = useRef(null);
  const stateRef = useRef({
    yaw: initialYaw * DEG,
    pitch: -4 * DEG,
    fov: 72 * DEG,
    targetFov: 72 * DEG,
    targetYaw: null,
    targetPitch: null,
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
  const prevTexRef = useRef(null);
  const transitionRef = useRef(null);

  const [webglFailed, setWebglFailed] = useState(false);
  const [initToken, setInitToken] = useState(0);
  const [glEpoch, setGlEpoch] = useState(0);
  const [imageState, setImageState] = useState('loading');
  const [headingDeg, setHeadingDeg] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gyroActive, setGyroActive] = useState(false);
  const [hasGyroSupport, setHasGyroSupport] = useState(false);

  const onLookRef = useRef(onLook);
  onLookRef.current = onLook;

  // Detección de giroscopio en el dispositivo
  useEffect(() => {
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      setHasGyroSupport(true);
    }
  }, []);

  /* ------------------------------------------------ motor de render WebGL */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const onContextLost = (event) => {
      event.preventDefault();
      activeTexRef.current = null;
      prevTexRef.current = null;
      texturesRef.current.clear();
      glRef.current = null;
    };
    const onContextRestored = () => setInitToken((n) => n + 1);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: false, powerPreference: 'high-performance' })
      || canvas.getContext('experimental-webgl');
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
    const uTexPrev = gl.getUniformLocation(program, 'uTexPrev');
    gl.uniform1i(uTex, 0);
    gl.uniform1i(uTexPrev, 1);

    const uniforms = {
      fwd: gl.getUniformLocation(program, 'uFwd'),
      right: gl.getUniformLocation(program, 'uRight'),
      up: gl.getUniformLocation(program, 'uUp'),
      tan: gl.getUniformLocation(program, 'uTan'),
      aspect: gl.getUniformLocation(program, 'uAspect'),
      blend: gl.getUniformLocation(program, 'uBlend'),
      zoom: gl.getUniformLocation(program, 'uZoom'),
    };

    setWebglFailed(false);
    setGlEpoch((n) => n + 1);

    let raf = 0;
    let lastT = performance.now();
    let lookEmit = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.2);
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

      // Suavizado de destino (cuando se hace clic para reorientar al Norte o navegar)
      if (st.targetYaw != null) {
        let dy = st.targetYaw - st.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        st.yaw += dy * Math.min(1, dt * 7);
        if (Math.abs(dy) < 0.005) st.targetYaw = null;
      }
      if (st.targetPitch != null) {
        const dp = st.targetPitch - st.pitch;
        st.pitch += dp * Math.min(1, dt * 7);
        if (Math.abs(dp) < 0.005) st.targetPitch = null;
      }

      // Suavizado de FOV (zoom)
      if (Math.abs(st.fov - st.targetFov) > 0.001) {
        st.fov += (st.targetFov - st.fov) * Math.min(1, dt * 8);
      }

      // Inercia natural
      if (!st.dragging && st.targetYaw == null) {
        st.yaw += st.vyaw * dt;
        st.pitch += st.vpitch * dt;
        st.vyaw *= Math.pow(0.06, dt);
        st.vpitch *= Math.pow(0.06, dt);
        if (Math.abs(st.vyaw) < 0.008) st.vyaw = 0;
        if (Math.abs(st.vpitch) < 0.008) st.vpitch = 0;
      }
      st.pitch = Math.max(-PITCH_LIMIT * DEG, Math.min(PITCH_LIMIT * DEG, st.pitch));
      st.fov = Math.max(MIN_FOV * DEG, Math.min(MAX_FOV * DEG, st.fov));

      // Transición cinemática Street View
      let blendVal = 1.0;
      let zoomVal = 1.0;
      const tr = transitionRef.current;
      if (tr) {
        const progress = Math.min(1, (now - tr.start) / tr.duration);
        // Curva sigmoide suave
        const ease = progress * progress * (3.0 - 2.0 * progress);
        blendVal = ease;
        // Efecto de avance dinámico (dolly forward)
        zoomVal = 1.0 + Math.sin(progress * Math.PI) * 0.18;
        if (progress >= 1) {
          transitionRef.current = null;
          prevTexRef.current = null;
        }
      }

      const tex = activeTexRef.current;
      const prevTex = prevTexRef.current;
      const gl2 = glRef.current;
      if (gl2 && !gl2.isContextLost() && tex) {
        gl2.clearColor(0.04, 0.08, 0.07, 1);
        gl2.clear(gl2.COLOR_BUFFER_BIT);

        if (prevTex && blendVal < 0.999) {
          gl2.activeTexture(gl2.TEXTURE1);
          gl2.bindTexture(gl2.TEXTURE_2D, prevTex);
        }
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
        gl2.uniform1f(uniforms.blend, blendVal);
        gl2.uniform1f(uniforms.zoom, zoomVal);

        gl2.drawArrays(gl2.TRIANGLES, 0, 3);
      }

      // Proyección de hotspots con cálculo de profundidad y perspectiva
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

      if (now - lookEmit > 100) {
        lookEmit = now;
        let heading = (st.yaw / DEG) % 360;
        if (heading < 0) heading += 360;
        setHeadingDeg(heading);
        if (onLookRef.current) {
          onLookRef.current({ headingDeg: heading, pitchDeg: st.pitch / DEG, fovDeg: st.fov / DEG });
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      removeContextListeners();
      if (!gl.isContextLost()) {
        for (const tex of texturesRef.current.values()) gl.deleteTexture(tex);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
      texturesRef.current.clear();
      activeTexRef.current = null;
      prevTexRef.current = null;
      glRef.current = null;
      programRef.current = null;
    };
  }, [initToken]);

  /* ------------------------------------------------ carga de texturas y transición */
  useEffect(() => {
    const gl = glRef.current;
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
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.REPEAT);
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
          gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);

          // Activar filtrado anisotrópico si está disponible para máxima nitidez
          const ext = gl2.getExtension('EXT_texture_filter_anisotropic') || gl2.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
          if (ext) {
            const maxAniso = gl2.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 4;
            gl2.texParameterf(gl2.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maxAniso, 8));
          }

          texturesRef.current.set(src, tex);
        }

        if (activeTexRef.current && activeTexRef.current !== tex) {
          prevTexRef.current = activeTexRef.current;
          transitionRef.current = { start: performance.now(), duration: 520 };
        }
        activeTexRef.current = tex;
      }
      setImageState('ready');
    };

    image.onerror = () => {
      if (cancelled) return;
      console.error('[Gandía] Error al cargar panorama 360°:', src);
      setImageState('error');
    };
    image.src = src;
    return () => { cancelled = true; };
  }, [src, webglFailed, glEpoch]);

  /* ------------------------------------------------ interacción ratón / táctil */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const st = stateRef.current;

    const onPointerDown = (e) => {
      if (e.target.closest?.('.pano-hotspot') || e.target.closest?.('.pano-ctrl-btn') || e.target.closest?.('.pano-hud')) return;
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      st.dragging = true;
      st.vyaw = 0;
      st.vpitch = 0;
      st.targetYaw = null;
      st.targetPitch = null;
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
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (st.pinchDist > 0) {
          const scale = st.pinchDist / Math.max(1, dist);
          const nextFov = Math.max(MIN_FOV * DEG, Math.min(MAX_FOV * DEG, st.targetFov * scale));
          st.targetFov = nextFov;
          st.fov = nextFov;
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
      const delta = Math.sign(e.deltaY) * 0.09;
      st.targetFov = Math.max(MIN_FOV * DEG, Math.min(MAX_FOV * DEG, st.targetFov * (1 + delta)));
    };

    const onDoubleClick = (e) => {
      if (e.target.closest?.('.pano-hotspot') || e.target.closest?.('.pano-ctrl-btn')) return;
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      const aspect = rect.width / Math.max(1, rect.height);
      const tan = Math.tan(st.fov / 2);
      const dyaw = -Math.atan2(nx * tan * aspect, 1);
      const dpitch = Math.atan2(ny * tan, 1);
      st.targetYaw = st.yaw + dyaw * 0.75;
      st.targetPitch = Math.max(-PITCH_LIMIT * DEG, Math.min(PITCH_LIMIT * DEG, st.pitch + dpitch * 0.75));
    };

    const onKey = (e) => {
      const step = 6 * DEG * (0.5 + sensitivity);
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') st.yaw -= step;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') st.yaw += step;
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') st.pitch = Math.min(PITCH_LIMIT * DEG, st.pitch + step);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') st.pitch = Math.max(-PITCH_LIMIT * DEG, st.pitch - step);
      else if (e.key === '+' || e.key === '=') st.targetFov = Math.max(MIN_FOV * DEG, st.targetFov * 0.9);
      else if (e.key === '-' || e.key === '_') st.targetFov = Math.min(MAX_FOV * DEG, st.targetFov * 1.1);
      else return;
      e.preventDefault();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('dblclick', onDoubleClick);
    container.addEventListener('keydown', onKey);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('dblclick', onDoubleClick);
      container.removeEventListener('keydown', onKey);
    };
  }, [sensitivity]);

  /* ------------------------------------------------ Giroscopio / Motion */
  useEffect(() => {
    if (!gyroActive) return undefined;
    let initialAlpha = null;
    const onOrientation = (e) => {
      if (e.alpha == null || e.beta == null) return;
      if (initialAlpha == null) initialAlpha = e.alpha;
      const alpha = (e.alpha - initialAlpha) * DEG;
      const beta = (e.beta - 90) * DEG;
      stateRef.current.yaw = -alpha;
      stateRef.current.pitch = Math.max(-PITCH_LIMIT * DEG, Math.min(PITCH_LIMIT * DEG, beta));
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [gyroActive]);

  const toggleGyro = useCallback(() => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then((res) => {
          if (res === 'granted') setGyroActive((prev) => !prev);
        })
        .catch((err) => console.warn('Gyro permission error:', err));
    } else {
      setGyroActive((prev) => !prev);
    }
  }, []);

  const resetNorth = useCallback(() => {
    stateRef.current.targetYaw = 0;
  }, []);

  const zoomIn = useCallback(() => {
    const st = stateRef.current;
    st.targetFov = Math.max(MIN_FOV * DEG, st.targetFov * 0.85);
  }, []);

  const zoomOut = useCallback(() => {
    const st = stateRef.current;
    st.targetFov = Math.min(MAX_FOV * DEG, st.targetFov * 1.15);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  return (
    <div ref={containerRef} className={`pano ${className}`} tabIndex={0} role="application" aria-label="Vista 360 grados Street View">
      <canvas ref={canvasRef} className="pano__canvas" />

      {(webglFailed || imageState === 'error') && (
        <div className="pano__flat-img" style={{ backgroundImage: `url(${src})` }} />
      )}

      {imageState !== 'ready' && (
        <div className={`pano__notice ${imageState === 'error' ? 'pano__notice--error' : ''}`} role="status" aria-live="polite">
          <span className="pano-spinner" />
          {imageState === 'error' ? errorLabel : loadingLabel}
        </div>
      )}

      {/* Street View HUD Badge */}
      {zoneName && (
        <div className="pano-hud">
          <div className="pano-hud__badge">
            <span className="pano-hud__dot" />
            <span className="pano-hud__tag">{t('streetView') || 'Street View 360°'}</span>
          </div>
          <strong className="pano-hud__title">{zoneName}</strong>
          {zoneCoord && <span className="pano-hud__coord">{zoneCoord}</span>}
        </div>
      )}

      {/* Controles flotantes de navegación Street View */}
      <div className="pano-controls" role="toolbar" aria-label="Controles Street View">
        {/* Brújula interactiva con aguja que apunta al Norte */}
        <button
          type="button"
          className="pano-ctrl-btn pano-ctrl-compass"
          onClick={resetNorth}
          title={t('resetNorth') || 'Orientar al Norte'}
          aria-label={t('resetNorth') || 'Orientar al Norte'}
        >
          <div className="pano-compass-ring" style={{ transform: `rotate(${-headingDeg}deg)` }}>
            <span className="pano-compass-n">N</span>
            <span className="pano-compass-needle" />
            <span className="pano-compass-s">S</span>
          </div>
        </button>

        <div className="pano-ctrl-group">
          <button
            type="button"
            className="pano-ctrl-btn"
            onClick={zoomIn}
            title={t('zoomIn') || 'Acercar'}
            aria-label={t('zoomIn') || 'Acercar'}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="pano-ctrl-btn"
            onClick={zoomOut}
            title={t('zoomOut') || 'Alejar'}
            aria-label={t('zoomOut') || 'Alejar'}
          >
            <Minus size={16} />
          </button>
        </div>

        {hasGyroSupport && (
          <button
            type="button"
            className={`pano-ctrl-btn ${gyroActive ? 'pano-ctrl-btn--active' : ''}`}
            onClick={toggleGyro}
            title={gyroActive ? t('gyroActive') || 'Giroscopio activo' : t('gyroscope') || 'Giroscopio'}
            aria-label={t('gyroscope') || 'Giroscopio'}
          >
            <Smartphone size={16} />
          </button>
        )}

        <button
          type="button"
          className="pano-ctrl-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? t('exitFullscreen') || 'Salir' : t('fullscreen') || 'Pantalla completa'}
          aria-label={t('fullscreen') || 'Pantalla completa'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Hotspots interactivos */}
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
