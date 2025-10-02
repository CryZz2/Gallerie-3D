import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

// Dimensions et configuration de la grille d'affiches
const POSTER_W = 1;
const POSTER_H = 1.5;
const GAP = 0.25;
const ROW_SIZE = 6;
const FLOOR_Y = -0.8;           // ← mets la même valeur que ton sol/mirror .position.y
const CLEARANCE = 0.10;         // marge au-dessus du sol (un peu large pour l’animation)

export default function ThreeScene({ movies = [], onClickPoster }) {
    // Références pour le montage, la scène, le renderer, la caméra et les contrôles
    const mountRef = useRef(null);
    const sceneRef = useRef();
    const rendererRef = useRef();
    const cameraRef = useRef();
    const controlsRef = useRef(null);

    const composerRef = useRef(null);
    const bloomPassRef = useRef(null);
    // Groupe qui contient tous les posters
    const postersGroupRef = useRef(new THREE.Group());
    const wallRef = useRef(null);

    // Outils pour le picking (sélection d'affiche à la souris)
    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());
    const animRef = useRef(null);

    // Fonction pour animer la caméra et centrer sur une affiche
    function focusOnObject(mesh, { duration = 650, padding = 0.18 } = {}, done) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const renderer = rendererRef.current;
        if (!camera || !controls || !renderer || !mesh) return;

        // Calcul de la taille et du centre de l'affiche
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        // Calcul de la normale (direction "devant" l'affiche)
        const normal = new THREE.Vector3(0, 0, 1);
        const q = new THREE.Quaternion();
        mesh.getWorldQuaternion(q);
        normal.applyQuaternion(q).normalize();

        // Calcul de la distance idéale pour la caméra (pour bien voir l'affiche)
        const { clientWidth: w, clientHeight: h } = renderer.domElement;
        const aspect = w / h;
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const maxSize = Math.max(size.x, size.y / aspect);
        const dist = (maxSize / 2) / Math.tan(fov / 2) + padding;

        // Positions de départ et d'arrivée pour la caméra et la cible
        const camFrom = camera.position.clone();
        const camTo = center.clone().addScaledVector(normal, dist);
        const tgtFrom = controls.target.clone();
        const tgtTo = center.clone();

        // Animation avec easing
        if (animRef.current) cancelAnimationFrame(animRef.current);
        const t0 = performance.now();
        const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

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

    // Initialisation de la scène 3D au montage du composant
    useEffect(() => {
        const mount = mountRef.current;

        // Création de la scène, caméra et renderer
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x141414);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100);
        camera.position.set(0, 1.1, 6);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        mount.appendChild(renderer.domElement);
        rendererRef.current = renderer;



        // Ajout des lumières
        scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(3, 5, 4);
        scene.add(dir);


        // Ajout du groupe d'affiches à la scène
        scene.add(postersGroupRef.current);

        // Contrôles de la caméra (zoom, rotation, etc.)
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 2.5;
        controls.maxDistance = 12;
        controls.target.set(0, 0.6, 0);
        controlsRef.current = controls;

        // --- Post-processing: composer + bloom ---
        const composer = new EffectComposer(renderer);
        composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        composer.setSize(mount.clientWidth, mount.clientHeight);

        // le rendu normal de la scène comme première "pass"
        composer.addPass(new RenderPass(scene, camera));

        // bloom: (resolution, strength, radius, threshold)
        const bloom = new UnrealBloomPass(
            new THREE.Vector2(mount.clientWidth, mount.clientHeight),
            0.7,   // strength: intensité du halo (0.4–1.2)
            0.8,   // radius: étalement (0.6–1.0)
            0.01   // threshold: seuil de luminosité à partir duquel ça "bloom"
        );
        bloom.threshold = 0.2; // utile pour filtrer un peu (0.0–0.3)
        composer.addPass(bloom);

        composerRef.current = composer;
        bloomPassRef.current = bloom;


        // --- MIROIR (sol réfléchissant)
        const groundGeo = new THREE.PlaneGeometry(40, 40);

        // ↓ taille du render target = impact direct sur netteté / perf
        // 1) Reflector (comme plus haut)
        const mirror = new Reflector(groundGeo, {
            clipBias: 0.003,
            textureWidth: Math.floor(mount.clientWidth / 2),
            textureHeight: Math.floor(mount.clientHeight / 2),
            color: 0x111111
        });
        mirror.rotation.x = -Math.PI / 2;
        mirror.position.y = -0.8015;       // légèrement en dessous
        mirror.renderOrder = -1;
        scene.add(mirror);

        // 2) Plan ombres (ShadowMaterial) – très légèrement AU-DESSUS
        const shadowPlane = new THREE.Mesh(
            groundGeo,
            new THREE.ShadowMaterial({ opacity: 0.18 }) // 0.15–0.25 = soft
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -0.8;     // au-dessus du miroir
        shadowPlane.receiveShadow = true;
        shadowPlane.renderOrder = 0;       // rendu après le miroir
        scene.add(shadowPlane);

        // Facultatif : fade de la réflexion avec la distance (simple, visuel)
        // on superpose un léger dégradé transparent au-dessus du miroir
        const fade = new THREE.Mesh(
            groundGeo,
            new THREE.MeshBasicMaterial({
                color: 0x0b0b0d,
                transparent: true,
                opacity: 0.25,         // ajuste entre 0.15–0.35
                depthWrite: false
            })
        );
        fade.rotation.x = -Math.PI / 2;
        fade.position.y = mirror.position.y + 0.0005; // juste au-dessus
        fade.renderOrder = 1;
        scene.add(fade);

        // Gestion du redimensionnement de la fenêtre
        const onResize = () => {
            camera.aspect = mount.clientWidth / mount.clientHeight;
            camera.updateProjectionMatrix();
            composerRef.current?.setSize(mount.clientWidth, mount.clientHeight);
        };
        window.addEventListener("resize", onResize);

        // Fonction utilitaire pour retrouver le mesh d'un film à partir d'un objet cliqué
        const getFilmMesh = (obj) => {
            let o = obj;
            while (o && !o.userData?.film) o = o.parent;
            return o && o.userData?.film ? o : null;
        };

        // Gestion du survol de la souris (changement du curseur)
        const onPointerMove = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.current.setFromCamera(mouse.current, camera);
            const hits = raycaster.current.intersectObjects(postersGroupRef.current.children, true);
            renderer.domElement.style.cursor = hits.length ? "pointer" : "default";
        };

        // Gestion du clic sur une affiche
        const onClick = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.current.setFromCamera(mouse.current, camera);
            const hits = raycaster.current.intersectObjects(postersGroupRef.current.children, true);
            if (!hits.length) return;

            const filmMesh = getFilmMesh(hits[0].object);
            if (!filmMesh) return;
            const film = filmMesh.userData.film;

            // Animation de feedback sur l'affiche cliquée
            filmMesh.scale.set(1.06, 1.06, 1);
            setTimeout(() => filmMesh.scale.set(1, 1, 1), 140);

            // Animation de la caméra pour zoomer sur l'affiche
            focusOnObject(filmMesh, { duration: 650, padding: 0.22 }, () => {
                onClickPoster && film && onClickPoster(film);
            });
        };

        // Ajout des écouteurs d'événements
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("click", onClick);

        // Boucle de rendu
        let raf;
        const tick = () => {
            controls.update();
            composerRef.current?.render();
            raf = requestAnimationFrame(tick);
        };
        tick();

        // Nettoyage lors du démontage du composant
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onResize);
            renderer.domElement.removeEventListener("pointermove", onPointerMove);
            renderer.domElement.removeEventListener("click", onClick);
            renderer.dispose();
            mount.removeChild(renderer.domElement);
            scene.traverse((obj) => {
                if (obj.isMesh) {
                    obj.geometry?.dispose?.();
                    if (obj.material?.map) obj.material.map.dispose();
                    obj.material?.dispose?.();
                }
            });
        };
    }, []);

    // Création et placement des affiches à chaque changement de la liste de films
    useEffect(() => {
        const group = postersGroupRef.current;

        // Nettoyage du groupe
        while (group.children.length) {
            const child = group.children.pop();
            child.geometry?.dispose?.();
            if (child.material?.map) child.material.map.dispose();
            child.material?.dispose?.();
        }

        const loader = new THREE.TextureLoader();
        // --- NOUVEAU: calcul “ancré sol”
        const rows = Math.ceil(movies.length / ROW_SIZE);
        const stepY = POSTER_H + GAP;
        const bottomCenterY = FLOOR_Y + CLEARANCE + POSTER_H / 2; // centre de la rangée du bas

        movies.forEach((film, index) => {
            const tex = film.poster ? loader.load(film.poster) : null;
            if (tex) tex.colorSpace = THREE.SRGBColorSpace;

            const geom = new THREE.PlaneGeometry(POSTER_W, POSTER_H);
            const mat = new THREE.MeshStandardMaterial({
                map: tex || null,
                color: tex ? 0xffffff : 0x333333,
                roughness: 0.95,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.userData.film = film;
            mesh.castShadow = true;

            const frame = new THREE.Mesh(
                new THREE.PlaneGeometry(POSTER_W * 1.02, POSTER_H * 1.02),
                new THREE.MeshBasicMaterial({ color: 0x000000 })
            );
            frame.position.z = -0.005;
            mesh.add(frame);

            const col = index % ROW_SIZE;
            const row = Math.floor(index / ROW_SIZE);

            const x = (col - (ROW_SIZE - 1) / 2) * (POSTER_W + GAP);
            // rangée 0 = tout en haut → on convertit en rangée depuis le bas
            const y = bottomCenterY + (rows - 1 - row) * stepY;

            mesh.position.set(x, y, 0);
            group.add(mesh);
        });

        cameraRef.current?.lookAt(group.position);
    }, [movies]);
    // Rendu du conteneur de la scène 3D
    return (
        <div
            ref={mountRef}
            style={{ width: "100%", height: "70vh", borderRadius: 12, overflow: "hidden" }}
        />
    );

    function disposeMesh(mesh, scene) {
        if (!mesh) return;
        scene.remove(mesh);
        mesh.geometry?.dispose?.();
        if (mesh.material?.map) mesh.material.map.dispose();
        mesh.material?.dispose?.();
    }

    function updatePostersWall(scene, group, wallRef) {
        // Si pas d’affiche → enlève le mur
        if (!group || group.children.length === 0) {
            if (wallRef.current) { disposeMesh(wallRef.current, scene); wallRef.current = null; }
            return;
        }

        // Bounding box de la grille d’affiches
        const bbox = new THREE.Box3().setFromObject(group);
        const size = new THREE.Vector3(); bbox.getSize(size);
        const center = new THREE.Vector3(); bbox.getCenter(center);

        // marges autour des affiches (réglables)
        const marginX = 0.6;
        const marginY = 0.6;
        const W = size.x + marginX;
        const H = size.y + marginY;

        const zOffset = -0.03; // un chouia derrière les posters (posters à z≈0)

        if (!wallRef.current) {
            const geo = new THREE.PlaneGeometry(W, H);
            const mat = new THREE.MeshStandardMaterial({
                color: 0x0f0f0f,   // gris très sombre (comme ton sol)
                roughness: 0.95,
                metalness: 0.0
            });
            mat.polygonOffset = true;               // évite tout z-fighting
            mat.polygonOffsetFactor = 1;
            mat.polygonOffsetUnits = 1;

            const wall = new THREE.Mesh(geo, mat);
            wall.receiveShadow = true;
            wall.position.set(center.x, center.y, zOffset);

            // 👉 Si tu utilises des backlights sur layer 2, décommente :
            // wall.layers.set(2);

            scene.add(wall);
            wallRef.current = wall;
        } else {
            // on met à jour taille & position
            wallRef.current.geometry.dispose();
            wallRef.current.geometry = new THREE.PlaneGeometry(W, H);
            wallRef.current.position.set(center.x, center.y, zOffset);
            wallRef.current.visible = true;
        }
    }
}