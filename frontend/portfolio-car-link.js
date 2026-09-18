import * as THREE from './lib/three/three.module.js';
import { GLTFLoader } from './lib/three/GLTFLoader.js';

const canvas = document.querySelector('[data-portfolio-car]');
const card = canvas?.closest('.portfolio-car-link');
const diagnostic = { status: canvas && card ? 'loading' : 'missing', destination: card?.href || null, model: 'original-off-road-car' };

window.render_game_to_text = () => JSON.stringify({
  screen: 'blog-home',
  interactive: { type: '3d-portfolio-link', ...diagnostic }
});

if (canvas && card) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  let frame = 0;
  let visible = true;
  let model;
  let lastTime = performance.now();

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    camera.position.set(5.4, 3.6, 6.4);
    camera.lookAt(0, 0.35, 0);

    scene.add(new THREE.HemisphereLight(0xfff7df, 0x594937, 2.55));
    const key = new THREE.DirectionalLight(0xffffff, 3.8);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8b61, 1.65);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const draw = (time) => {
      frame = 0;
      if (!visible || document.hidden) return;
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      if (model && !reducedMotion) model.rotation.y += delta * 0.28;
      renderer.render(scene, camera);
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };

    window.advanceTime = (milliseconds) => {
      if (model) model.rotation.y += Math.max(0, milliseconds) / 1000 * 0.28;
      renderer.render(scene, camera);
    };

    new ResizeObserver(() => {
      resize();
      if (reducedMotion) renderer.render(scene, camera);
    }).observe(canvas);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(draw);
      } else if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }, { rootMargin: '120px' });
    visibilityObserver.observe(card);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && visible && !frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(draw);
      }
    });

    new GLTFLoader().load('./assets/portfolio-car/default.glb', (gltf) => {
      model = gltf.scene;
      let wheelTemplate = null;
      model.traverse((node) => {
        if (!wheelTemplate && /^wheelContainer/i.test(node.name)) wheelTemplate = node;
      });
      if (wheelTemplate) {
        const wheelPositions = [
          [0.90, 0.20, 0.75, Math.PI],
          [0.90, 0.20, -0.75, 0],
          [-0.90, 0.20, 0.75, Math.PI],
          [-0.90, 0.20, -0.75, 0]
        ];
        wheelTemplate.removeFromParent();
        wheelPositions.forEach(([x, y, z, rotationY]) => {
          const wheel = wheelTemplate.clone(true);
          wheel.position.set(x, y, z);
          wheel.traverse((part) => {
            if (/^wheelSuspension/i.test(part.name)) part.visible = false;
          });
          wheel.rotation.y = rotationY;
          model.add(wheel);
        });
        diagnostic.wheels = 4;
        diagnostic.pose = 'resting';
      }
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 2.65 / Math.max(size.x, size.y, size.z);
      model.position.sub(center);
      model.scale.setScalar(scale);
      model.rotation.set(-0.04, -0.62, 0.02);
      model.position.y = -0.04;
      scene.add(model);
      resize();
      renderer.render(scene, camera);
      card.classList.add('portfolio-car-ready');
      diagnostic.status = 'ready';
      if (visible && !reducedMotion && !frame) frame = requestAnimationFrame(draw);
    }, undefined, () => {
      card.classList.add('portfolio-car-error');
      diagnostic.status = 'error';
    });
  } catch {
    card.classList.add('portfolio-car-error');
    diagnostic.status = 'error';
  }
}
