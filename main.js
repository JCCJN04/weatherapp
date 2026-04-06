import * as L from 'leaflet';

// --- Default configurations ---
const DEFAULT_LAT = 25.6866; // Monterrey, MX
const DEFAULT_LNG = -100.3161;
const DEFAULT_ZOOM = 10;

// --- State ---
let map = null;
let currentMarker = null;

// --- DOM Elements ---
const weatherInfo = document.getElementById('weather-info');
const loadingState = document.getElementById('loading-state');
const initialState = document.getElementById('initial-state');

const elLocationName = document.getElementById('location-name');
const elElevationDisplay = document.getElementById('elevation-display');
const elElevationValue = document.getElementById('elevation-value');
const elCoordsDisplay = document.getElementById('coords-display');
const elWeatherDesc = document.getElementById('weather-desc');
const elTemperature = document.getElementById('temperature');
const elFeelsLike = document.getElementById('feels-like');
const elHumidity = document.getElementById('humidity');
const elWindSpeed = document.getElementById('wind-speed');
const elWindGusts = document.getElementById('wind-gusts');
const elUvIndex = document.getElementById('uv-index');
const elPrecipProb = document.getElementById('precip-prob');
const elSunrise = document.getElementById('sunrise-time');
const elSunset = document.getElementById('sunset-time');
const elCloudCover = document.getElementById('cloud-cover');
const elWeatherIcon = document.getElementById('weather-icon-container');
const elSafetyBadge = document.getElementById('safety-badge');
const elSafetyIcon = document.getElementById('safety-icon');
const elSafetyTitle = document.getElementById('safety-title');
const elSafetyDetail = document.getElementById('safety-detail');
const elRecommendationText = document.getElementById('recommendation-text');
const elForecastContainer = document.getElementById('forecast-container');
const elForecastDays = document.getElementById('forecast-days');
const elHourlyContainer = document.getElementById('hourly-forecast-container');
const elHourlyDayTitle = document.getElementById('hourly-day-title');
const elHourlyList = document.getElementById('hourly-list');
const elCloseHourlyBtn = document.getElementById('close-hourly-btn');
const elCityInput = document.getElementById('city-input');
const elSearchBtn = document.getElementById('search-btn');

// --- Initialization ---
function init() {
    initMap();
    setupEventListeners();
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18
    }).addTo(map);

    L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}{r}.png', {
        attribution: 'Map tiles by Stamen Design, CC BY 3.0 &mdash; Map data &copy; OpenStreetMap contributors',
        subdomains: 'abcd',
        maxZoom: 18,
        opacity: 0.7
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    map.on('click', handleMapClick);
}

function setupEventListeners() {
    elCloseHourlyBtn.addEventListener('click', () => {
        elHourlyContainer.classList.add('hidden');
        document.querySelectorAll('.forecast-day').forEach(el => el.classList.remove('active'));
    });

    elSearchBtn.addEventListener('click', handleSearch);
    elCityInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    document.getElementById('use-location-btn')?.addEventListener('click', handleUseMyLocation);

    // Mobile bottom sheet toggle
    document.getElementById('sheet-handle')?.addEventListener('click', () => {
        document.querySelector('.weather-panel')?.classList.toggle('sheet-collapsed');
    });
}

// --- Event Handlers ---
async function handleMapClick(e) {
    const { lat, lng } = e.latlng;
    showLoading();
    try {
        map.flyTo([lat, lng]);
        updateMarker(lat, lng);

        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        const geoData = await geoRes.json();
        const locationName = geoData.address?.city
            || geoData.address?.town
            || geoData.address?.village
            || geoData.address?.county
            || geoData.address?.state
            || 'Ubicación Desconocida';

        await fetchWeatherData(lat, lng, locationName);
    } catch (error) {
        console.error('Map click error:', error);
        showError('Error al obtener datos. Intenta de nuevo.');
    }
}

async function handleSearch() {
    const query = elCityInput.value.trim();
    if (!query) return;
    showLoading();
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const results = await res.json();

        if (!results.length) {
            showError(`No se encontró "${query}". Intenta otro nombre.`);
            return;
        }

        const { lat, lon, display_name } = results[0];
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        const nameParts = display_name.split(',');
        const locationName = nameParts.slice(0, 2).join(', ').trim();

        map.flyTo([latNum, lonNum], 12);
        updateMarker(latNum, lonNum);
        await fetchWeatherData(latNum, lonNum, locationName);
    } catch (error) {
        console.error('Search error:', error);
        showError('Error en la búsqueda. Intenta de nuevo.');
    }
}

function handleUseMyLocation() {
    if (!navigator.geolocation) {
        showError('Geolocalización no disponible en este navegador.');
        return;
    }
    showLoading();
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            try {
                map.flyTo([lat, lng], 13);
                updateMarker(lat, lng);
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
                const geoData = await geoRes.json();
                const locationName = geoData.address?.city
                    || geoData.address?.town
                    || geoData.address?.village
                    || 'Mi Ubicación';
                await fetchWeatherData(lat, lng, locationName);
            } catch {
                await fetchWeatherData(lat, lng, 'Mi Ubicación');
            }
        },
        () => showError('No se pudo obtener tu ubicación. Verifica los permisos.')
    );
}

// --- Weather Data Fetching ---
async function fetchWeatherData(lat, lon, locationName) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast`
            + `?latitude=${lat}&longitude=${lon}`
            + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,uv_index,is_day`
            + `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_gusts_10m_max,wind_direction_10m_dominant`
            + `&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_gusts_10m,weather_code,cloud_cover,is_day`
            + `&timezone=auto&forecast_days=7`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.error) throw new Error(data.reason);

        updateUI(locationName, data.current, data.daily, data.hourly, lat, lon, data.elevation);
    } catch (error) {
        console.error('Weather fetch error:', error);
        showError('Error al cargar el clima. Intenta de nuevo.');
    }
}

function updateMarker(lat, lng) {
    if (currentMarker) map.removeLayer(currentMarker);

    const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width: 22px; height: 22px;
            background: rgba(74, 222, 128, 0.9);
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 15px rgba(74, 222, 128, 0.8);
            animation: pulse 2s infinite;
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });

    currentMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
}

// --- Main UI Update ---
function updateUI(locationName, current, daily, hourly, lat, lon, elevation) {
    loadingState.classList.add('hidden');
    initialState.classList.add('hidden');
    weatherInfo.classList.remove('hidden');

    // Auto-expand bottom sheet on mobile when data loads
    document.querySelector('.weather-panel')?.classList.remove('sheet-collapsed');

    const condition = getWeatherCondition(current.weather_code, current.is_day);

    // Theme
    document.body.classList.toggle('theme-light', current.is_day === 1);

    // Location header
    elLocationName.textContent = locationName;
    const lonDir = lon < 0 ? 'O' : 'E';
    elCoordsDisplay.textContent = `${lat.toFixed(4)}°N  ${Math.abs(lon).toFixed(4)}°${lonDir}`;

    if (elevation !== undefined && elevation !== null) {
        elElevationValue.textContent = `${Math.round(elevation)} m s.n.m.`;
        elElevationDisplay.classList.remove('hidden');
    } else {
        elElevationDisplay.classList.add('hidden');
    }

    // Condition & temperature
    elWeatherDesc.textContent = condition.description;
    elWeatherIcon.innerHTML = condition.iconSvg;
    elTemperature.textContent = `${Math.round(current.temperature_2m)}°`;
    elFeelsLike.textContent = `Se siente: ${Math.round(current.apparent_temperature)}°`;

    // Wind
    const windDir = degreesToCompass(current.wind_direction_10m);
    elWindSpeed.textContent = `${Math.round(current.wind_speed_10m)} km/h ${windDir}`;
    elWindGusts.textContent = `${Math.round(current.wind_gusts_10m)} km/h`;

    // Humidity & cloud
    elHumidity.textContent = `${current.relative_humidity_2m}%`;
    elCloudCover.textContent = `${current.cloud_cover}%`;

    // UV Index with color
    const uv = Math.round(current.uv_index ?? 0);
    const uvLabel = getUvLabel(uv);
    const uvColor = getUvColor(uv);
    elUvIndex.innerHTML = `<span style="color:${uvColor};font-weight:700;">${uv}</span><small style="color:${uvColor};font-size:0.78rem;margin-left:5px;">${uvLabel}</small>`;

    // Today's precip probability
    const todayPrecipProb = daily.precipitation_probability_max?.[0] ?? 0;
    elPrecipProb.textContent = `${todayPrecipProb}%`;

    // Sunrise & Sunset (today = index 0)
    elSunrise.textContent = formatTime(daily.sunrise?.[0]);
    elSunset.textContent = formatTime(daily.sunset?.[0]);

    // Safety assessment
    const safety = calculateHikingSafety(current, daily, 0);
    updateSafetyBadge(safety);
    elRecommendationText.textContent = getHikingRecommendation(safety, current, daily, 0);

    // Forecast
    renderForecast(daily, hourly);
}

function updateSafetyBadge(safety) {
    elSafetyBadge.className = `safety-badge safety-${safety.level}`;

    const icons = { safe: '✓', caution: '⚠', danger: '✕' };
    const titles = { safe: 'CONDICIONES IDEALES', caution: 'PRECAUCIÓN', danger: 'NO RECOMENDADO' };

    elSafetyIcon.textContent = icons[safety.level];
    elSafetyTitle.textContent = titles[safety.level];
    elSafetyDetail.textContent = safety.issues.length > 0
        ? safety.issues[0]
        : 'Perfecto para senderismo hoy';
}

// --- Forecast Rendering ---
function renderForecast(daily, hourly) {
    elForecastDays.innerHTML = '';
    elForecastContainer.classList.remove('hidden');
    elHourlyContainer.classList.add('hidden');

    const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayNamesFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    for (let i = 0; i < 7; i++) {
        if (!daily.time[i]) continue;

        const dateStr = daily.time[i];
        const dateObj = new Date(dateStr + 'T12:00:00');
        const shortName = i === 0 ? 'Hoy' : (i === 1 ? 'Mañana' : dayNamesShort[dateObj.getDay()]);
        const fullName = i === 0 ? 'Hoy' : (i === 1 ? 'Mañana' : dayNamesFull[dateObj.getDay()]);

        const maxTemp = Math.round(daily.temperature_2m_max[i]);
        const minTemp = Math.round(daily.temperature_2m_min[i]);
        const code = daily.weather_code[i];
        const precipProb = daily.precipitation_probability_max?.[i] ?? 0;
        const uvMax = Math.round(daily.uv_index_max?.[i] ?? 0);
        const gusts = Math.round(daily.wind_gusts_10m_max?.[i] ?? 0);
        const snowfall = daily.snowfall_sum?.[i] ?? 0;

        const condition = getWeatherCondition(code, 1);
        const uvColor = getUvColor(uvMax);
        const precipColor = precipProb > 60 ? '#60A5FA' : precipProb > 30 ? '#93C5FD' : 'var(--text-secondary)';
        const snowBadge = snowfall > 0
            ? `<span class="forecast-snow-badge">❄ ${snowfall.toFixed(1)}cm</span>`
            : '';

        const dayEl = document.createElement('div');
        dayEl.className = 'forecast-day';
        dayEl.title = 'Ver pronóstico por hora';
        dayEl.innerHTML = `
            <div class="forecast-day-left">
                <span class="forecast-day-name">${shortName}</span>
                <div class="forecast-day-icon">${condition.iconSvg}</div>
            </div>
            <div class="forecast-day-right">
                <div class="forecast-temps">
                    <span class="forecast-temp-max">${maxTemp}°</span>
                    <span class="forecast-temp-min">${minTemp}°</span>
                    ${snowBadge}
                </div>
                <div class="forecast-meta">
                    <span class="forecast-meta-item" style="color:${precipColor}">💧${precipProb}%</span>
                    <span class="forecast-meta-item" style="color:${uvColor}">UV${uvMax}</span>
                    <span class="forecast-meta-item">💨${gusts}</span>
                </div>
            </div>
        `;

        dayEl.addEventListener('click', () => {
            document.querySelectorAll('.forecast-day').forEach(el => el.classList.remove('active'));
            dayEl.classList.add('active');
            showHourlyForecast(fullName, dateStr, hourly);
        });

        elForecastDays.appendChild(dayEl);
    }
}

function showHourlyForecast(dayName, dateStr, hourly) {
    elHourlyDayTitle.textContent = dayName;
    elHourlyList.innerHTML = '';

    let startIndex = -1;
    for (let i = 0; i < hourly.time.length; i++) {
        if (hourly.time[i]?.substring(0, 10) === dateStr) {
            startIndex = i;
            break;
        }
    }

    if (startIndex !== -1) {
        for (let i = startIndex; i < startIndex + 24 && i < hourly.time.length; i += 2) {
            const timeStr = hourly.time[i].split('T')[1];
            const temp = Math.round(hourly.temperature_2m[i]);
            const feelsLike = Math.round(hourly.apparent_temperature?.[i] ?? temp);
            const code = hourly.weather_code[i];
            const isDay = hourly.is_day[i];
            const precipProb = hourly.precipitation_probability?.[i] ?? 0;
            const gusts = Math.round(hourly.wind_gusts_10m?.[i] ?? 0);
            const condition = getWeatherCondition(code, isDay);

            const precipColor = precipProb > 60 ? '#60A5FA' : precipProb > 30 ? '#93C5FD' : 'var(--text-secondary)';

            const hrEl = document.createElement('div');
            hrEl.className = 'hourly-item';
            hrEl.innerHTML = `
                <span class="hourly-time">${timeStr}</span>
                <div class="hourly-icon">${condition.iconSvg}</div>
                <div class="hourly-data">
                    <span class="hourly-temp">${temp}°</span>
                    <span class="hourly-feels">ST ${feelsLike}°</span>
                </div>
                <div class="hourly-extra">
                    <span style="color:${precipColor};font-size:0.8rem;">💧${precipProb}%</span>
                    <span style="font-size:0.8rem;color:var(--text-secondary);">💨${gusts}km/h</span>
                </div>
            `;
            elHourlyList.appendChild(hrEl);
        }
    }

    elHourlyContainer.classList.remove('hidden');
}

// --- Hiking Safety Assessment ---
function calculateHikingSafety(current, daily, dayIndex) {
    let level = 'safe';
    const issues = [];

    const code = current.weather_code;
    const gusts = current.wind_gusts_10m ?? 0;
    const uv = current.uv_index ?? 0;
    const temp = current.apparent_temperature ?? current.temperature_2m;
    const precipProb = daily.precipitation_probability_max?.[dayIndex] ?? 0;
    const snowfall = daily.snowfall_sum?.[dayIndex] ?? 0;

    // Thunderstorms → always danger
    if ([95, 96, 99].includes(code)) {
        level = 'danger';
        issues.push('Tormentas eléctricas activas');
    }

    // Heavy snow
    if ([75, 77].includes(code) || snowfall > 5) {
        level = 'danger';
        issues.push('Nevada intensa en la ruta');
    } else if ([71, 73].includes(code) || snowfall > 0) {
        if (level !== 'danger') level = 'caution';
        issues.push('Nieve ligera en la ruta');
    }

    // Dangerous wind gusts
    if (gusts > 70) {
        level = 'danger';
        issues.push(`Ráfagas peligrosas: ${Math.round(gusts)} km/h`);
    } else if (gusts > 45) {
        if (level !== 'danger') level = 'caution';
        issues.push(`Ráfagas fuertes: ${Math.round(gusts)} km/h`);
    }

    // High precipitation probability
    if (precipProb > 70) {
        if (level !== 'danger') level = 'caution';
        issues.push(`Lluvia muy probable: ${precipProb}%`);
    } else if (precipProb > 50) {
        if (level === 'safe') level = 'caution';
        issues.push(`Lluvia posible: ${precipProb}%`);
    }

    // Extreme UV
    if (uv >= 8) {
        if (level === 'safe') level = 'caution';
        issues.push(`Índice UV muy alto: ${Math.round(uv)}`);
    }

    // Extreme heat
    if (temp > 40) {
        level = 'danger';
        issues.push('Calor extremo, riesgo de golpe de calor');
    } else if (temp > 35) {
        if (level !== 'danger') level = 'caution';
        issues.push('Calor intenso, hidratación constante');
    }

    // Extreme cold
    if (temp < -20) {
        level = 'danger';
        issues.push('Frío extremo, riesgo de hipotermia');
    } else if (temp < -5) {
        if (level !== 'danger') level = 'caution';
        issues.push('Temperatura muy baja, capas abrigadoras esenciales');
    }

    // Fog (reduced visibility)
    if ([45, 48].includes(code)) {
        if (level === 'safe') level = 'caution';
        issues.push('Visibilidad reducida por niebla');
    }

    return { level, issues };
}

function getHikingRecommendation(safety, current, daily, dayIndex) {
    const uv = Math.round(current.uv_index ?? 0);
    const temp = current.apparent_temperature ?? current.temperature_2m;
    const wind = Math.round(current.wind_speed_10m ?? 0);
    const gusts = Math.round(current.wind_gusts_10m ?? 0);
    const precipProb = daily.precipitation_probability_max?.[dayIndex] ?? 0;
    const sunrise = formatTime(daily.sunrise?.[dayIndex]);
    const sunset = formatTime(daily.sunset?.[dayIndex]);

    if (safety.level === 'danger') {
        const reason = safety.issues[0] || 'Condiciones adversas';
        return `${reason}. Pospón tu excursión para un día más seguro.`;
    }

    const tips = [];

    if (safety.level === 'caution') {
        tips.push(safety.issues[0] + '.');
        if (precipProb > 40) tips.push('Lleva impermeable.');
        if (uv >= 6) tips.push(`Protector solar FPS 50+ (UV ${uv}).`);
        if (gusts > 35) tips.push('Evita crestas y zonas expuestas.');
        return 'Precaución: ' + tips.join(' ');
    }

    // Level: safe — build positive tips
    tips.push(`Buenas condiciones. Hora ideal: entre ${sunrise} y ${sunset}.`);
    if (uv >= 6) tips.push(`UV ${uv}: usa protector solar y sombrero.`);
    if (temp < 5) tips.push('Temperatura baja, lleva capas extra.');
    if (temp > 28) tips.push('Hidratación frecuente, sal temprano.');
    if (wind > 25) tips.push(`Viento notable (${wind} km/h), prefiere rutas abrigadas.`);
    if (precipProb > 20) tips.push(`${precipProb}% de lluvia, lleva impermeable ligero.`);
    if (uv < 3 && temp >= 10 && precipProb < 20) tips.push('Condiciones óptimas para disfrutar la naturaleza.');

    return tips.join(' ');
}

// --- UI State Helpers ---
function showLoading() {
    initialState.classList.add('hidden');
    weatherInfo.classList.add('hidden');
    loadingState.classList.remove('hidden');
    elHourlyContainer?.classList.add('hidden');
}

function showError(msg) {
    loadingState.classList.add('hidden');
    // Restore initial state if no weather is loaded
    if (weatherInfo.classList.contains('hidden')) {
        initialState.classList.remove('hidden');
    }
    // Show toast notification
    const existing = document.querySelector('.error-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast?.remove(), 4000);
}

// --- WMO Weather Code Mapping ---
function getWeatherCondition(code, isDay) {
    const c = {
        0:  { desc: 'Despejado',            icon: isDay ? getSunIcon() : getMoonIcon() },
        1:  { desc: 'Mayormente Despejado', icon: isDay ? getCloudSunIcon() : getCloudMoonIcon() },
        2:  { desc: 'Parcialmente Nublado', icon: isDay ? getCloudSunIcon() : getCloudMoonIcon() },
        3:  { desc: 'Nublado',              icon: getCloudIcon() },
        45: { desc: 'Niebla',               icon: getFogIcon() },
        48: { desc: 'Niebla con Escarcha',  icon: getFogIcon() },
        51: { desc: 'Llovizna Ligera',      icon: getRainIcon() },
        53: { desc: 'Llovizna Moderada',    icon: getRainIcon() },
        55: { desc: 'Llovizna Densa',       icon: getRainIcon() },
        61: { desc: 'Lluvia Ligera',        icon: getRainIcon() },
        63: { desc: 'Lluvia Moderada',      icon: getRainIcon() },
        65: { desc: 'Lluvia Fuerte',        icon: getRainIcon() },
        71: { desc: 'Nieve Ligera',         icon: getSnowIcon() },
        73: { desc: 'Nieve Moderada',       icon: getSnowIcon() },
        75: { desc: 'Nieve Fuerte',         icon: getSnowIcon() },
        77: { desc: 'Granizo',              icon: getSnowIcon() },
        80: { desc: 'Chubascos Ligeros',    icon: getRainIcon() },
        81: { desc: 'Chubascos Moderados',  icon: getRainIcon() },
        82: { desc: 'Chubascos Violentos',  icon: getRainIcon() },
        85: { desc: 'Nevadas Ligeras',      icon: getSnowIcon() },
        86: { desc: 'Nevadas Fuertes',      icon: getSnowIcon() },
        95: { desc: 'Tormenta',             icon: getStormIcon() },
        96: { desc: 'Tormenta con Granizo', icon: getStormIcon() },
        99: { desc: 'Tormenta Fuerte',      icon: getStormIcon() },
    };
    const match = c[code] || { desc: 'Variable', icon: getCloudIcon() };
    return { description: match.desc, iconSvg: match.icon };
}

// --- Helper Functions ---
function degreesToCompass(deg) {
    if (deg === undefined || deg === null) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round(deg / 45) % 8];
}

function getUvLabel(uv) {
    if (uv <= 2) return 'Bajo';
    if (uv <= 5) return 'Moderado';
    if (uv <= 7) return 'Alto';
    if (uv <= 10) return 'Muy Alto';
    return 'Extremo';
}

function getUvColor(uv) {
    if (uv <= 2) return '#22c55e';
    if (uv <= 5) return '#eab308';
    if (uv <= 7) return '#f97316';
    if (uv <= 10) return '#ef4444';
    return '#a855f7';
}

function formatTime(isoString) {
    if (!isoString) return '--:--';
    return isoString.split('T')[1]?.substring(0, 5) || '--:--';
}

// --- SVG Icon Library ---
function getSunIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 20s linear infinite;">
    <circle cx="12" cy="12" r="5" fill="#FBBF24" fill-opacity="0.3"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>`;
}

function getMoonIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#93C5FD" fill-opacity="0.3"></path>
  </svg>`;
}

function getCloudSunIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="#FBBF24" d="M8 2v2"></path>
        <path stroke="#FBBF24" d="M22 8h-2"></path>
        <path stroke="#FBBF24" d="M17.94 3.06l-1.41 1.41"></path>
        <circle cx="12" cy="8" r="4" stroke="#FBBF24" fill="#FBBF24" fill-opacity="0.3"></circle>
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#E2E8F0" stroke="#E2E8F0"></path>
    </svg>`;
}

function getCloudMoonIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="#93C5FD" d="M10 4.14A7 7 0 0 0 16.86 11"></path>
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#E2E8F0" stroke="#E2E8F0"></path>
    </svg>`;
}

function getCloudIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#E2E8F0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: float 3s ease-in-out infinite;">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#E2E8F0" fill-opacity="0.3"></path>
  </svg>`;
}

function getFogIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: float 4s ease-in-out infinite;">
    <line x1="3" y1="8" x2="21" y2="8"></line>
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="5" y1="16" x2="19" y2="16"></line>
    <line x1="7" y1="20" x2="17" y2="20"></line>
  </svg>`;
}

function getRainIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="#E2E8F0" d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#E2E8F0" fill-opacity="0.2"></path>
    <path d="M8 22v-3" stroke-dasharray="2 2" style="animation: rain 1s linear infinite;"></path>
    <path d="M12 22v-3" stroke-dasharray="2 2" style="animation: rain 1.2s linear infinite; animation-delay: 0.2s;"></path>
    <path d="M16 22v-3" stroke-dasharray="2 2" style="animation: rain 0.9s linear infinite; animation-delay: 0.5s;"></path>
  </svg>`;
}

function getSnowIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 10s linear infinite;">
      <path d="M22 12h-4"></path><path d="M18 12l2 2"></path><path d="M18 12l2-2"></path>
      <path d="M6 12H2"></path><path d="M6 12L4 14"></path><path d="M6 12L4 10"></path>
      <path d="M12 22v-4"></path><path d="M12 18l-2 2"></path><path d="M12 18l2 2"></path>
      <path d="M12 6V2"></path><path d="M12 6L10 4"></path><path d="M12 6l2-2"></path>
    </svg>`;
}

function getStormIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="#E2E8F0" d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#475569" fill-opacity="0.5"></path>
    <path d="M13 13l-3 5h4l-3 5" style="animation: flash 2s infinite;"></path>
  </svg>`;
}

// --- Global CSS Animations ---
const styleSheet = document.createElement('style');
styleSheet.innerText = `
@keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.7); }
    70% { box-shadow: 0 0 0 15px rgba(74,222,128,0); }
    100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes float { 0%,100% {transform:translateY(0)} 50% {transform:translateY(-5px)} }
@keyframes rain { 0% {transform:translateY(-5px);opacity:0} 50% {opacity:1} 100% {transform:translateY(5px);opacity:0} }
@keyframes flash { 0%,50%,100% {opacity:1} 25%,75% {opacity:0} }
`;
document.head.appendChild(styleSheet);

document.addEventListener('DOMContentLoaded', init);
