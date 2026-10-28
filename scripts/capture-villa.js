// QA only: paste in local DevTools after Visit settlement at the original origin.
// Captures the current project-owned house; historical baseline PNGs are retained.
// Close DevTools after invoking; the width guard waits for the undocked viewport.
window.captureVilla = (name = "mankind-villa", elevated = false) => {
  const map = window.__globe.map;
  map.jumpTo({
    center: elevated ? [12.55, 41.85] : [12.5498915, 41.85006295],
    zoom: elevated ? 18.9 : 21, pitch: 55, bearing: elevated ? -25 : -60,
  });
  const capture = () => {
    if (map.getCanvas().width < window.outerWidth * devicePixelRatio - 64) {
      setTimeout(capture, 1000);
      return;
    }
    map.once("render", () => {
      const link = document.createElement("a");
      link.download = `${name}.png`;
      link.href = map.getCanvas().toDataURL("image/png");
      link.click();
      console.log("Villa capture", JSON.stringify({
        asset: "roman-kit/provincial-house.glb",
        center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(),
        bearing: map.getBearing(), terrain: map.getTerrain(),
        viewport: [map.getCanvas().width, map.getCanvas().height],
      }));
    });
    map.triggerRepaint();
  };
  setTimeout(capture, 4000);
};
