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
const elCoordsDisplay = document.getElementById('coords-display');
const elWeatherDesc = document.getElementById('weather-desc');
const elTemperature = document.getElementById('temperature');
const elHumidity = document.getElementById('humidity');
const elWindSpeed = document.getElementById('wind-speed');
const elWeatherIcon = document.getElementById('weather-icon-container');
const elForecastContainer = document.getElementById('forecast-container');
const elForecastDays = document.getElementById('forecast-days');
const elHourlyContainer = document.getElementById('hourly-forecast-container');
const elHourlyDayTitle = document.getElementById('hourly-day-title');
const elHourlyList = document.getElementById('hourly-list');
const elCloseHourlyBtn = document.getElementById('close-hourly-btn');

// --- Initialization ---
function init() {
    initMap();
    setupEventListeners();

    // Optionally auto-fetch for a default location or get user location
    // For now, we wait for user map click
}

function initMap() {
    // Initialize Leaflet Map
    map = L.map('map', {
        zoomControl: false // We will add it to the top right
    }).setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);

    // Add Satellite tile layer (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18 // Satellite usually lacks details at zoom level 19+
    }).addTo(map);

    // Optional: Add a labels layer on top of the satellite imagery so text is still visible
    L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}{r}.png', {
        attribution: 'Map tiles by Stamen Design, CC BY 3.0 &mdash; Map data &copy; OpenStreetMap contributors',
        subdomains: 'abcd',
        maxZoom: 18,
        opacity: 0.7
    }).addTo(map);

    // Add zoom control manually
    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    // Add map click listener
    map.on('click', handleMapClick);
}

function setupEventListeners() {
    elCloseHourlyBtn.addEventListener('click', () => {
        elHourlyContainer.classList.add('hidden');
        document.querySelectorAll('.forecast-day').forEach(el => el.classList.remove('active'));
    });
}

// --- Event Handlers ---
async function handleMapClick(e) {
    const { lat, lng } = e.latlng;
    showLoading();

    try {
        // Fly to click
        map.flyTo([lat, lng]);
        updateMarker(lat, lng);

        // Reverse geocode to get city name
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        const geoData = await geoRes.json();

        const locationName = geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.state ||
            "Ubicación Desconocida";

        // Fetch weather
        await fetchWeatherData(lat, lng, locationName);

    } catch (error) {
        console.error("Map click error:", error);
        showError("Error al obtener datos");
    }
}

// --- Weather Data Fetching & UI Update ---
async function fetchWeatherData(lat, lon, locationName) {
    try {
        // Open-Meteo API for current weather AND daily forecast AND hourly forecast
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=4`;
        const res = await fetch(weatherUrl);
        const data = await res.json();

        if (data.error) {
            throw new Error(data.reason);
        }

        updateUI(locationName, data.current, data.daily, data.hourly, lat, lon);

    } catch (error) {
        console.error("Weather fetch error:", error);
        showError("Error al cargar clima");
    }
}

function updateMarker(lat, lng) {
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Custom beautiful marker using divIcon
    const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width: 24px; 
            height: 24px; 
            background: rgba(96, 165, 250, 0.9); 
            border: 3px solid white; 
            border-radius: 50%; 
            box-shadow: 0 0 15px rgba(96, 165, 250, 0.8);
            animation: pulse 2s infinite;
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    currentMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
}

function updateUI(locationName, current, daily, hourly, lat, lon) {
    // Hide states, show info
    loadingState.classList.add('hidden');
    initialState.classList.add('hidden');
    weatherInfo.classList.remove('hidden');

    // Parse weather code
    const condition = getWeatherCondition(current.weather_code, current.is_day);

    // Update Theme based on daylight
    if (current.is_day === 0) {
        document.body.classList.remove('theme-light');
    } else {
        document.body.classList.add('theme-light');
    }

    // Populate text
    elLocationName.textContent = locationName;
    if (elCoordsDisplay && lat !== undefined && lon !== undefined) {
        elCoordsDisplay.textContent = `Lat: ${lat.toFixed(4)}°, Lng: ${lon.toFixed(4)}°`;
    }
    elWeatherDesc.textContent = condition.description;
    elTemperature.textContent = `${Math.round(current.temperature_2m)}°`;
    elHumidity.textContent = `${current.relative_humidity_2m}%`;
    elWindSpeed.textContent = `${Math.round(current.wind_speed_10m)} km/h`;

    // Update animated icon
    elWeatherIcon.innerHTML = condition.iconSvg;

    // Render 3-Day Forecast
    renderForecast(daily, hourly);
}

function renderForecast(daily, hourly) {
    elForecastDays.innerHTML = ''; // Clear previous
    elForecastContainer.classList.remove('hidden');
    elHourlyContainer.classList.add('hidden'); // Hide hourly initially

    // Arrays for days (API returns arrays for time, code, max, min)
    // We skip index 0 (today) and use 1, 2, 3
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    for (let i = 1; i <= 3; i++) {
        // Handle edges cases if API returns fewer days
        if (!daily.time[i]) continue;

        const dateStr = daily.time[i];
        const dateObj = new Date(dateStr + 'T12:00:00'); // Force midday to avoid timezone shifts
        const dayName = days[dateObj.getDay()];

        const maxTemp = Math.round(daily.temperature_2m_max[i]);
        const minTemp = Math.round(daily.temperature_2m_min[i]);
        const code = daily.weather_code[i];

        const condition = getWeatherCondition(code, 1); // forecast is mostly day representations

        const dayEl = document.createElement('div');
        dayEl.className = 'forecast-day';
        dayEl.style.cursor = 'pointer';
        dayEl.title = 'Ver pronóstico por hora';
        dayEl.innerHTML = `
            <span class="forecast-day-name">${dayName}</span>
            <div class="forecast-day-icon">${condition.iconSvg}</div>
            <div class="forecast-day-temps">
                <span class="forecast-temp-max">${maxTemp}°</span>
                <span class="forecast-temp-min">${minTemp}°</span>
            </div>
        `;

        dayEl.addEventListener('click', () => {
            document.querySelectorAll('.forecast-day').forEach(el => el.classList.remove('active'));
            dayEl.classList.add('active');
            showHourlyForecast(dayName, dateStr, hourly);
        });

        elForecastDays.appendChild(dayEl);
    }
}

function showHourlyForecast(dayName, dateStr, hourly) {
    elHourlyDayTitle.textContent = `Horario: ${dayName}`;
    elHourlyList.innerHTML = '';

    // API returns hourly.time as ["2026-03-06T00:00", "2026-03-06T01:00", ...]
    // dateStr comes in as "2026-03-06"
    const dayPrefix = dateStr;

    // Find starting index for this day
    let startIndex = -1;
    for (let i = 0; i < hourly.time.length; i++) {
        // Safe check for just the date match part as APIs return strings varying in offsets natively.
        if (hourly.time[i] && hourly.time[i].substring(0, 10) === dayPrefix) {
            startIndex = i;
            break;
        }
    }

    if (startIndex !== -1) {
        // Show every 2 hours
        for (let i = startIndex; i < startIndex + 24 && i < hourly.time.length; i += 2) {
            const timeRaw = hourly.time[i];
            const timeStr = timeRaw.split('T')[1]; // get "HH:MM"
            const temp = Math.round(hourly.temperature_2m[i]);
            const code = hourly.weather_code[i];
            const isDay = hourly.is_day[i];

            const condition = getWeatherCondition(code, isDay);

            const hrEl = document.createElement('div');
            hrEl.className = 'hourly-item';
            hrEl.innerHTML = `
                <span class="hourly-time">${timeStr}</span>
                <div class="hourly-icon" style="width: 28px; height: 28px;">${condition.iconSvg}</div>
                <span class="hourly-temp">${temp}°</span>
            `;
            elHourlyList.appendChild(hrEl);
        }
    }

    elHourlyContainer.classList.remove('hidden');
}

// --- UI State Helpers ---
function showLoading() {
    initialState.classList.add('hidden');
    weatherInfo.classList.add('hidden');
    loadingState.classList.remove('hidden');
    if (elHourlyContainer) elHourlyContainer.classList.add('hidden');

    // Try to remove previous error if exists
    const existingError = document.querySelector('.error-msg');
    if (existingError) existingError.remove();
}

function showError(msg) {
    loadingState.classList.add('hidden');
    initialState.classList.remove('hidden');

    initialState.innerHTML = `<p class="error-msg" style="color: #ef4444; font-weight: 500;">${msg}</p>`;
}

// --- WMO Weather Code Mapping (Open-Meteo) ---
function getWeatherCondition(code, isDay) {
    // Mapping based on: https://open-meteo.com/en/docs
    const conditions = {
        0: { desc: "Despejado", icon: isDay ? getSunIcon() : getMoonIcon() },
        1: { desc: "Mayormente Despejado", icon: isDay ? getCloudSunIcon() : getCloudMoonIcon() },
        2: { desc: "Parcialmente Nublado", icon: getCloudIcon() },
        3: { desc: "Nublado", icon: getCloudIcon() },
        45: { desc: "Niebla", icon: getWindIcon() }, // Simplification
        48: { desc: "Niebla escarcha", icon: getWindIcon() },
        51: { desc: "Llovizna Ligera", icon: getRainIcon() },
        53: { desc: "Llovizna Moderada", icon: getRainIcon() },
        55: { desc: "Llovizna Densa", icon: getRainIcon() },
        61: { desc: "Lluvia Ligera", icon: getRainIcon() },
        63: { desc: "Lluvia Moderada", icon: getRainIcon() },
        65: { desc: "Lluvia Fuerte", icon: getRainIcon() },
        71: { desc: "Nieve Ligera", icon: getSnowIcon() },
        73: { desc: "Nieve Moderada", icon: getSnowIcon() },
        75: { desc: "Nieve Fuerte", icon: getSnowIcon() },
        80: { desc: "Chubascos Ligeros", icon: getRainIcon() },
        81: { desc: "Chubascos Moderados", icon: getRainIcon() },
        82: { desc: "Chubascos Violentos", icon: getRainIcon() },
        95: { desc: "Tormenta", icon: getStormIcon() },
        96: { desc: "Tormenta c/ Granizo", icon: getStormIcon() },
        99: { desc: "Tormenta Fuerte", icon: getStormIcon() },
    };

    const match = conditions[code] || { desc: "Desconocido", icon: getCloudIcon() };
    return { description: match.desc, iconSvg: match.icon };
}

// --- Awesome SVG Icons ---
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
  </svg>
  <style>@keyframes float { 0% {transform: translateY(0px)} 50% {transform: translateY(-5px)} 100% {transform: translateY(0px)} }</style>`;
}

function getRainIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="#E2E8F0" d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#E2E8F0" fill-opacity="0.2"></path>
    <path d="M8 22v-3" stroke-dasharray="2 2" style="animation: rain 1s linear infinite;"></path>
    <path d="M12 22v-3" stroke-dasharray="2 2" style="animation: rain 1.2s linear infinite; animation-delay: 0.2s;"></path>
    <path d="M16 22v-3" stroke-dasharray="2 2" style="animation: rain 0.9s linear infinite; animation-delay: 0.5s;"></path>
  </svg>
  <style>@keyframes rain { 0% {transform: translateY(-5px); opacity: 0} 50% {opacity: 1} 100% {transform: translateY(5px); opacity: 0} }</style>`;
}

function getSnowIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 10s linear infinite;">
      <path d="M22 12h-4"></path><path d="M18 12l2 2"></path><path d="M18 12l2-2"></path>
      <path d="M6 12H2"></path><path d="M6 12L4 14"></path><path d="M6 12L4 10"></path>
      <path d="M12 22v-4"></path><path d="M12 18l-2 2"></path><path d="M12 18l2 2"></path>
      <path d="M12 6V2"></path><path d="M12 6L10 4"></path><path d="M12 6l2-2"></path>
      <path d="M19.071 4.929l-2.828 2.828"></path><path d="M16.243 7.757l2.828 0"></path><path d="M16.243 7.757l0-2.828"></path>
      <path d="M4.929 19.071l2.828-2.828"></path><path d="M7.757 16.243l-2.828 0"></path><path d="M7.757 16.243l0 2.828"></path>
      <path d="M19.071 19.071l-2.828-2.828"></path><path d="M16.243 16.243l0 2.828"></path><path d="M16.243 16.243l2.828 0"></path>
      <path d="M4.929 4.929l2.828 2.828"></path><path d="M7.757 7.757l0-2.828"></path><path d="M7.757 7.757l-2.828 0"></path>
    </svg>`;
}

function getWindIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: translateWind 2s ease-in-out infinite alternate;">
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path>
  </svg>
  <style>@keyframes translateWind { from {transform: translateX(-3px)} to {transform: translateX(3px)} }</style>`;
}

function getStormIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="#E2E8F0" d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#475569" fill-opacity="0.5"></path>
    <path d="M13 13l-3 5h4l-3 5" style="animation: flash 2s infinite;"></path>
  </svg>
  <style>@keyframes flash { 0%, 50%, 100% {opacity: 1;} 25%, 75% {opacity: 0;} }</style>`;
}

// Global pulse animation for marker
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.7); }
    70% { box-shadow: 0 0 0 15px rgba(96, 165, 250, 0); }
    100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); }
}
`;
document.head.appendChild(styleSheet);

// Startup
document.addEventListener('DOMContentLoaded', init);
