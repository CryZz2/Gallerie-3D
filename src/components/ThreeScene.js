import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// Grille / placement
const POSTER_W = 1;
const POSTER_H = 1.5;
const GAP = 0.25;
const ROW_SIZE = 6;

// Sol / marge
const FLOOR_Y = -0.8;
const CLEARANCE = 0.1;

export default function ThreeScene({ movies = [], onClickPoster }) {
    // Refs 3D
    const mountRef = useRef(null);
    const sceneRef = useRef();
    const rendererRef = useRef();
    const cameraRef = useRef();
    const controlsRef = useRef(null);
    const composerRef = useRef(null);

    // Groupes / picking / anim
    const postersGroupRef = useRef(new THREE.Group());
    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());
    const animRef = useRef(null);

    // ✅ pour éviter le warning ESLint sur onClickPoster dans l’effet d’init
    const onClickPosterRef = useRef(onClickPoster);
    useEffect(() => {
        onClickPosterRef.current = onClickPoster;
    }, [onClickPoster]);

    // Focus caméra vers un mesh
    function focusOnObject(
        mesh,
        { duration = 650, padding = 0.18 } = {},
        done
    ) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const renderer = rendererRef.current;
        if (!camera || !controls || !renderer || !mesh) return;

        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const normal = new THREE.Vector3(0, 0, 1);
        const q = new THREE.Quaternion();
        mesh.getWorldQuaternion(q);
        normal.applyQuaternion(q).normalize();

        const { clientWidth: w, clientHeight: h } = renderer.domElement;
        const aspect = w / h;
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const maxSize = Math.max(size.x, size.y / aspect);
        const dist = (maxSize / 2) / Math.tan(fov / 2) + padding;

        const camFrom = camera.position.clone();
        const camTo = center.clone().addScaledVector(normal, dist);
        const tgtFrom = controls.target.clone();
        const tgtTo = center.clone();

        if (animRef.current) cancelAnimationFrame(animRef.current);
        const t0 = performance.now();
        const ease = (x) =>
            x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

        const step = (t) => {
            const k = Math.min(1, (t - t0) / duration);
            const e = ease(k);
            camera.position.lerpVectors(camFrom, camTo, e);
            controls.target.lerpVectors(tgtFrom, tgtTo, e);
            controls.update();
            renderer.render(sceneRef.current, camera);
            if (k < 1) animRef.current = requestAnimationFrame(step);
            else done && done();
        };
        animRef.current = requestAnimationFrame(step);
    }

    // INIT scène
    useEffect(() => {
        const mount = mountRef.current;

        // Scene / camera / renderer
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x141414);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            45,
            mount.clientWidth / mount.clientHeight,
            0.1,
            100
        );
        camera.position.set(0, 1.1, 6);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        if (renderer.domElement.parentElement !== mount) {
            mount.appendChild(renderer.domElement);
        }
        rendererRef.current = renderer;

        // Lumières
        scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(3, 5, 4);
        scene.add(dir);

        // Groupe affiches
        scene.add(postersGroupRef.current);

        // Contrôles
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 2.5;
        controls.maxDistance = 12;
        controls.target.set(0, 0.6, 0);
        controlsRef.current = controls;

        // Post-processing (bloom)
        const composer = new EffectComposer(renderer);
        composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        composer.setSize(mount.clientWidth, mount.clientHeight);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(
            new THREE.Vector2(mount.clientWidth, mount.clientHeight),
            0.7,
            0.8,
            0.01
        );
        bloom.threshold = 0.2;
        composer.addPass(bloom);
        composerRef.current = composer;

        // Sol miroir (Reflector) + ombre douce + fade
        const groundGeo = new THREE.PlaneGeometry(40, 40);

        const mirror = new Reflector(groundGeo, {
            clipBias: 0.003,
            textureWidth: Math.floor(mount.clientWidth / 2),
            textureHeight: Math.floor(mount.clientHeight / 2),
            color: 0x111111
        });
        mirror.rotation.x = -Math.PI / 2;
        mirror.position.y = -0.8015;
        mirror.renderOrder = -1;
        scene.add(mirror);

        const shadowPlane = new THREE.Mesh(
            groundGeo,
            new THREE.ShadowMaterial({ opacity: 0.18 })
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -0.8;
        shadowPlane.receiveShadow = true;
        shadowPlane.renderOrder = 0;
        scene.add(shadowPlane);

        const fade = new THREE.Mesh(
            groundGeo,
            new THREE.MeshBasicMaterial({
                color: 0x0b0b0d,
                transparent: true,
                opacity: 0.25,
                depthWrite: false
            })
        );
        fade.rotation.x = -Math.PI / 2;
        fade.position.y = mirror.position.y + 0.0005;
        fade.renderOrder = 1;
        scene.add(fade);

        // Resize
        const onResize = () => {
            camera.aspect = mount.clientWidth / mount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mount.clientWidth, mount.clientHeight);
            composerRef.current?.setSize(mount.clientWidth, mount.clientHeight);
        };
        window.addEventListener("resize", onResize);

        // Picking
        const getFilmMesh = (obj) => {
            let o = obj;
            while (o && !o.userData?.film) o = o.parent;
            return o && o.userData?.film ? o : null;
        };

        const onPointerMove = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.current.setFromCamera(mouse.current, camera);
            const hits = raycaster.current.intersectObjects(
                postersGroupRef.current.children,
                true
            );
            renderer.domElement.style.cursor = hits.length ? "pointer" : "default";
        };

        const onClick = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.current.setFromCamera(mouse.current, camera);
            const hits = raycaster.current.intersectObjects(
                postersGroupRef.current.children,
                true
            );
            if (!hits.length) return;

            const filmMesh = getFilmMesh(hits[0].object);
            if (!filmMesh) return;
            const film = filmMesh.userData.film;

            // petit feedback
            filmMesh.scale.set(1.06, 1.06, 1);
            setTimeout(() => filmMesh.scale.set(1, 1, 1), 140);

            // focus + callback (via ref pour éviter le warning ESLint)
            focusOnObject(filmMesh, { duration: 650, padding: 0.22 }, () => {
                if (onClickPosterRef.current && film) onClickPosterRef.current(film);
            });
        };

        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("click", onClick);

        // Loop
        let raf;
        const tick = () => {
            controls.update();
            composerRef.current?.render();
            raf = requestAnimationFrame(tick);
        };
        tick();

        // Cleanup
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onResize);
            renderer.domElement.removeEventListener("pointermove", onPointerMove);
            renderer.domElement.removeEventListener("click", onClick);
            if (renderer.domElement.parentElement === mount) {
                mount.removeChild(renderer.domElement);
            }
            renderer.dispose();
            scene.traverse((obj) => {
                if (obj.isMesh) {
                    obj.geometry?.dispose?.();
                    obj.material?.map?.dispose?.();
                    obj.material?.dispose?.();
                }
            });
        };
    }, []); // ← init unique

    // (Re)construction des affiches quand `movies` change
    useEffect(() => {
        const group = postersGroupRef.current;

        // clear
        while (group.children.length) {
            const child = group.children.pop();
            child.geometry?.dispose?.();
            child.material?.map?.dispose?.();
            child.material?.dispose?.();
        }

        if (!movies || movies.length === 0) return;

        const loader = new THREE.TextureLoader();

        // ancrage au sol
        const rows = Math.ceil(movies.length / ROW_SIZE);
        const stepY = POSTER_H + GAP;
        const bottomCenterY = FLOOR_Y + CLEARANCE + POSTER_H / 2;

        movies.forEach((film, index) => {
            const tex = film.poster ? loader.load(film.poster) : null;
            if (tex) tex.colorSpace = THREE.SRGBColorSpace;

            const geom = new THREE.PlaneGeometry(POSTER_W, POSTER_H);
            const mat = new THREE.MeshStandardMaterial({
                map: tex || null,
                color: tex ? 0xffffff : 0x333333,
                roughness: 0.95
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.userData.film = film;
            mesh.castShadow = true;

            // petit cadre
            const frame = new THREE.Mesh(
                new THREE.PlaneGeometry(POSTER_W * 1.02, POSTER_H * 1.02),
                new THREE.MeshBasicMaterial({ color: 0x000000 })
            );
            frame.position.z = -0.005;
            mesh.add(frame);

            const col = index % ROW_SIZE;
            const row = Math.floor(index / ROW_SIZE);
            const x = (col - (ROW_SIZE - 1) / 2) * (POSTER_W + GAP);
            const y = bottomCenterY + (rows - 1 - row) * stepY;

            mesh.position.set(x, y, 0);
            group.add(mesh);
        });

        cameraRef.current?.lookAt(group.position);
    }, [movies]); // ← on ne dépend PAS de onClickPoster ici

    return (
        <div
            ref={mountRef}
            style={{ width: "100%", height: "70vh", borderRadius: 12, overflow: "hidden" }}
        />
    );
}