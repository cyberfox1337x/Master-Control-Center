let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
  }
});


const installButton = document.getElementById('install-button');
if (installButton) {
  installButton.addEventListener('click', async () => {
    installButton.style.display = 'none';

    if (deferredPrompt) {
      deferredPrompt.prompt();
    //   const { outcome } = await deferredPrompt.userChoice;

      deferredPrompt = null;
    }
  });
}
