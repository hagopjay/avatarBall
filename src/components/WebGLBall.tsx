import { useEffect, useRef, useState } from 'react';
import { Settings2, Pause, Play, Maximize2, Minimize2 } from 'lucide-react';

interface ShaderProgramInfo {
  program: WebGLProgram;
  attribLocations: {
    vertexPosition: number;
  };
  uniformLocations: {
    resolution: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
  };
}

export default function WebGLBall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
      gl_Position = aVertexPosition;
    }
  `;

  const fsSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;

    float hash(float n) {
      return fract(sin(n) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n = i.x + i.y * 157.0;
      return mix(
        mix(hash(n), hash(n + 1.0), f.x),
        mix(hash(n + 157.0), hash(n + 158.0), f.x),
        f.y
      );
    }

    float sphere(vec3 p, float r) {
      return length(p) - r;
    }

    vec3 getDiffuseLight(vec3 p, vec3 n, vec3 lightPos, vec3 lightColor) {
      vec3 l = normalize(lightPos - p);
      float diff = max(dot(n, l), 0.0);
      float dist = length(lightPos - p);
      return lightColor * diff / (1.0 + dist * dist * 0.1);
    }

    vec3 getComplexColor() {
      float t = time * 0.2;
      vec3 col1 = vec3(0.7, 0.2, 0.3);
      vec3 col2 = vec3(0.2, 0.5, 0.8);
      vec3 col3 = vec3(0.3, 0.8, 0.4);
      vec3 col4 = vec3(0.9, 0.6, 0.1);
      
      float noise1 = noise(vec2(t * 0.5, 0.0));
      float noise2 = noise(vec2(t * 0.3 + 100.0, 0.0));
      
      return mix(
        mix(col1, col2, noise1),
        mix(col3, col4, noise2),
        sin(t) * 0.5 + 0.5
      );
    }

    vec2 getCornerPosition(float corner) {
      if (corner < 1.0) return vec2(150.0, 150.0);
      if (corner < 2.0) return vec2(resolution.x - 150.0, 150.0);
      if (corner < 3.0) return vec2(resolution.x - 150.0, resolution.y - 150.0);
      return vec2(150.0, resolution.y - 150.0);
    }

    vec2 getPosition(float t) {
      float speedVar = sin(t * 0.1) * 0.5 + 1.0;
      t *= speedVar;
      
      float corner = mod(floor(t), 4.0);
      float nextCorner = mod(corner + 1.0, 4.0);
      float blend = smoothstep(0.0, 1.0, fract(t));
      
      vec2 currentPos = getCornerPosition(corner);
      vec2 nextPos = getCornerPosition(nextCorner);
      
      vec2 offset = vec2(
        sin(t * 3.0) * 20.0,
        cos(t * 2.0) * 20.0
      );
      
      return mix(currentPos, nextPos, blend) + offset;
    }

    float getTrail(vec2 uv, vec2 pos, float width) {
      float trail = 0.0;
      for(float i = 0.0; i < 10.0; i++) {
        float t = time - i * 0.05;
        vec2 trailPos = getPosition(t);
        float dist = length(uv - trailPos/resolution.y + resolution.x/resolution.y * 0.5);
        trail += smoothstep(width, 0.0, dist) * (1.0 - i/10.0) * 0.1;
      }
      return trail;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - resolution.xy * 0.5) / resolution.y;
      vec2 ballPos = getPosition(time * 0.3);
      vec2 normalizedBallPos = ballPos / resolution.y - resolution.x/resolution.y * 0.5;
      
      float bounce = sin(time * 4.0) * 0.02 + sin(time * 6.0) * 0.01;
      float pulse = 1.0 + sin(time * 2.0) * 0.05 + sin(time * 3.0) * 0.02;
      
      vec2 offsetUV = uv - normalizedBallPos;
      float trail = getTrail(uv, ballPos, 0.1);
      
      vec3 ro = vec3(offsetUV, -2.0);
      vec3 rd = normalize(vec3(0.0, 0.0, 1.0));
      float radius = 0.2 * pulse;
      
      float d = sphere(ro + vec3(0.0, bounce, 2.0), radius);
      
      vec3 color = vec3(0.0);
      
      if (d < 0.0) {
        vec3 p = ro + rd * (2.0 - d);
        vec3 n = normalize(p);
        
        vec3 lightPos1 = vec3(2.0 * sin(time), 2.0 * cos(time), -3.0);
        vec3 lightPos2 = vec3(-2.0 * cos(time), 1.0, -1.0);
        vec3 lightCol1 = vec3(1.0, 0.9, 0.8);
        vec3 lightCol2 = vec3(0.8, 0.9, 1.0);
        
        vec3 diff1 = getDiffuseLight(p, n, lightPos1, lightCol1);
        vec3 diff2 = getDiffuseLight(p, n, lightPos2, lightCol2);
        
        vec3 baseColor = getComplexColor();
        float metallic = noise(vec2(time * 0.1, 0.0)) * 0.5 + 0.5;
        vec3 specular = pow(max(dot(reflect(-normalize(lightPos1 - p), n), rd), 0.0), 32.0) * vec3(1.0);
        
        color = baseColor * (diff1 * 0.6 + diff2 * 0.4) + specular * metallic;
        
        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
        color += fresnel * vec3(0.2, 0.3, 0.4);
        
        float irid = sin(dot(n, vec3(1.0)) * 10.0 + time) * 0.5 + 0.5;
        color += vec3(irid * 0.1, irid * 0.2, irid * 0.3);
      }
      
      color += trail * getComplexColor() * 0.5;
      color = color / (1.0 + color);
      color = pow(color, vec3(0.4545));
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const initShaderProgram = (gl: WebGLRenderingContext) => {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

    if (!vertexShader || !fragmentShader) return null;

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) return null;

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(shaderProgram));
      return null;
    }

    return shaderProgram;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    const shaderProgram = initShaderProgram(gl);
    if (!shaderProgram) return;

    const programInfo: ShaderProgramInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      },
      uniformLocations: {
        resolution: gl.getUniformLocation(shaderProgram, 'resolution'),
        time: gl.getUniformLocation(shaderProgram, 'time'),
      },
    };

    const positions = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const render = () => {
      if (isPaused) return;

      resizeCanvas();
      
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(programInfo.program);

      gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );

      gl.uniform2f(programInfo.uniformLocations.resolution, canvas.width, canvas.height);
      gl.uniform1f(programInfo.uniformLocations.time, (Date.now() - startTimeRef.current) / 1000);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animationRef.current = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resizeCanvas);
    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPaused]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      />
      
      <div 
        className={`absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-md mx-auto bg-black/50 backdrop-blur-md rounded-lg p-4 flex items-center justify-between text-white">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title={isPaused ? 'Play' : 'Pause'}
          >
            {isPaused ? <Play size={20} /> : <Pause size={20} />}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>

          <button
            onClick={() => startTimeRef.current = Date.now()}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Reset Animation"
          >
            <Settings2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}