import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LiquidLevel } from './tienda-liquido.mjs';

const instances = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Reflejos de dos luces de estudio, evaluados por píxel: sin HDRI,
// mapas de entorno, sombras ni trazado de rayos.
function studioFinish(shader, shell = false) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
    vec3 studioView = normalize(vViewPosition);
    vec3 studioR = reflect(-studioView, normal);
    float studioFront = smoothstep(0.0, 0.35, studioR.z);
    float studioStrip = exp(-pow((studioR.x + 0.58) / 0.105, 2.0))
                      + 0.5 * exp(-pow((studioR.x - 0.75) / 0.065, 2.0));
    studioStrip *= studioFront * exp(-pow(studioR.y / 0.92, 6.0));
    outgoingLight += vec3(1.0, 0.97, 0.91) * studioStrip * ${shell ? '0.9' : '0.21'};
    ${shell ? 'diffuseColor.a = 0.045 + 0.28 * pow(1.0 - abs(dot(normal, studioView)), 3.0) + 0.36 * studioStrip;' : ''}
    #include <opaque_fragment>
  `);
}
function disposeTree(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}
function mount(container) {
  if (instances.has(container)) return;
  const state = { disposed: false, visible: false, started: false };
  instances.set(container, state);
  const observer = new IntersectionObserver(entries => {
    state.visible = entries[0].isIntersecting;
    if (state.visible) state.wake?.(); else state.pause?.();
    if (state.visible && !state.started && container.clientWidth > 10 && container.clientHeight > 10) {
      state.started = true;
      start(container, state).catch(error => {
        if (!state.disposed) {
          console.error('Visor Naranpol:', error); state.release?.(); container.replaceChildren();
          const message = document.createElement('p'); message.className = 'producto-3d-error';
          message.textContent = 'No se pudo abrir la vista 3D. Recargá la página para intentarlo de nuevo.';
          container.append(message);
        }
      });
    }
  }, { threshold: 0.01 });
  observer.observe(container);
  state.dispose = () => { state.disposed = true; observer.disconnect(); state.release?.(); instances.delete(container); };
}
async function start(container, state) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.setClearColor(0, 0);
  const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Botella Naranpol ${container.dataset.sabor || ''} en 3D. Arrastrá para girar. Flechas para girar e inclinar; Inicio para volver al frente.`);
  const status = document.createElement('p'); status.className = 'producto-3d-status'; status.setAttribute('role', 'status'); status.textContent = 'Cargando botella…';
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); status.textContent = 'Se interrumpió la vista 3D. Recargá la página.'; });
  const controls = document.createElement('div'); controls.className = 'producto-3d-controles';
  const button = (label, title, action) => {
    const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
    element.title = title; element.setAttribute('aria-label', title); element.addEventListener('click', action); controls.append(element);
  };
  container.replaceChildren(canvas, status, controls);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x626b7c, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe4edff, 0.6); rim.position.set(3, 2, -3); scene.add(rim);
  const turntable = new THREE.Group(); turntable.rotation.order = 'YXZ'; scene.add(turntable);
  const bottle = new THREE.Group(); turntable.add(bottle);
  let angleX = 0, angleY = 0, inertia = 0, lastX = 0, lastY = 0, pointer = null, zoom = 1;
  const planeUniform = { value: new THREE.Vector4(0, 1, 0, 0.113) };
  let fluid, surface, fill, ready = false, raf = 0, lastTime = 0, oldPitch = 0, oldYaw = 0;
  let sloshX = 0, sloshZ = 0, speedX = 0, speedZ = 0, wakeUntil = 0;
  const localUp = new THREE.Vector3(), inverse = new THREE.Quaternion();
  const wake = () => {
    wakeUntil = performance.now() + 2400;
    if (ready && !state.disposed && state.visible && !document.hidden && !raf) raf = requestAnimationFrame(animate);
  };
  state.wake = wake;
  state.pause = () => { cancelAnimationFrame(raf); raf = 0; };
  const resize = () => {
    const width = container.clientWidth, height = container.clientHeight;
    if (width < 10 || height < 10 || state.disposed) return;
    renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.position.set(0, 0.08, Math.max(5.7, 3.9 / camera.aspect) / zoom);
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); wake();
  };
  const reset = () => { angleX = angleY = inertia = sloshX = sloshZ = speedX = speedZ = 0; zoom = 1; resize(); };
  button('↺', 'Volver al frente', reset);
  button('−', 'Alejar botella', () => { zoom = Math.max(0.8, zoom - 0.1); resize(); });
  button('+', 'Acercar botella', () => { zoom = Math.min(1.3, zoom + 0.1); resize(); });
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
  let released = false;
  state.release = () => {
    if (released) return; released = true; cancelAnimationFrame(raf); resizeObserver.disconnect();
    ready = false; disposeTree(bottle); renderer.dispose(); renderer.forceContextLoss();
  };
  // Leer el perfil primero: si falta, no dejar una carga de GLB huérfana.
  const response = await fetch(container.dataset.liquido || container.dataset.modelo.replace(/\.glb$/i, '.liquid.json'));
  if (!response.ok) throw new Error('Falta el perfil interior del líquido.');
  const metadata = await response.json();
  if (state.disposed || released) return;
  const gltf = await new GLTFLoader().loadAsync(container.dataset.modelo);
  if (state.disposed || released) { disposeTree(gltf.scene); return; }
  // Coordenadas glTF globales también para GLB que exporta Blender.
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(part => {
    if (!part.isMesh) return;
    const mesh = new THREE.Mesh(part.geometry.clone().applyMatrix4(part.matrixWorld), part.material);
    mesh.name = part.userData.naranpolRole || part.name.replace(/\.\d+$/, ''); mesh.userData = { ...part.userData };
    if (['Bottle', 'NeckSupport', 'NeckThread'].includes(mesh.name)) {
      mesh.material.depthWrite = false;
      mesh.material.onBeforeCompile = shader => studioFinish(shader, true);
      mesh.material.customProgramCacheKey = () => 'naranpol-studio-pet-v2';
    }
    if (mesh.material.map) mesh.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    bottle.add(mesh); if (mesh.name === 'Liquid') fluid = mesh;
  });
  gltf.scene.traverse(part => { if (part.geometry) part.geometry.dispose(); });
  if (!fluid) throw new Error('El GLB no contiene la malla Liquid.');
  if (fluid.material.transparent) { fluid.material.depthWrite = false; fluid.renderOrder = 1; }
  bottle.children.filter(mesh => ['Bottle', 'NeckSupport', 'NeckThread'].includes(mesh.name)).forEach(mesh => { mesh.renderOrder = 3; });
  fill = new LiquidLevel(metadata.profile, metadata.fillHeight);
  fluid.material.onBeforeCompile = shader => {
    studioFinish(shader);
    shader.uniforms.uFillPlane = planeUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBottlePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBottlePosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBottlePosition;\nuniform vec4 uFillPlane;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (dot(vBottlePosition, uFillPlane.xyz) > uFillPlane.w) discard;');
  };
  fluid.material.customProgramCacheKey = () => 'naranpol-contained-liquid-v1';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 49), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3 * 49), 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.25);
  const indices = [];
  for (let i = 0; i < 48; i++) indices.push(0, 1 + i, 1 + (i + 1) % 48);
  geometry.setIndex(indices);
  surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: fluid.material.color.clone(), transparent: fluid.material.transparent, opacity: fluid.material.opacity, depthWrite: !fluid.material.transparent, roughness: 0.24, metalness: 0, side: THREE.DoubleSide }));
  surface.renderOrder = fluid.material.transparent ? 2 : 0;
  surface.name = 'LiquidSurface'; bottle.add(surface);
  const bounds = new THREE.Box3().setFromObject(bottle), size = bounds.getSize(new THREE.Vector3());
  bottle.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-1);
  turntable.scale.setScalar(2.8 / size.y); status.textContent = '';
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null) return;
    pointer = event.pointerId; lastX = event.clientX; lastY = event.clientY; inertia = 0;
    canvas.setPointerCapture(pointer); canvas.classList.add('arrastrando'); wake();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const dx = event.clientX - lastX, dy = event.clientY - lastY;
    angleY += dx * 0.009; angleX = THREE.MathUtils.clamp(angleX + dy * 0.006, -0.62, 0.62);
    inertia = Math.max(-0.055, Math.min(0.055, dx * 0.002)); lastX = event.clientX; lastY = event.clientY; wake();
  });
  const releasePointer = event => {
    if (event.pointerId !== pointer) return;
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    pointer = null; canvas.classList.remove('arrastrando'); wake();
  };
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', () => { pointer = null; canvas.classList.remove('arrastrando'); });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') reset();
    if (event.key === 'ArrowLeft') angleY -= 0.16;
    if (event.key === 'ArrowRight') angleY += 0.16;
    if (event.key === 'ArrowUp') angleX = Math.max(-0.62, angleX - 0.10);
    if (event.key === 'ArrowDown') angleX = Math.min(0.62, angleX + 0.10);
    wake();
  });
  function updateSurface(normal, offset) {
    const positions = surface.geometry.attributes.position, normals = surface.geometry.attributes.normal;
    positions.setXYZ(0, 0, offset / normal.y, 0); normals.setXYZ(0, normal.x, normal.y, normal.z);
    for (let i = 0; i < 48; i++) {
      const angle = i / 48 * 2 * Math.PI, x = Math.sin(angle), z = Math.cos(angle);
      const edge = fill.edge(normal, offset, x, z);
      const px = edge.r * x, pz = edge.r * z;
      positions.setXYZ(1 + i, px, (offset - normal.x * px - normal.z * pz) / normal.y, pz);
      normals.setXYZ(1 + i, normal.x, normal.y, normal.z);
    }
    positions.needsUpdate = true; normals.needsUpdate = true;
  }
  function animate(time) {
    raf = 0;
    if (state.disposed || released || !state.visible || document.hidden || time >= wakeUntil) return;
    if (time - lastTime < 1000 / 30) { raf = requestAnimationFrame(animate); return; }
    const dt = Math.min(1 / 20, Math.max(1 / 240, (time - lastTime) / 1000)); lastTime = time;
    if (pointer === null && !reducedMotion) { angleY += inertia * dt * 60; inertia *= Math.exp(-7 * dt); }
    const damping = reducedMotion ? 1 : 1 - Math.exp(-14 * dt);
    turntable.rotation.x += (angleX - turntable.rotation.x) * damping;
    turntable.rotation.y += (angleY - turntable.rotation.y) * damping;
    const pitchChange = turntable.rotation.x - oldPitch, yawChange = turntable.rotation.y - oldYaw;
    oldPitch = turntable.rotation.x; oldYaw = turntable.rotation.y;
    if (!reducedMotion) {
      speedX += yawChange * 1.7; speedZ -= pitchChange * 2.8;
      speedX += (-45 * sloshX - 7 * speedX) * dt; speedZ += (-45 * sloshZ - 7 * speedZ) * dt;
      sloshX = THREE.MathUtils.clamp(sloshX + speedX * dt, -0.12, 0.12);
      sloshZ = THREE.MathUtils.clamp(sloshZ + speedZ * dt, -0.12, 0.12);
    }
    inverse.copy(turntable.quaternion).invert(); localUp.set(0, 1, 0).applyQuaternion(inverse);
    localUp.x += sloshX; localUp.z += sloshZ; localUp.normalize();
    const level = fill.offsetForVolume(localUp); planeUniform.value.set(localUp.x, localUp.y, localUp.z, level);
    updateSurface(localUp, level); renderer.render(scene, camera);
    if (!reducedMotion) raf = requestAnimationFrame(animate);
  }
  ready = true; wake();
}
function montarTodos() {
  for (const [element, state] of instances) if (!element.isConnected) state.dispose();
  document.querySelectorAll('.producto-3d[data-modelo]').forEach(mount);
}
window.Naranpol3D = { montarTodos };
document.addEventListener('change', event => {
  if (!event.target.matches('[data-selector-botella]')) return;
  const flavor = event.target.value;
  if (!['naranja', 'pomelo'].includes(flavor)) return;
  const section = event.target.closest('.tienda-botella');
  const old = section.querySelector('.producto-3d');
  instances.get(old)?.dispose();
  const replacement = document.createElement('div'); replacement.className = 'producto-3d';
  replacement.dataset.modelo = `models/naranpol_${flavor}.glb`;
  replacement.dataset.sabor = flavor === 'naranja' ? 'Naranja' : 'Pomelo';
  old.replaceWith(replacement);
  section.querySelector('[data-nombre-botella]').textContent = `Naranpol ${replacement.dataset.sabor}`;
  montarTodos();
});
window.addEventListener('naranpol:catalogo-renderizado', montarTodos);
window.addEventListener('pagehide', event => { if (!event.persisted) for (const state of instances.values()) state.dispose(); });
document.addEventListener('visibilitychange', () => {
  for (const state of instances.values()) if (document.hidden) state.pause?.(); else state.wake?.();
});
new MutationObserver(() => { for (const [element, state] of instances) if (!element.isConnected) state.dispose(); }).observe(document.body, { childList: true, subtree: true });
montarTodos();
