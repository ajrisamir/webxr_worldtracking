const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const modelEntity = document.getElementById('model');
const reticle = document.getElementById('reticle');
const startARButton = document.getElementById('start-ar');

let isModelPlaced = false;

// Fungsi untuk memulai sesi AR
startARButton.addEventListener('click', async () => {
    const scene = document.querySelector('a-scene');
    const session = await scene.enterAR();
});

// Event listener untuk hit-test
window.addEventListener('enter-vr', () => {
    if (navigator.xr) {
        const scene = document.querySelector('a-scene');
        scene.addEventListener('ar-hit-test-select', (event) => {
            if (!isModelPlaced) {
                const position = event.detail.position;
                modelEntity.setAttribute('position', position);
                modelEntity.setAttribute('visible', true);
                reticle.setAttribute('visible', false);
                isModelPlaced = true;
            }
        });

        scene.addEventListener('ar-hit-test-start', () => {
            reticle.setAttribute('visible', true);
        });

        scene.addEventListener('ar-hit-test-move', (event) => {
            reticle.setAttribute('position', event.detail.position);
        });
    }
});

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
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0);

    if (results.multiHandLandmarks && isModelPlaced) {
        for (const landmarks of results.multiHandLandmarks) {
            const smoothedLandmarks = smoothLandmarks(landmarks);
            drawConnectors(canvasCtx, smoothedLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(canvasCtx, smoothedLandmarks, { color: '#FF0000', lineWidth: 2 });

            if (smoothedLandmarks[8] && smoothedLandmarks[4]) {
                const indexFinger = smoothedLandmarks[8];
                const thumb = smoothedLandmarks[4];

                // Menghitung jarak dan skala model
                const distance = Math.sqrt(
                    Math.pow(indexFinger.x - thumb.x, 2) + Math.pow(indexFinger.y - thumb.y, 2)
                );

                const targetScale = distance * 5;
                const smoothedScale = lerp(previousScale || targetScale, targetScale, 0.2);
                previousScale = smoothedScale;
                
                // Update skala relatif terhadap posisi awal
                const currentScale = modelEntity.getAttribute('scale');
                modelEntity.setAttribute('scale', `${smoothedScale} ${smoothedScale} ${smoothedScale}`);

                // Menghitung rotasi model
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
