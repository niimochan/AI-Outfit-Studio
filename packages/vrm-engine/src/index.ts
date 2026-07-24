import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

export interface VrmLoadResult {
  fileName: string;
  specVersion: string;
  height: number;
  objectCount: number;
}

export interface VrmStageStats {
  fps: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
}

export interface VrmStageOptions {
  onStats?: (stats: VrmStageStats) => void;
}

export class VrmStage {
  private readonly host: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly loader: GLTFLoader;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly options: VrmStageOptions;
  private readonly initialCameraPosition = new THREE.Vector3(0, 1.35, 3.2);
  private readonly initialTarget = new THREE.Vector3(0, 1.05, 0);

  private currentVrm: VRM | null = null;
  private currentObjectUrl: string | null = null;
  private animationFrameId = 0;
  private disposed = false;
  private frameCounter = 0;
  private statsElapsed = 0;

  constructor(host: HTMLElement, options: VrmStageOptions = {}) {
    this.host = host;
    this.options = options;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1219);
    this.scene.fog = new THREE.Fog(0x0c1219, 8, 18);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.copy(this.initialCameraPosition);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.tabIndex = 0;
    this.host.prepend(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 16;
    this.controls.target.copy(this.initialTarget);
    this.controls.update();
    this.controls.saveState();

    this.loader = new GLTFLoader();
    this.loader.crossOrigin = 'anonymous';
    this.loader.register((parser) => new VRMLoaderPlugin(parser));

    this.addEnvironment();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.animate();
  }

  async loadFile(file: File, onProgress?: (value: number | null) => void): Promise<VrmLoadResult> {
    if (this.disposed) {
      throw new Error('3Dビューアはすでに破棄されています。');
    }
    if (!file.name.toLowerCase().endsWith('.vrm')) {
      throw new Error('VRMファイルではありません。');
    }

    this.clearCurrentModel();
    this.currentObjectUrl = URL.createObjectURL(file);

    try {
      const gltf = await this.loader.loadAsync(this.currentObjectUrl, (event) => {
        const ratio = event.total > 0 ? event.loaded / event.total : null;
        onProgress?.(ratio);
      });

      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) {
        throw new Error('VRM拡張を検出できませんでした。ファイルが破損している可能性があります。');
      }

      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      VRMUtils.combineMorphs(vrm);
      VRMUtils.rotateVRM0(vrm);

      vrm.scene.traverse((object) => {
        object.frustumCulled = false;
        object.castShadow = true;
        object.receiveShadow = true;
      });

      this.currentVrm = vrm;
      this.scene.add(vrm.scene);
      this.fitCameraToModel();
      onProgress?.(1);

      const bounds = new THREE.Box3().setFromObject(vrm.scene);
      const size = bounds.getSize(new THREE.Vector3());
      let objectCount = 0;
      vrm.scene.traverse(() => {
        objectCount += 1;
      });

      const meta = vrm.meta as { metaVersion?: string } | undefined;
      const specVersion = meta?.metaVersion === '0' ? 'VRM 0.x' : 'VRM 1.0';

      return {
        fileName: file.name,
        specVersion,
        height: size.y,
        objectCount,
      };
    } catch (error) {
      this.clearCurrentModel();
      throw error;
    }
  }

  fitCameraToModel(): void {
    const model = this.currentVrm?.scene;
    if (!model) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) {
      return;
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.max((maxDimension * 0.58) / Math.tan(verticalFov / 2), 1.2);

    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + size.y * 0.04, center.z + distance * 1.12);
    this.camera.near = Math.max(distance / 1000, 0.005);
    this.camera.far = Math.max(distance * 20, 50);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  resetCamera(): void {
    this.camera.position.copy(this.initialCameraPosition);
    this.controls.target.copy(this.initialTarget);
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.clearCurrentModel();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private addEnvironment(): void {
    const hemisphere = new THREE.HemisphereLight(0xcfe7ff, 0x26313d, 1.25);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffffff, Math.PI * 0.72);
    keyLight.position.set(3.5, 5.5, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -2;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6aa8ff, 1.15);
    fillLight.position.set(-4, 2.5, 1.5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x57e5cf, 1.3);
    rimLight.position.set(1, 3, -4);
    this.scene.add(rimLight);

    const grid = new THREE.GridHelper(20, 40, 0x2a4454, 0x172731);
    grid.position.y = 0;
    this.scene.add(grid);

    const groundMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.2 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.002;
    this.scene.add(ground);
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private clearCurrentModel(): void {
    if (this.currentVrm) {
      this.scene.remove(this.currentVrm.scene);
      VRMUtils.deepDispose(this.currentVrm.scene);
      this.currentVrm = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  private animate = (): void => {
    if (this.disposed) {
      return;
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.currentVrm?.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.frameCounter += 1;
    this.statsElapsed += delta;
    if (this.statsElapsed >= 0.5) {
      const renderInfo = this.renderer.info;
      this.options.onStats?.({
        fps: Math.round(this.frameCounter / this.statsElapsed),
        triangles: renderInfo.render.triangles,
        drawCalls: renderInfo.render.calls,
        geometries: renderInfo.memory.geometries,
        textures: renderInfo.memory.textures,
      });
      this.frameCounter = 0;
      this.statsElapsed = 0;
    }
  };
}
