const API_URLS = {
  RAWG: 'https://api.rawg.io/api',
  CLEARBIT: 'https://logo.clearbit.com',
  STEAM_STATIC: 'https://cdn.akamai.steamstatic.com',
  STEAM_GRID_DB: 'https://www.steamgriddb.com/api/v2',
  GOOGLE_FAVICON: 'https://www.google.com/s2'
};

const guessDomainFromName = (name) => {
    if (!name) return null

    return name
      .toLowerCase()
      .replace(/_/g, '')
      .replace(/ /g, '')
      .replace('code', '')
      .replace('studio', '')
      + '.com'
}


/**
 * @param {string} name
 * @param {object} apiKeys
 * (ex: { steamGridDB: 'KEY', rawg: 'KEY' })
 * @returns {Promise<string|null>}
 */
export async function getBestIcon(name, mode = 'generic', apiKeys = {}) {
  if (mode === 'generic') {
    const getIconFAPI = async (exe_name, key, API) => {
      if (apiKeys.steamGridDB) {
        const iconUrl = await API(exe_name, key)
        if (iconUrl) return iconUrl

        return -1
      }
    }

    if (apiKeys) {
      let icon = getIconFAPI(name, apiKeys.steamGridDB, searchSteamGridDB)
      if (icon === -1) return getIconFAPI(name, apiKeys.rawg, searchRawg)

      return icon
    }


    const domain = guessDomainFromName(name)
    if (domain) {
      const iconUrlClearbit = await searchClearbit(domain)
      if (iconUrlClearbit) return iconUrlClearbit

      const iconUrlGF = await searchGoogleFavicon(domain);
      if (iconUrlGF) return iconUrlGF
    }
  }

  if (mode === 'steam')
    return await getSteamStaticDB(name)
  return null
}


async function getSteamStaticDB(gameID) {
  try {
    const searchUrl = `${API_URLS.STEAM_STATIC}/steam/apps/${encodeURIComponent(gameID)}/header.jpg`
    const searchResponse = await fetch(searchUrl)

    console.log(searchResponse)
    if (!searchResponse.ok) return null
    console.log(searchUrl)
    return searchUrl
  } catch (error) {
    console.error('SteamGridDB:', error)
    return null
  }
}

async function searchSteamGridDB(name, key) {
  try {
    const searchUrl = `${API_URLS.STEAM_GRID_DB}/search/autocomplete/${encodeURIComponent(name)}`
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${key}` }
    })

    if (!searchResponse.ok) return null

    const searchData = await searchResponse.json()
    if (!searchData.success || searchData.data.length === 0) return null

    const gameId = searchData.data[0].id
    const iconsUrl = searchAPISteamGridDB + `/icons/game/${gameId}`

    const iconsResponse = await fetch(iconsUrl, {
      headers: { 'Authorization': `Bearer ${key}` }
    })

    if (!iconsResponse.ok) return null

    const iconsData = await iconsResponse.json()
    if (iconsData.success && iconsData.data.length > 0) {
      return iconsData.data[0].url
    }

    return null
  } catch (error) {
    console.error('SteamGridDB:', error)
    return null
  }
}

async function searchRawg(name, key) {
  try {
    const url = `${API_URLS.RAWG}/games?key=${key}&search=${encodeURIComponent(name)}&page_size=1`
    const response = await fetch(url)
    if (!response.ok) return null

    const data = await response.json()
    if (data.results && data.results.length > 0 && data.results[0].background_image) {
      return data.results[0].background_image
    }

    return null
  } catch (error) {
    console.error('RAWG:', error);
    return null
  }
}

async function searchClearbit(domain) {
  try {
    const url = `${API_URLS.CLEARBIT}/${domain}`;
    const response = await fetch(url);

    if (response.ok && response.status !== 202 && !response.url.includes('placeholder')) {
      return url;
    }

    return null;
  } catch (error) { return null }
}

async function searchGoogleFavicon(domain) {
  try {
    const url = `${API_URLS.GOOGLE_FAVICON}/favicons?domain=${domain}&sz=128`;
    const response = await fetch(url)

    const blob = await response.blob()
    if (response.ok && blob.size > 100) return url

    return null
  } catch (error) { return null }
}
