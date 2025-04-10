const video = document.getElementById("video");
const canvas = document.getElementById("output_canvas");
const ctx = canvas.getContext("2d");
const model = document.getElementById("model");

let previousPosition = null;
let previousScale = null;

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

function adjustSize() {
  video.width = window.innerWidth;
  video.height = window.innerHeight;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", adjustSize);
adjustSize();

function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    const index = landmarks[8];
    const thumb = landmarks[4];

    const distance = Math.hypot(index.x - thumb.x, index.y - thumb.y);
    const scale = distance * 5;
    const smoothScale = lerp(previousScale || scale, scale, 0.2);
    previousScale = smoothScale;
    model.setAttribute("scale", `${smoothScale} ${smoothScale} ${smoothScale}`);

    const x = (index.x - 0.5) * 2;
    const y = -(index.y - 0.5) * 2 + 1.5;
    const z = -1.5;

    previousPosition = previousPosition || { x, y, z };
    const smoothX = lerp(previousPosition.x, x, 0.2);
    const smoothY = lerp(previousPosition.y, y, 0.2);
    const smoothZ = lerp(previousPosition.z, z, 0.2);
    previousPosition = { x: smoothX, y: smoothY, z: smoothZ };

    model.setAttribute("position", `${smoothX} ${smoothY} ${smoothZ}`);
  }
}

document.getElementById("startButton").addEventListener("click", async () => {
  try {
    // Request both orientation and motion permissions for iOS
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      const orientationPermission = await DeviceOrientationEvent.requestPermission();
      const motionPermission = await DeviceMotionEvent.requestPermission();
      
      if (orientationPermission !== "granted" || motionPermission !== "granted") {
        throw new Error("Permissions required for AR");
      }
    }

    const camera = new Camera(video, {
      onFrame: async () => await hands.send({ image: video }),
      facingMode: "environment",
      width: 1280,  // Higher resolution
      height: 720,
    });
    
    try {
      await camera.start();
      document.getElementById("startButton").style.display = "none";
    } catch (error) {
      alert("Error starting camera: " + error.message);
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
});

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});
hands.onResults(onResults);
