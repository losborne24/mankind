// QA only: paste into the local app's DevTools Console. Not imported by the app.
// First choose Visit settlement (or Relocate nearby).
// Close DevTools immediately after invoking; capture occurs after viewport resize.
// Actual MapLibre/Three shared canvas, no image editing or generated artwork.
window.captureSettlement = (name = "mankind-settlement-world-building") => {
  const map = window.__globe.map;
  map.jumpTo({ zoom: 18.9, pitch: 55, bearing: -25 });
  setTimeout(() => {
    map.once("render", () => {
      const link = document.createElement("a");
      link.download = `${name}.png`;
      link.href = map.getCanvas().toDataURL("image/png");
      link.click();
      console.log("Settlement capture", JSON.stringify({
        center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(),
        bearing: map.getBearing(), terrain: map.getTerrain(),
        viewport: [map.getCanvas().width, map.getCanvas().height],
      }));
    });
    map.triggerRepaint();
  }, 4000);
};
