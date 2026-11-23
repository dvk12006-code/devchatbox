import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh } from 'three'

export type CreatureState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'working'
  | 'sleeping'
  | 'notification'

interface CreatureProps {
  state: CreatureState
  cursor: { x: number; y: number }
  reducedMotion: boolean
}

function Particles({ state, reducedMotion }: { state: CreatureState; reducedMotion: boolean }) {
  const refs = useRef<(Mesh | null)[]>([])
  const particles = Array.from({ length: 14 }, (_, index) => {
    const angle = (index / 14) * Math.PI * 2
    const radius = 1.15 + (index % 3) * 0.12
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * 0.84,
      z: Math.sin(angle * 2) * 0.18,
      phase: index * 0.72,
    }
  })

  useFrame(({ clock }) => {
    if (reducedMotion) return
    refs.current.forEach((particle, index) => {
      if (!particle) return
      const speed = state === 'thinking' || state === 'working' ? 1.4 : 0.55
      particle.position.y = particles[index].y + Math.sin(clock.elapsedTime * speed + particles[index].phase) * 0.045
      const pulse = 0.55 + (Math.sin(clock.elapsedTime * speed + particles[index].phase) + 1) * 0.25
      particle.scale.setScalar(pulse)
    })
  })

  return (
    <group>
      {particles.map((particle, index) => (
        <mesh
          key={index}
          ref={(element) => { refs.current[index] = element }}
          position={[particle.x, particle.y, particle.z]}
        >
          <sphereGeometry args={[index % 4 === 0 ? 0.024 : 0.012, 8, 8]} />
          <meshBasicMaterial color={index % 4 === 0 ? '#e79a58' : '#a9afb3'} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  )
}

function Companion({ state, cursor, reducedMotion }: CreatureProps) {
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const leftArm = useRef<Group>(null)
  const rightArm = useRef<Group>(null)
  const chestLight = useRef<Mesh>(null)

  useFrame(({ clock }, delta) => {
    if (reducedMotion) return
    const elapsed = clock.elapsedTime
    const movementScale = state === 'sleeping' ? 0.22 : state === 'working' ? 1.45 : state === 'thinking' ? 1.15 : 1
    if (body.current) {
      const targetY = state === 'sleeping' ? -0.04 : state === 'notification' ? 0.1 : 0
      body.current.position.y += (targetY + Math.sin(elapsed * 1.05 * movementScale) * 0.085 - body.current.position.y) * Math.min(delta * 2.5, 1)
      body.current.rotation.y += ((cursor.x * 0.23 + Math.sin(elapsed * 0.36) * 0.07) - body.current.rotation.y) * Math.min(delta * 2, 1)
      body.current.rotation.z += ((state === 'working' ? Math.sin(elapsed * 2.4) * 0.05 : 0) - body.current.rotation.z) * Math.min(delta * 2, 1)
    }
    if (head.current) {
      const sleepingTilt = state === 'sleeping' ? 0.25 : 0
      const alertTilt = state === 'notification' ? Math.sin(elapsed * 5) * 0.06 : 0
      head.current.rotation.x += ((-cursor.y * 0.12 + sleepingTilt + alertTilt) - head.current.rotation.x) * Math.min(delta * 2, 1)
      head.current.rotation.y += ((cursor.x * 0.2 + Math.sin(elapsed * 0.55) * 0.09) - head.current.rotation.y) * Math.min(delta * 2.3, 1)
    }
    if (leftArm.current && rightArm.current) {
      const gesture = state === 'speaking' ? Math.sin(elapsed * 5) * 0.11 : state === 'thinking' ? Math.sin(elapsed * 2) * 0.06 : 0
      leftArm.current.rotation.z += ((0.1 + gesture) - leftArm.current.rotation.z) * Math.min(delta * 3, 1)
      rightArm.current.rotation.z += ((-0.1 - gesture) - rightArm.current.rotation.z) * Math.min(delta * 3, 1)
    }
    if (chestLight.current) {
      const frequency = state === 'listening' ? 5 : state === 'thinking' ? 8 : state === 'notification' ? 10 : 2
      chestLight.current.scale.setScalar(0.9 + (Math.sin(elapsed * frequency) + 1) * 0.12)
    }
  })

  const eyeColor = state === 'sleeping' ? '#6d563e' : state === 'notification' ? '#ffb86e' : '#e69551'
  const glowColor = state === 'sleeping' ? '#493526' : state === 'notification' ? '#ffab60' : '#c9793e'
  const metal = '#767b7e'
  const shadowMetal = '#25282a'

  return (
    <group>
      <pointLight position={[0, 0.4, 1.3]} color={glowColor} intensity={state === 'sleeping' ? 0.5 : 2.5} distance={3.5} />
      <pointLight position={[-1.2, 0.2, 0.6]} color="#9ca4a7" intensity={1.2} distance={3} />
      <pointLight position={[1.1, 0.7, -0.2]} color="#b77443" intensity={2} distance={2.8} />

      <group ref={body}>
        <group ref={head} position={[0, 0.68, 0]}>
          <mesh castShadow receiveShadow scale={[0.65, 0.68, 0.53]}>
            <sphereGeometry args={[1, 40, 32]} />
            <meshPhysicalMaterial color={metal} metalness={0.93} roughness={0.21} clearcoat={0.9} clearcoatRoughness={0.14} />
          </mesh>
          <mesh position={[0, -0.04, 0.405]} scale={[0.53, 0.22, 0.11]}>
            <sphereGeometry args={[1, 32, 24]} />
            <meshStandardMaterial color="#111315" metalness={0.75} roughness={0.28} />
          </mesh>
          <mesh position={[0, -0.04, 0.51]} scale={[0.42, 0.105, 0.04]}>
            <sphereGeometry args={[1, 32, 20]} />
            <meshPhysicalMaterial color="#070809" metalness={0.4} roughness={0.12} clearcoat={1} />
          </mesh>
          <mesh position={[-0.205, -0.015, 0.555]} scale={[0.102, 0.036, 0.025]}>
            <sphereGeometry args={[1, 20, 16]} />
            <meshStandardMaterial color={eyeColor} emissive={glowColor} emissiveIntensity={2.5} toneMapped={false} />
          </mesh>
          <mesh position={[0.205, -0.015, 0.555]} scale={[0.102, 0.036, 0.025]}>
            <sphereGeometry args={[1, 20, 16]} />
            <meshStandardMaterial color={eyeColor} emissive={glowColor} emissiveIntensity={2.5} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.31, 0.43]} scale={[0.12, 0.045, 0.035]}>
            <sphereGeometry args={[1, 20, 16]} />
            <meshStandardMaterial color="#b07d5a" metalness={0.8} roughness={0.25} emissive="#633a20" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, 0.64, -0.03]}>
            <cylinderGeometry args={[0.035, 0.045, 0.31, 12]} />
            <meshStandardMaterial color={shadowMetal} metalness={0.85} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.81, -0.03]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[-0.62, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.16, 0.19, 0.12, 24]} />
            <meshStandardMaterial color={shadowMetal} metalness={0.92} roughness={0.25} />
          </mesh>
          <mesh position={[0.62, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.16, 0.19, 0.12, 24]} />
            <meshStandardMaterial color={shadowMetal} metalness={0.92} roughness={0.25} />
          </mesh>
          <mesh position={[-0.695, 0.02, 0.008]}>
            <torusGeometry args={[0.13, 0.025, 8, 24]} />
            <meshStandardMaterial color="#a6abad" metalness={0.95} roughness={0.2} />
          </mesh>
          <mesh position={[0.695, 0.02, 0.008]}>
            <torusGeometry args={[0.13, 0.025, 8, 24]} />
            <meshStandardMaterial color="#a6abad" metalness={0.95} roughness={0.2} />
          </mesh>
        </group>

        <mesh position={[0, -0.21, 0]} scale={[0.59, 0.7, 0.43]} castShadow receiveShadow>
          <sphereGeometry args={[1, 40, 32]} />
          <meshPhysicalMaterial color="#555b5e" metalness={0.96} roughness={0.25} clearcoat={0.75} />
        </mesh>
        <mesh position={[0, -0.16, 0.362]} scale={[0.34, 0.42, 0.1]}>
          <sphereGeometry args={[1, 32, 24]} />
          <meshStandardMaterial color="#16191a" metalness={0.8} roughness={0.28} />
        </mesh>
        <mesh ref={chestLight} position={[0, -0.16, 0.458]}>
          <sphereGeometry args={[0.095, 24, 20]} />
          <meshStandardMaterial color={eyeColor} emissive={glowColor} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.16, 0.47]}>
          <torusGeometry args={[0.14, 0.022, 8, 32]} />
          <meshStandardMaterial color="#b17d55" metalness={0.9} roughness={0.18} emissive="#5e341b" emissiveIntensity={0.35} />
        </mesh>

        <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.035, 10, 32]} />
          <meshStandardMaterial color="#a0a5a7" metalness={0.96} roughness={0.2} />
        </mesh>
        <mesh position={[0, -0.78, 0]} scale={[0.36, 0.22, 0.3]}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshStandardMaterial color="#373c3e" metalness={0.94} roughness={0.26} />
        </mesh>

        <group ref={leftArm} position={[-0.48, -0.08, 0]}>
          <mesh position={[-0.2, -0.17, 0]} rotation={[0, 0, -0.35]} castShadow>
            <capsuleGeometry args={[0.115, 0.43, 8, 16]} />
            <meshPhysicalMaterial color={metal} metalness={0.92} roughness={0.22} clearcoat={0.65} />
          </mesh>
          <mesh position={[-0.34, -0.43, 0.015]}>
            <sphereGeometry args={[0.105, 20, 16]} />
            <meshStandardMaterial color="#282c2e" metalness={0.9} roughness={0.25} />
          </mesh>
          <mesh position={[-0.36, -0.65, 0]} rotation={[0, 0, -0.1]}>
            <capsuleGeometry args={[0.09, 0.34, 8, 14]} />
            <meshStandardMaterial color="#686e71" metalness={0.96} roughness={0.24} />
          </mesh>
          <mesh position={[-0.37, -0.84, 0.04]}>
            <sphereGeometry args={[0.09, 18, 14]} />
            <meshStandardMaterial color="#303537" metalness={0.92} roughness={0.2} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.48, -0.08, 0]}>
          <mesh position={[0.2, -0.17, 0]} rotation={[0, 0, 0.35]} castShadow>
            <capsuleGeometry args={[0.115, 0.43, 8, 16]} />
            <meshPhysicalMaterial color={metal} metalness={0.92} roughness={0.22} clearcoat={0.65} />
          </mesh>
          <mesh position={[0.34, -0.43, 0.015]}>
            <sphereGeometry args={[0.105, 20, 16]} />
            <meshStandardMaterial color="#282c2e" metalness={0.9} roughness={0.25} />
          </mesh>
          <mesh position={[0.36, -0.65, 0]} rotation={[0, 0, 0.1]}>
            <capsuleGeometry args={[0.09, 0.34, 8, 14]} />
            <meshStandardMaterial color="#686e71" metalness={0.96} roughness={0.24} />
          </mesh>
          <mesh position={[0.37, -0.84, 0.04]}>
            <sphereGeometry args={[0.09, 18, 14]} />
            <meshStandardMaterial color="#303537" metalness={0.92} roughness={0.2} />
          </mesh>
        </group>
      </group>
      <Particles state={state} reducedMotion={reducedMotion} />
    </group>
  )
}

export default function Creature({ state, cursor, reducedMotion }: CreatureProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.8], fov: 34 }}
      dpr={[1, 1.7]}
      shadows="percentage"
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#d7e0e3', '#151719', 1.2]} />
      <directionalLight position={[-3, 4, 5]} intensity={3.4} color="#dfe4e5" castShadow />
      <directionalLight position={[4, 1, -3]} intensity={3} color="#b76d42" />
      <directionalLight position={[0, -2, 4]} intensity={0.8} color="#787f82" />
      <Companion state={state} cursor={cursor} reducedMotion={reducedMotion} />
    </Canvas>
  )
}
