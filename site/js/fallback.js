// Fallback: If something fails before the loader is hidden
// ensure the loader overlay does not stay visible after page load.
window.addEventListener('load', function () {
  try {
    var ov = document.getElementById('loaderOverlay');
    if (ov) ov.hidden = true;
  } catch (e) {
    // no-op
  }
});

