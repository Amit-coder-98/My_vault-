import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Points } from "three";

function Dust({ color, playing }: { color: string; playing: boolean }) {
  const ref = useRef<Points>(null);
  const positions = useMemo(() => {
    const array = new Float32Array(96 * 3);
    for (let i = 0; i < 96; i++) {
      array[i * 3] = Math.sin(i * 137.5) * 9;
      array[i * 3 + 1] = Math.cos(i * 73.3) * 6;
      array[i * 3 + 2] = Math.sin(i * 11.7) * 3 - 2;
    }
    return array;
  }, []);
  useFrame((_, delta) => {
    if (ref.current && playing)
      ref.current.rotation.z += Math.min(delta, 0.05) * 0.006;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.018}
        transparent
        opacity={0.22}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export default function AmbientScene({
  color,
  playing,
}: {
  color: string;
  playing: boolean;
}) {
  return (
    <div className="ambient-scene" aria-hidden="true">
      <Canvas
        dpr={1}
        camera={{ position: [0, 0, 8], fov: 65 }}
        frameloop={playing ? "always" : "demand"}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      >
        <Dust color={color} playing={playing} />
      </Canvas>
    </div>
  );
}
