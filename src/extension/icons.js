// Tab icon management via OffscreenCanvas.

// Draw a 32×32 icon.
// active=true → orange (valid Amazon product page), false → grey (anywhere else).
export function drawTabIcon(active) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = active ? "#FF9900" : "#AAAAAA";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.round(size * 0.55)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", size / 2, size / 2 + 1);
  return ctx.getImageData(0, 0, size, size);
}

export function setTabIcon(tabId, active) {
  try {
    chrome.action.setIcon({ imageData: drawTabIcon(active), tabId });
  } catch (e) {
    // OffscreenCanvas unavailable — default icon is used
  }
}
