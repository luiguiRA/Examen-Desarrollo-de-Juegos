window.addEventListener('DOMContentLoaded', () => {

    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);

    // Referencias globales
    let playerCamera;
    let wallZone;
    let carriedBrick = null;
    let hasBrick = false;
    let wallBrickCount = 0;

    // Variables de juego
    let brickMaterials = {};
    let nextBrickType = 'red';
    const BRICK_TYPES = ['red', 'blue', 'green'];
    let currentActiveBrick = null;
    let score = 0;
    let timeLeft = 60.0;
    
    // Lógica de inicio
    let gameState = "countdown"; // "countdown", "playing", "gameover"
    let countdownTime = 4.0; // 3, 2, 1, YA!

    // Variables de Sonido (¡Sin música!)
    let pickSound, placeSound, failSound;

    // Puntos de aparición
    const spawnPoints = [
        new BABYLON.Vector3(15, 0.25, 15),
        new BABYLON.Vector3(-15, 0.25, -15),
        new BABYLON.Vector3(15, 0.25, -15),
        new BABYLON.Vector3(-15, 0.25, 15),
        new BABYLON.Vector3(0, 0.25, 18),
        new BABYLON.Vector3(18, 0.25, 0)
    ];

    // Referencias a la UI
    const uiContainer = document.getElementById("ui-container");
    const statsContainer = document.getElementById("stats-container");
    const uiText = document.getElementById("ui-text");
    const uiScore = document.getElementById("ui-score");
    const uiTimer = document.getElementById("ui-timer");
    const gameOverContainer = document.getElementById("gameover-container");
    const finalScoreText = document.getElementById("final-score");
    const gameOverTitle = document.getElementById("gameover-title");
    const instructionsSplash = document.getElementById("instructions-splash");

    function triggerGameOver(message) {
        if (gameState === "gameover") return;
        gameState = "gameover";
        playerCamera.detachControl(canvas);
        uiContainer.style.display = 'none';
        statsContainer.style.display = 'none';
        instructionsSplash.style.display = 'none';
        finalScoreText.innerText = score;
        gameOverTitle.innerText = message;
        gameOverContainer.style.display = 'block';
        if (carriedBrick) carriedBrick.dispose();
        if (currentActiveBrick) currentActiveBrick.dispose();
        if (failSound) failSound.play();
    }


    const createScene = () => {
        const scene = new BABYLON.Scene(engine);
        
        // 1. EL JUGADOR (Cámara)
        playerCamera = new BABYLON.UniversalCamera("player", new BABYLON.Vector3(0, 1.8, -5), scene);
        
        playerCamera.minZ = 0.4; 
        scene.collisionsEnabled = true;
        playerCamera.checkCollisions = true;
        playerCamera.applyGravity = true;
        playerCamera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
        playerCamera.keysUp = [87];
        playerCamera.keysDown = [83];
        playerCamera.keysLeft = [65];
        playerCamera.keysRight = [68];
        playerCamera.speed = 0.20;

        // 2. EL ENTORNO
        const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.8;
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 40, height: 40 }, scene);
        ground.checkCollisions = true;
        const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
        groundMat.diffuseTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/grass.png");
        groundMat.diffuseTexture.uScale = 6; groundMat.diffuseTexture.vScale = 6;
        ground.material = groundMat;
        const skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, scene);
        const skyboxMaterial = new BABYLON.StandardMaterial("skyBox", scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.reflectionTexture = new BABYLON.CubeTexture("https://assets.babylonjs.com/textures/skybox", scene);
        skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
        skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        skybox.material = skyboxMaterial;
        const obstacleMat = new BABYLON.StandardMaterial("obstacleMat", scene);
        obstacleMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        const obs1 = BABYLON.MeshBuilder.CreateBox("obs1", {width: 8, height: 2, depth: 1}, scene);
        obs1.position = new BABYLON.Vector3(0, 1, 8);
        obs1.checkCollisions = true; obs1.material = obstacleMat;
        const obs2 = BABYLON.MeshBuilder.CreateBox("obs2", {width: 1, height: 2, depth: 8}, scene);
        obs2.position = new BABYLON.Vector3(8, 1, 0);
        obs2.checkCollisions = true; obs2.material = obstacleMat;

        // 3. ZONAS, PAQUETE Y SONIDOS
        wallZone = BABYLON.MeshBuilder.CreateBox("wallZone", { width: 3.5, height: 0.1, depth: 2 }, scene);
        wallZone.position = new BABYLON.Vector3(-5, 0.05, 5);
        const wallZoneMat = new BABYLON.StandardMaterial("wallZoneMat", scene);
        wallZoneMat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        wallZoneMat.alpha = 0.5; wallZone.material = wallZoneMat;

        brickMaterials['red'] = new BABYLON.StandardMaterial("redMat", scene);
        brickMaterials['red'].diffuseColor = new BABYLON.Color3(1, 0, 0);
        brickMaterials['blue'] = new BABYLON.StandardMaterial("blueMat", scene);
        brickMaterials['blue'].diffuseColor = new BABYLON.Color3(0, 0, 1);
        brickMaterials['green'] = new BABYLON.StandardMaterial("greenMat", scene);
        brickMaterials['green'].diffuseColor = new BABYLON.Color3(0, 1, 0);

        // Cargar solo los efectos de sonido
        pickSound = new BABYLON.Sound("pickSound", "https://assets.babylonjs.com/sounds/click.wav", scene, null, { volume: 0.5 });
        placeSound = new BABYLON.Sound("placeSound", "https://assets.babylonjs.com/sounds/shot.wav", scene, null, { volume: 0.3 });
        failSound = new BABYLON.Sound("failSound", "https://assets.babylonjs.com/sounds/fail.wav", scene, null, { volume: 0.5 });
        
        const spawnNextBrick = () => {
            if (currentActiveBrick) currentActiveBrick.dispose();
            nextBrickType = BRICK_TYPES[Math.floor(Math.random() * BRICK_TYPES.length)];
            const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            currentActiveBrick = BABYLON.MeshBuilder.CreateBox(`brick_${nextBrickType}`, { width: 0.5, height: 0.25, depth: 0.25 }, scene);
            currentActiveBrick.position = spawnPoint.clone();
            currentActiveBrick.material = brickMaterials[nextBrickType];
            currentActiveBrick.metadata = { type: nextBrickType };
            
            const highlight = new BABYLON.HighlightLayer("hl", scene);
            highlight.addMesh(currentActiveBrick, BABYLON.Color3.White());
            highlight.blurHorizontalSize = 1.0; highlight.blurVerticalSize = 1.0;
        };
        spawnNextBrick(); 

        // 4. MECÁNICAS (Teclado)
        scene.onKeyboardObservable.add((kbInfo) => {
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN && kbInfo.event.keyCode === 82) {
                location.reload(); 
            }
            if (gameState !== "playing") return;
            
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                if (kbInfo.event.keyCode === 69) { // 'E'
                    
                    // LÓGICA DE RECOGIDA (¡CORREGIDA!)
                    if (!hasBrick) {
                        if (!currentActiveBrick) return;
                        const dist = BABYLON.Vector3.Distance(playerCamera.position, currentActiveBrick.position);
                        
                        if (dist < 2.5) { 
                            pickSound.play();
                            
                            // Esta parte ahora SÍ se ejecutará
                            hasBrick = true;
                            carriedBrick = currentActiveBrick;
                            carriedBrick.setParent(playerCamera);
                            carriedBrick.position = new BABYLON.Vector3(0.8, -0.5, 1.5);
                            carriedBrick.checkCollisions = false;
                            currentActiveBrick = null;
                        }
                    }
                    // LÓGICA DE ENTREGA
                    else { 
                        const distToWall = BABYLON.Vector3.Distance(playerCamera.position, wallZone.position);
                        if (distToWall < 4) {
                            hasBrick = false;
                            carriedBrick.setParent(null);
                            const bricksPerRow = 5; const startX = -6.4; 
                            const newX = startX + (wallBrickCount % bricksPerRow) * 0.55;
                            const newY = 0.125 + Math.floor(wallBrickCount / bricksPerRow) * 0.3;
                            carriedBrick.position = new BABYLON.Vector3(newX, newY, 5);
                            carriedBrick.checkCollisions = true;
                            carriedBrick.metadata = { type: "placed_brick" };
                            wallBrickCount++;
                            carriedBrick = null;
                            score += 100;
                            timeLeft += 5.0; 
                            placeSound.play();
                            spawnNextBrick();
                        }
                    }
                }
            }
        });

        // 5. BUCLE DEL JUEGO (Render Loop)
        scene.registerAfterRender(() => {
            const deltaTime = engine.getDeltaTime() / 1000; // Tiempo en segundos

            // LÓGICA DEL CONTEO
            if (gameState === "countdown") {
                countdownTime -= deltaTime;
                uiContainer.classList.add("countdown"); // Añadir clase para hacerlo grande
                
                if (countdownTime <= 1.0) {
                    uiText.innerHTML = "¡YA!";
                    if (countdownTime <= 0.0) {
                        gameState = "playing";
                        playerCamera.attachControl(canvas, true); // ¡Activar control!
                        uiContainer.classList.remove("countdown"); // Quitar clase
                    }
                } else if (countdownTime <= 2.0) {
                    uiText.innerHTML = "1";
                } else if (countdownTime <= 3.0) {
                    uiText.innerHTML = "2";
                } else {
                    uiText.innerHTML = "3";
                }
                return; // No ejecutar el resto de la lógica
            }

            // LÓGICA DEL JUEGO (Playing)
            if (gameState !== "playing") return;

            // Lógica del Temporizador
            timeLeft -= deltaTime;
            if (timeLeft <= 0) {
                timeLeft = 0;
                triggerGameOver("¡TIEMPO AGOTADO!");
                return;
            }

            // Detector de Caída
            if (playerCamera.position.y < -10) {
                triggerGameOver("¡TE CAÍSTE!");
                return;
            }

            // Actualizar UI
            uiScore.innerHTML = `Puntaje: ${score}`;
            uiTimer.innerHTML = `Tiempo: ${timeLeft.toFixed(1)}s`;
            uiTimer.style.color = (timeLeft < 10) ? "#E53935" : "#FFC107"; 

            let taskText = `¡BUSCA EL LADRILLO <strong style="color:${nextBrickType};">${nextBrickType.toUpperCase()}</strong>!`;
            if (hasBrick) {
                const distToWall = BABYLON.Vector3.Distance(playerCamera.position, wallZone.position);
                if (distToWall < 4) {
                    taskText = `¡Presiona [E] para ENTREGAR!`;
                } else {
                    taskText = `¡Corre al MURO! ¡RÁPIDO!`;
                }
            }
            uiText.innerHTML = taskText;
        });

        return scene;
    };

    // --- INICIO ---
    const scene = createScene();

    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener("resize", () => {
        engine.resize();
    });

}); 