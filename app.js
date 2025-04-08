const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const modelEntity = document.getElementById('model');
const startARButton = document.getElementById('start-ar');

let isModelPlaced = false;
let arSystem;

// Di bagian atas file, tambahkan:
let xrSession = null;
let xrRefSpace = null;

// Update fungsi startAR
startARButton.addEventListener('click', async () => {
    try {
        if (navigator.xr) {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if (supported) {
                const session = await navigator.xr.requestSession('immersive-ar', {
                    requiredFeatures: ['hit-test', 'local-floor']
                });
                xrSession = session;
                const scene = document.querySelector('a-scene');
                await scene.enterVR();
                isModelPlaced = true;
                modelEntity.setAttribute('visible', true);
                startARButton.style.display = 'none';
            } else {
                alert('AR tidak didukung di browser ini. Coba gunakan Safari di iOS atau Chrome di Android.');
            }
        } else {
            alert('WebXR tidak didukung di browser ini.');
        }
    } catch (error) {
        console.error('Error starting AR:', error);
        alert('Gagal memulai AR. Pastikan menggunakan browser yang mendukung WebXR.');
    }
});

function startAR() {
    isModelPlaced = true;
    modelEntity.setAttribute('visible', true);
    startARButton.style.display = 'none';
}

// Set video dan canvas agar menyesuaikan dengan ukuran layar ponsel
function adjustVideoCanvasSize() {
    const width = window.innerWidth;  // Lebar layar
    const height = window.innerHeight;  // Tinggi layar

    videoElement.width = width;
    videoElement.height = height;

    canvasElement.width = width;
    canvasElement.height = height;
}

window.addEventListener('resize', adjustVideoCanvasSize); // Menyesuaikan saat ukuran layar berubah
adjustVideoCanvasSize(); // Pertama kali dijalankan saat halaman dimuat

let previousLandmarks = null;
let previousScale = null;
let previousPosition = null;

// Fungsi untuk melakukan smoothing pada landmarks tangan
function smoothLandmarks(landmarks) {
    if (!previousLandmarks) {
        previousLandmarks = landmarks;
        return landmarks;
    }

    const smoothedLandmarks = landmarks.map((landmark, index) => {
        const previousLandmark = previousLandmarks[index];
        if (!previousLandmark) return landmark;

        const smoothedX = landmark.x * 0.3 + previousLandmark.x * 0.7;
        const smoothedY = landmark.y * 0.3 + previousLandmark.y * 0.7;
        const smoothedZ = landmark.z * 0.3 + previousLandmark.z * 0.7;

        return { x: smoothedX, y: smoothedY, z: smoothedZ };
    });

    previousLandmarks = smoothedLandmarks;
    return smoothedLandmarks;
}

// Fungsi untuk menghitung linear interpolation (lerp)
function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

// Update fungsi onResults untuk menyesuaikan dengan world tracking
function onResults(results) {
    if (!isModelPlaced) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0);

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            const smoothedLandmarks = smoothLandmarks(landmarks);
            drawConnectors(canvasCtx, smoothedLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(canvasCtx, smoothedLandmarks, { color: '#FF0000', lineWidth: 2 });

            if (smoothedLandmarks[8] && smoothedLandmarks[4]) {
                const indexFinger = smoothedLandmarks[8];
                const thumb = smoothedLandmarks[4];

                // Calculate scale
                const distance = Math.sqrt(
                    Math.pow(indexFinger.x - thumb.x, 2) + Math.pow(indexFinger.y - thumb.y, 2)
                );

                const targetScale = distance * 5;
                const smoothedScale = lerp(previousScale || targetScale, targetScale, 0.2);
                previousScale = smoothedScale;
                
                modelEntity.setAttribute('scale', `${smoothedScale} ${smoothedScale} ${smoothedScale}`);

                // Calculate position
                const worldPos = {
                    x: (indexFinger.x - 0.5) * 2,
                    y: -(indexFinger.y - 0.5) * 2,
                    z: -indexFinger.z * 2
                };
                
                modelEntity.setAttribute('position', `${worldPos.x} ${worldPos.y} ${worldPos.z}`);

                // Calculate rotation
                const deltaX = thumb.x - indexFinger.x;
                const deltaY = thumb.y - indexFinger.y;
                const deltaZ = thumb.z - indexFinger.z;

                const rotationX = Math.atan2(deltaY, deltaZ) * (180 / Math.PI);
                const rotationY = Math.atan2(deltaX, deltaZ) * (180 / Math.PI);

                modelEntity.setAttribute('rotation', `${rotationX} ${rotationY} 0`);
            }
        }
    }
    canvasCtx.restore();
}

// Setup MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onResults);

// Setup Camera untuk menangkap video
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    facingMode: "environment"
});
camera.start();

// Error handling jika kamera tidak dapat diakses
camera.onCameraError = (error) => {
    console.error("Error accessing camera:", error);
    alert("Kamera tidak dapat diakses. Pastikan kamera terhubung dan izin diberikan.");
};

// Event listener untuk model 3D
modelEntity.addEventListener('model-loaded', () => {
    console.log("Model 3D berhasil dimuat!");
});

modelEntity.addEventListener('model-error', (error) => {
    console.error("Error loading 3D model:", error);
    alert("Gagal memuat model 3D. Periksa jalur file model.");
});

// Di bagian atas file, tambahkan fungsi logger
function logDebug(message, data = null) {
    const debugDiv = document.getElementById('debug-info') || createDebugDiv();
    const logMessage = data ? `${message}: ${JSON.stringify(data)}` : message;
    debugDiv.innerHTML += `<div>${logMessage}</div>`;
    console.log(message, data);
}

function createDebugDiv() {
    const div = document.createElement('div');
    div.id = 'debug-info';
    div.style.cssText = 'position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: white; padding: 10px; font-size: 12px; z-index: 9999; max-height: 200px; overflow-y: auto;';
    document.body.appendChild(div);
    return div;
}

// Update fungsi startAR dengan logging
startARButton.addEventListener('click', async () => {
    try {
        logDebug('Checking WebXR support...');
        if (navigator.xr) {
            logDebug('WebXR exists');
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            logDebug('AR supported:', supported);
            if (supported) {
                logDebug('Requesting AR session...');
                const session = await navigator.xr.requestSession('immersive-ar', {
                    requiredFeatures: ['hit-test', 'local-floor']
                });
                logDebug('Session created');
                xrSession = session;
                const scene = document.querySelector('a-scene');
                logDebug('Entering VR mode...');
                await scene.enterVR();
                logDebug('VR mode entered');
                isModelPlaced = true;
                modelEntity.setAttribute('visible', true);
                startARButton.style.display = 'none';
            } else {
                logDebug('AR not supported in this browser');
                alert('AR tidak didukung di browser ini. Coba gunakan Safari di iOS atau Chrome di Android.');
            }
        } else {
            logDebug('WebXR not available');
            alert('WebXR tidak didukung di browser ini.');
        }
    } catch (error) {
        logDebug('Error in AR start:', error.message);
        console.error('Error starting AR:', error);
        alert('Gagal memulai AR. Pastikan menggunakan browser yang mendukung WebXR.');
    }
});

// Tambahkan logging di event listener model
modelEntity.addEventListener('model-loaded', () => {
    logDebug("Model 3D berhasil dimuat!");
});

modelEntity.addEventListener('model-error', (error) => {
    logDebug("Error loading 3D model:", error.message);
    alert("Gagal memuat model 3D. Periksa jalur file model.");
});

// Tambahkan logging untuk scene events
document.querySelector('a-scene').addEventListener('loaded', () => {
    logDebug('A-Frame scene loaded');
});

document.querySelector('a-scene').addEventListener('enter-vr', () => {
    logDebug('Entered VR/AR mode');
});
