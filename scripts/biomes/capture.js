// QA only: paste into the local application's DevTools console, after map load.
// Exports the actual rendered map canvas (not UI), with identical camera/viewport.
// Keep DevTools docking and browser window size unchanged between both passes.
window.captureTerrain = async (name, camera) => {
  const map = window.__globe.map;
  map.jumpTo(camera);
  await new Promise(resolve => { map.once('idle', resolve); map.triggerRepaint(); });
  // Existing coastline gate 300ms + raster/paint transitions must finish first.
  await new Promise(resolve => setTimeout(resolve, 1000));
  const record = {
    name, center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(),
    bearing: map.getBearing(), terrain: map.getTerrain(),
    hillshade: map.getStyle().layers.find(layer => layer.id === 'terrain-diagnostic'),
    tiles: map.getSource('natural-biomes')?.serialize().tiles,
    viewportPixels: [map.getCanvas().width, map.getCanvas().height],
  };
  await new Promise(resolve => {
    map.once('render', () => {
      const download = document.createElement('a');
      download.download = `${name}.png`;
      download.href = map.getCanvas().toDataURL('image/png');
      download.click();
      resolve();
    });
    map.triggerRepaint();
  });
  console.log(JSON.stringify(record));
  return record;
};
