// DOM Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const modelEntity = document.getElementById('model');
const arButton = document.getElementById('ar-button');
const scene = document.querySelector('a-scene');

// Variables for smoothing and tracking
let previousLandmarks = null;
let previousScale = null;
let previousPosition = null;

// Utility Functions
function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

// Adjusts video and canvas sizes to fit the screen
function adjustVideoCanvasSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    videoElement.width = width;
    videoElement.height = height;
    canvasElement.width = width;
    canvasElement.height = height;
}
window.addEventListener('resize', adjustVideoCanvasSize);
adjustVideoCanvasSize();

// Smooths hand landmarks for stability
function smoothLandmarks(landmarks) {
    if (!previousLandmarks) {
        previousLandmarks = landmarks;
        return landmarks;
    }

    const smoothedLandmarks = landmarks.map((landmark, index) => {
        const previousLandmark = previousLandmarks[index];
        if (!previousLandmark) return landmark;

        return {
            x: lerp(previousLandmark.x, landmark.x, 0.3),
            y: lerp(previousLandmark.y, landmark.y, 0.3),
            z: lerp(previousLandmark.z, landmark.z, 0.3),
        };
    });

    previousLandmarks = smoothedLandmarks;
    return smoothedLandmarks;
}

// Handles AR button functionality
async function toggleARSession() {
    if (scene.is('ar-mode')) {
        try {
            await scene.exitAR();
            arButton.textContent = 'Start AR';
        } catch (err) {
            console.error('Error exiting AR:', err);
        }
    } else {
        try {
            const sessionInit = {
                optionalFeatures: ['dom-overlay', 'hit-test'],
                domOverlay: { root: document.querySelector('#dom-overlay') }
            };
            
            const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
            await scene.enterAR();
            arButton.textContent = 'Exit AR';

            // Add this to ensure model visibility
            modelEntity.setAttribute('visible', 'true');
            modelEntity.setAttribute('position', '0 0 -1');
            
            session.addEventListener('end', () => {
                arButton.textContent = 'Start AR';
            });
        } catch (err) {
            console.error('Error entering AR:', err);
            alert('Failed to start AR: ' + err.message);
        }
    }
}
arButton.addEventListener('click', toggleARSession);

// Checks WebXR support and updates AR button
async function checkXRSupport() {
    try {
        // Simplified check for XR Browser
        if (navigator.xr) {
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            arButton.textContent = isSupported ? 'Start AR' : 'AR Not Supported';
            arButton.disabled = !isSupported;
        } else {
            arButton.textContent = 'AR Not Supported';
            arButton.disabled = true;
        }
    } catch (err) {
        console.error('Error checking XR support:', err);
        arButton.textContent = 'AR Error';
        arButton.disabled = true;
    }
}
checkXRSupport();

// Processes hand tracking results
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0);

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            const smoothedLandmarks = smoothLandmarks(landmarks);

            drawConnectors(canvasCtx, smoothedLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(canvasCtx, smoothedLandmarks, { color: '#FF0000', lineWidth: 2 });

            updateModelPosition(smoothedLandmarks);
        }
    }
    canvasCtx.restore();
}

// Updates 3D model's position, scale, and rotation
function updateModelPosition(landmarks) {
    const indexFinger = landmarks[8];
    const thumb = landmarks[4];

    if (indexFinger && thumb) {
        // Scale
        const distance = Math.sqrt(
            Math.pow(indexFinger.x - thumb.x, 2) + Math.pow(indexFinger.y - thumb.y, 2)
        );
        const targetScale = distance * 5;
        previousScale = lerp(previousScale || targetScale, targetScale, 0.2);
        modelEntity.setAttribute('scale', `${previousScale} ${previousScale} ${previousScale}`);

        // Position
        const worldX = (indexFinger.x - 0.5) * 2;
        const worldY = -(indexFinger.y - 0.5) * 2 + 1.6;
        const worldZ = -1 - landmarks[8].z;

        const smoothX = lerp(previousPosition?.x || worldX, worldX, 0.2);
        const smoothY = lerp(previousPosition?.y || worldY, worldY, 0.2);
        const smoothZ = lerp(previousPosition?.z || worldZ, worldZ, 0.2);
        previousPosition = { x: smoothX, y: smoothY, z: smoothZ };

        modelEntity.setAttribute('position', `${smoothX} ${smoothY} ${smoothZ}`);

        // Rotation
        const deltaX = thumb.x - indexFinger.x;
        const deltaY = thumb.y - indexFinger.y;
        const deltaZ = thumb.z - indexFinger.z;

        const rotationX = Math.atan2(deltaY, deltaZ) * (180 / Math.PI);
        const rotationY = Math.atan2(deltaX, deltaZ) * (180 / Math.PI);
        modelEntity.setAttribute('rotation', `${rotationX} ${rotationY} 0`);
    }
}

// Initializes MediaPipe Hands
function initializeMediaPipe() {
    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({ image: videoElement });
        },
        facingMode: "environment"
    });
    camera.start();

    camera.onCameraError = (error) => {
        console.error("Error accessing camera:", error);
        alert("Unable to access the camera. Ensure permissions are granted.");
    };

    return { hands, camera };
}
initializeMediaPipe();

// Event Listeners for 3D Model
// Add near the top of the file with other event listeners
scene.addEventListener('enter-vr', () => {
    modelEntity.setAttribute('visible', 'true');
    console.log('Entering AR/VR mode, model should be visible');
});

modelEntity.addEventListener('model-loaded', () => {
    console.log("3D model loaded successfully!");
    modelEntity.setAttribute('visible', 'true');
    // Add initial scale if needed
    modelEntity.setAttribute('scale', '0.5 0.5 0.5');
});
modelEntity.addEventListener('model-error', (error) => {
    console.error("Error loading 3D model:", error);
    alert("Failed to load 3D model. Check the file path.");
});
