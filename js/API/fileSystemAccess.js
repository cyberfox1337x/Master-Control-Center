const PATH_BLACKLIST_SEGMENTS = [
  'bin/x64/CrashReporter',
  'commonredist',

  '/_redist/',
  '/redist/',
  '/_installer/',
  '/support/',
  '/tools/',
  '/utils/',
  '/binaries/win32/',
  '/binaries/win64/',
  '/directx/',
  '/vcredist/'
]

const ACF_BLACKLIST = [
  'bonus content',
  'steamworks shared'
]

const EXECUTABLE_BLACKLIST = new Set([
  'crashpad_handler.exe',
  'vc_redist.x64.exe',
  'crashreport.exe',
  'vconsole2.exe',
  'dxsetup.exe',

  'unins000.exe',
  'unins001.exe',
  'unins002.exe',
  'uninstall.exe',
  'uninstaller.exe',

  'vc_redist.x86.exe',
  'vcredist.exe',
  'vcredist_x86.exe',
  'vcredist_x64.exe',

  'dxwebsetup.exe',
  'dotnetfx.exe',
  'oalinst.exe',
  'setup.exe',

  'REDEngineErrorReporter.exe',
  'physx_systemsoftware.exe',
  'ue4prereqsetup_x64.exe',
  'unitycrashhandler64.exe',
  'installermessage.exe',

  'crashhandler.exe',
  'crashreporter.exe',
  'errorreporter.exe',
  'steamerrorreporter.exe',
  'unitycrashhandler32.exe',

  'activation.exe',
  'updater.exe',
  'autoupdater.exe'
])


/**
 * @param {HTMLElement} modalBody
 */
export async function handleBrowseFolderClick(query, modalBody, mode = 'generic') {
  const groupPathInput = modalBody.querySelector(query);
  groupPathInput.value = 'Processing...';

  let selectionMade = false;

  const onFocusHandler = () => {
    setTimeout(() => {
      if (!selectionMade) groupPathInput.value = '';
    }, 100);
  };

  window.addEventListener('focus', onFocusHandler, { once: true });

  try {
    const fileList = await selectDirectory()
      selectionMade = true
      window.removeEventListener('focus', onFocusHandler)

      if (!fileList || fileList.length === 0)
        throw new Error('No folder selected or folder is empty.')

      groupPathInput.value = fileList[0].webkitRelativePath.split('/')[0]

      if (mode === 'generic') {
        const foundExecutables = findExecutables(fileList)
        if (foundExecutables.length > 0) return foundExecutables
      }

      if (mode === 'steam') {
        const foundManifest = await buildSteamAppIdMap(fileList)
        if (foundManifest.size > 0) return foundManifest
      }

      return []
  } catch (error) {
    selectionMade = true;
    window.removeEventListener('focus', onFocusHandler);

    groupPathInput.value = '';
    return []
  }
}


/**
 * @param {FileList} fileList
 * @returns {Promise<Array<{name: string, installdir: string}>>}
 */
function findExecutables(fileList) {
return Array.from(fileList).reduce((executables, file) => {
    const fileNameLower = file.name.toLowerCase();

    if (!fileNameLower.endsWith('.exe'))
      return executables

    if (EXECUTABLE_BLACKLIST.has(fileNameLower))
      return executables


    const relativePathLower = file.webkitRelativePath.toLowerCase().replace(/\\/g, '/');
    if (PATH_BLACKLIST_SEGMENTS.some(part => relativePathLower.includes(part))) {
      return executables;
    }

    executables.push({
      name: file.name,
      path: file.webkitRelativePath
    });

    return executables;
  }, []).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @returns {Promise<FileList>}
 */
const selectDirectory = async () => {
  return new Promise((resolve) => {
    const input = document.createElement('input');

    input.type = 'file';
    input.webkitdirectory = true;

    const onFocus = () => {
      // Adia a verificação para dar tempo ao evento 'change'
      setTimeout(() => {
        if (input.files.length === 0) {
          reject(new Error('Seleção de pasta cancelada.'));
        }
      }, 300);
    };

    input.addEventListener('change', () => {
      resolve(input.files);
    }, { once: true });

    // Adiciona o listener de foco para o cancelamento
    window.addEventListener('focus', onFocus, { once: true });

    input.style.display = 'none';
    document.body.appendChild(input);

    input.click();
  });
}


/**
 * @param {FileList} fileList
 * @returns {Promise<Map<string, string>>}
 */
async function buildSteamAppIdMap(fileList) {
  const appMap = new Map()
  const manifestFiles = []

  for (const file of fileList) {
    const relativePath = file.webkitRelativePath.toLowerCase().replace(/\\/g, '/');

    if (relativePath.endsWith('.acf')) manifestFiles.push(file)
  }

  if (manifestFiles.length === 0) {
    console.warn("no appmanifest_*.acf files found. Make sure that the 'steamapps' folder has been selected.");
    return appMap
  }

  await Promise.all(manifestFiles.map(async (file) => {
    try {
      const content = await file.text()
      const appIdMatch = file.name.match(/appmanifest_(\d+)\.acf/i)

      const installdirMatch = content.match(/"installdir"\s+"([^"]+)"/i)

      if (appIdMatch && installdirMatch) {
        const appId = appIdMatch[1]
        const folderName = installdirMatch[1]

        const isBlacklisted = ACF_BLACKLIST.some(keyword => folderName.toLowerCase().includes(keyword))


        if (!isBlacklisted)
          appMap.set(folderName, appId)
      }
    } catch (e) {
      console.error(`Error reading manifest file ${file.name}:`, e)
    }
  }))

  return appMap
}
