import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  boundedYouAndAizuTime,
  YOU_AND_AIZU_CUES,
  YOU_AND_AIZU_DURATION_MS,
  youAndAizuCueAt,
  youAndAizuProgress,
} from "./youAndAizuModel";
import "./you-and-aizu.css";

const vertexShaderSource = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uProgress;
uniform float uMotion;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.54;
  mat2 turn = mat2(0.86, -0.50, 0.50, 0.86);
  for (int octave = 0; octave < 6; octave++) {
    value += noise(p) * amplitude;
    p = turn * p * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.52;
  }
  return value;
}

float sdBox(vec2 p, vec2 halfSize) {
  vec2 d = abs(p) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float boxMask(vec2 p, vec2 halfSize, float softness) {
  return 1.0 - smoothstep(0.0, softness, sdBox(p, halfSize));
}

vec4 cloudLayer(vec2 p, float baseY, float scale, float speed, float phase, vec3 darkTone, vec3 midTone, vec3 lightTone) {
  vec2 samplePoint = vec2(p.x * scale + phase + uTime * speed * uMotion, phase * 0.37);
  float ridge = baseY + (fbm(samplePoint) - 0.48) * (0.82 / scale);
  float depth = ridge - p.y;
  float alpha = smoothstep(-0.016, 0.018, depth);
  vec3 color = lightTone;
  color = mix(color, midTone, smoothstep(0.035, 0.105, depth));
  color = mix(color, darkTone, smoothstep(0.13, 0.23, depth));
  return vec4(color, alpha);
}

void composite(inout vec3 color, vec4 layer) {
  color = mix(color, layer.rgb, layer.a);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uResolution;
  vec2 p = (frag * 2.0 - uResolution) / uResolution.y;

  float morningToBlue = smoothstep(0.14, 0.27, uProgress);
  float blueToRose = smoothstep(0.31, 0.49, uProgress);
  float roseToViolet = smoothstep(0.68, 0.82, uProgress);
  vec3 skyTop = mix(vec3(0.48, 0.66, 0.93), vec3(0.28, 0.67, 0.84), morningToBlue);
  skyTop = mix(skyTop, vec3(0.45, 0.36, 0.78), blueToRose);
  skyTop = mix(skyTop, vec3(0.20, 0.19, 0.42), roseToViolet);
  vec3 skyBottom = mix(vec3(1.0, 0.72, 0.56), vec3(0.99, 0.55, 0.60), blueToRose);
  skyBottom = mix(skyBottom, vec3(0.89, 0.62, 0.77), roseToViolet);
  vec3 color = mix(skyBottom, skyTop, smoothstep(-0.86, 0.92, p.y));

  float sunPulse = 0.94 + 0.06 * sin(uTime * 1.1 * uMotion);
  float sun = 1.0 - smoothstep(0.14 * sunPulse, 0.36, length(p - vec2(-0.62, 0.48)));
  color = mix(color, vec3(1.0, 0.88, 0.59), sun * 0.48);

  composite(color, cloudLayer(p, 0.36, 5.8, 0.010, 4.0, vec3(0.56, 0.35, 0.52), vec3(0.86, 0.50, 0.57), vec3(1.0, 0.72, 0.61)));
  composite(color, cloudLayer(p, 0.16, 4.6, 0.018, 9.0, vec3(0.45, 0.31, 0.50), vec3(0.78, 0.43, 0.57), vec3(0.98, 0.65, 0.65)));
  composite(color, cloudLayer(p, -0.02, 3.5, 0.030, 15.0, vec3(0.37, 0.30, 0.46), vec3(0.69, 0.42, 0.56), vec3(0.92, 0.62, 0.68)));

  float chorus = smoothstep(0.30, 0.34, uProgress) * (1.0 - smoothstep(0.64, 0.72, uProgress));
  chorus += smoothstep(0.93, 0.97, uProgress);
  float signalTime = fract(uTime * 0.34 * uMotion);
  vec2 signalA = vec2(-0.43, 0.10);
  vec2 signalB = vec2(0.43, 0.10);
  float ringA = 1.0 - smoothstep(0.010, 0.027, abs(length(p - signalA) - signalTime * 0.48));
  float ringB = 1.0 - smoothstep(0.010, 0.027, abs(length(p - signalB) - signalTime * 0.48));
  color = mix(color, vec3(1.0, 0.86, 0.58), (ringA + ringB) * chorus * (1.0 - signalTime) * 0.62);

  float staffStrength = smoothstep(0.10, 0.20, uProgress) * (1.0 - smoothstep(0.50, 0.62, uProgress));
  staffStrength += smoothstep(0.70, 0.74, uProgress) * 0.72;
  for (int line = 0; line < 5; line++) {
    float lineY = 0.27 - float(line) * 0.055;
    float legato = lineY + sin(p.x * 5.4 + uTime * 0.42 * uMotion) * 0.012;
    float staff = 1.0 - smoothstep(0.002, 0.007, abs(p.y - legato));
    color = mix(color, vec3(1.0, 0.93, 0.76), staff * staffStrength * 0.32);
  }

  composite(color, cloudLayer(p, -0.35, 2.7, 0.055, 23.0, vec3(0.31, 0.28, 0.42), vec3(0.58, 0.39, 0.54), vec3(0.85, 0.59, 0.67)));

  float bridgeY = -0.48;
  float bridge = 1.0 - smoothstep(0.004, 0.010, abs(p.y - bridgeY));
  float bridgeCurve = 1.0 - smoothstep(0.005, 0.012, abs(p.y - bridgeY - 0.13 * pow(fract((p.x + 1.4) * 1.15) - 0.5, 2.0)));
  float pillar = boxMask(vec2(fract((p.x + 1.6) * 3.45) - 0.5, p.y + 0.72), vec2(0.017, 0.24), 0.006);
  float bridgeInk = min(1.0, bridge + bridgeCurve * 0.72 + pillar * 0.72);
  color = mix(color, vec3(0.20, 0.16, 0.27), bridgeInk * 0.88);

  float carriageX = mix(-1.42, 1.42, fract(0.06 * uTime * uMotion + 0.12));
  vec2 carriagePoint = p - vec2(carriageX, bridgeY + 0.046);
  float carriage = boxMask(carriagePoint, vec2(0.13, 0.035), 0.006);
  carriage += boxMask(carriagePoint - vec2(0.15, -0.003), vec2(0.035, 0.043), 0.006);
  float windowA = boxMask(carriagePoint - vec2(-0.045, 0.004), vec2(0.024, 0.014), 0.004);
  float windowB = boxMask(carriagePoint - vec2(0.035, 0.004), vec2(0.024, 0.014), 0.004);
  color = mix(color, vec3(0.32, 0.16, 0.28), clamp(carriage, 0.0, 1.0));
  color = mix(color, vec3(1.0, 0.82, 0.40), max(windowA, windowB));

  float weekStrength = smoothstep(0.46, 0.51, uProgress);
  for (int day = 0; day < 7; day++) {
    float dayX = -0.72 + float(day) * 0.24;
    float dayMark = boxMask(p - vec2(dayX, -0.77), vec2(0.006, 0.055 + 0.010 * mod(float(day), 2.0)), 0.004);
    color = mix(color, vec3(0.98, 0.81, 0.68), dayMark * weekStrength * 0.52);
  }

  composite(color, cloudLayer(p, -0.67, 1.9, 0.105, 31.0, vec3(0.25, 0.22, 0.34), vec3(0.49, 0.35, 0.48), vec3(0.77, 0.55, 0.64)));

  float grain = hash21(frag + vec2(17.0, 43.0)) - 0.5;
  color += grain * 0.055;
  float vignette = 0.54 + 0.46 * pow(max(0.0, 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y)), 0.2);
  color *= vignette;
  gl_FragColor = vec4(color, 1.0);
}
`;

const compileShader = (gl: WebGLRenderingContext, kind: number, source: string): WebGLShader => {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("Unable to create showcase shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const drawCanvasFallback = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  motion: number,
) => {
  const time = timeMs / 1000;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#729ed8");
  gradient.addColorStop(0.5, "#dd7790");
  gradient.addColorStop(1, "#503849");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const colors = ["#f8b0a1", "#d57c88", "#96596d", "#5a405b"];
  colors.forEach((color, layerIndex) => {
    const baseY = height * (0.32 + layerIndex * 0.15);
    const speed = (4 + layerIndex * 8) * motion;
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x <= width + 12; x += 12) {
      const y = baseY
        + Math.sin(x * 0.012 + time * speed * 0.02 + layerIndex) * height * 0.065
        + Math.sin(x * 0.029 - time * speed * 0.014) * height * 0.026;
      context.lineTo(x, y);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  });
};

function ShaderStage({ timeMs, reduceMotion }: { timeMs: number; reduceMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ timeMs, reduceMotion });
  latestRef.current = { timeMs, reduceMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let disposed = false;
    let frameID = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      const context = canvas.getContext("2d");
      const renderFallback = () => {
        if (disposed || !context) return;
        drawCanvasFallback(
          context,
          canvas.clientWidth,
          canvas.clientHeight,
          latestRef.current.timeMs,
          latestRef.current.reduceMotion ? 0 : 1,
        );
        frameID = requestAnimationFrame(renderFallback);
      };
      renderFallback();
      return () => {
        disposed = true;
        observer.disconnect();
        cancelAnimationFrame(frameID);
      };
    }

    let program: WebGLProgram | null = null;
    let vertexShader: WebGLShader | null = null;
    let fragmentShader: WebGLShader | null = null;
    try {
      vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
      fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
      program = gl.createProgram();
      if (!program) throw new Error("Unable to create showcase program");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "Unknown shader link error");
      }
    } catch {
      canvas.dataset.renderer = "failed";
      return () => {
        disposed = true;
        observer.disconnect();
        if (program) gl.deleteProgram(program);
        if (vertexShader) gl.deleteShader(vertexShader);
        if (fragmentShader) gl.deleteShader(fragmentShader);
      };
    }

    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "uResolution");
    const shaderTime = gl.getUniformLocation(program, "uTime");
    const progress = gl.getUniformLocation(program, "uProgress");
    const motion = gl.getUniformLocation(program, "uMotion");

    canvas.dataset.renderer = "webgl";
    const render = () => {
      if (disposed || !program) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(shaderTime, latestRef.current.timeMs / 1000);
      gl.uniform1f(progress, youAndAizuProgress(latestRef.current.timeMs));
      gl.uniform1f(motion, latestRef.current.reduceMotion ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frameID = requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frameID);
      if (vertices) gl.deleteBuffer(vertices);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="aizu-shader"
      role="img"
      aria-label="晨光云海、信号波纹、七日刻度和移动列车组成的程序化歌词舞台"
    />
  );
}

const formatTime = (timeMs: number): string => {
  const seconds = Math.max(0, Math.floor(timeMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export default function YouAndAizuShowcase() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const anchorRef = useRef({ wallMs: 0, mediaMs: 0 });
  const cue = useMemo(() => youAndAizuCueAt(timeMs), [timeMs]);

  useEffect(() => {
    document.title = "You & 合図 — LyricStage Song Study";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) {
      description.content = "《You & 合図》歌词意象驱动的程序化云海与视差演出草图。";
    }
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    anchorRef.current = { wallMs: performance.now(), mediaMs: timeMs };
    let frameID = 0;
    let lastCommit = 0;
    const tick = (wallMs: number) => {
      const media = audioRef.current;
      const next = audioAvailable && media && Number.isFinite(media.currentTime)
        ? media.currentTime * 1000
        : anchorRef.current.mediaMs + wallMs - anchorRef.current.wallMs;
      if (next >= YOU_AND_AIZU_DURATION_MS) {
        setTimeMs(YOU_AND_AIZU_DURATION_MS);
        setPlaying(false);
        return;
      }
      if (wallMs - lastCommit >= 50) {
        lastCommit = wallMs;
        setTimeMs(next);
      }
      frameID = requestAnimationFrame(tick);
    };
    frameID = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameID);
  }, [audioAvailable, playing]);

  const seek = (nextTimeMs: number) => {
    const bounded = boundedYouAndAizuTime(nextTimeMs);
    setTimeMs(bounded);
    anchorRef.current = { wallMs: performance.now(), mediaMs: bounded };
    if (audioAvailable && audioRef.current) {
      try {
        audioRef.current.currentTime = bounded / 1000;
      } catch {
        setAudioAvailable(false);
      }
    }
  };

  const togglePlayback = async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const startTimeMs = timeMs >= YOU_AND_AIZU_DURATION_MS ? 0 : timeMs;
    if (startTimeMs !== timeMs) seek(startTimeMs);
    if (audioAvailable && audioRef.current) {
      try {
        await audioRef.current.play();
      } catch {
        setAudioAvailable(false);
      }
    }
    anchorRef.current = { wallMs: performance.now(), mediaMs: startTimeMs };
    setPlaying(true);
  };

  return (
    <main className="aizu-page" style={{ "--aizu-accent": cue.accent } as CSSProperties}>
      <audio
        ref={audioRef}
        preload="metadata"
        src={import.meta.env.DEV
          ? "/__lyricstage_showcase_audio"
          : "/api/showcase/you-and-aizu/audio"}
        onError={() => setAudioAvailable(false)}
        onEnded={() => {
          setTimeMs(YOU_AND_AIZU_DURATION_MS);
          setPlaying(false);
        }}
      />
      <section className="aizu-stage" aria-label="You & 合図视觉演示">
        <ShaderStage timeMs={timeMs} reduceMotion={reduceMotion} />
        <div className="aizu-paper" aria-hidden="true" />
        <header className="aizu-masthead">
          <div>
            <span>LYRICSTAGE / SONG STUDY 01</span>
            <strong>音乃瀬奏</strong>
          </div>
          <div className="aizu-counter">
            <span>{formatTime(timeMs)}</span>
            <span>{formatTime(YOU_AND_AIZU_DURATION_MS)}</span>
          </div>
        </header>

        <div className="aizu-title-lockup" aria-label="You and 合図">
          <span className="aizu-title-you">YOU</span>
          <span className="aizu-title-amp">&</span>
          <span className="aizu-title-aizu">合図</span>
        </div>

        <div className="aizu-cue" key={cue.id}>
          <span>{cue.label}</span>
          <p>{cue.description}</p>
        </div>

        <div className="aizu-week" aria-label="一周的歌词母题">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
            <span key={`${day}-${index}`} data-active={youAndAizuProgress(timeMs) * 7 >= index || undefined}>{day}</span>
          ))}
        </div>

        <footer className="aizu-controls">
          <button type="button" className="aizu-play" onClick={() => void togglePlayback()}>
            {playing ? "暂停视觉" : "播放视觉"}
          </button>
          <input
            type="range"
            min={0}
            max={YOU_AND_AIZU_DURATION_MS}
            step={100}
            value={Math.round(timeMs)}
            onChange={(event) => seek(event.currentTarget.valueAsNumber)}
            aria-label="演示时间轴"
          />
          <label className="aizu-reduce-motion">
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(event) => setReduceMotion(event.currentTarget.checked)}
            />
            <span>减少动态</span>
          </label>
        </footer>
      </section>

      <aside className="aizu-score" aria-label="歌词意象分镜">
        <div>
          <span>CONCEPT</span>
          <h1>一周云海上的<br />双向合图</h1>
          <p>把晨间提示、标准音、连奏步伐、两人暗号和一周循环压进同一个平面视差世界。</p>
        </div>
        <ol>
          {YOU_AND_AIZU_CUES.map((candidate, index) => (
            <li key={candidate.id} data-active={candidate.id === cue.id || undefined}>
              <button type="button" onClick={() => seek(candidate.fromMs)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{candidate.label}</strong>
                <small>{formatTime(candidate.fromMs)}</small>
              </button>
            </li>
          ))}
        </ol>
        <p className="aizu-note">
          程序化视觉草图 · {audioAvailable ? "Bilibili DASH 音频驱动" : "静音时钟"} · 本地确定性运行
        </p>
      </aside>
    </main>
  );
}
