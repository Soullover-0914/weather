document.addEventListener('DOMContentLoaded', () => {
    // *** CRITICAL: YOUR API KEY GOES HERE ***
    // Ensure this key is valid and active on OpenWeatherMap.
    // If weather data or map layers are not showing, this is the first thing to check!
    const API_KEY = '1527d2adc8fe3d42482dc313a6852fbd'; // Replace with your actual, valid API key

    // Immediately cancel any ongoing speech from a previous session on page load
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }

    // *** IMPORTANT: Set to false to fetch LIVE current weather data. ***
    const USE_MOCK_DATA = false; // Set to true for debugging without API calls

    // HARDCODED MOCK DATA (Only used if USE_MOCK_DATA is explicitly set to true)
    const HARDCODED_MOCK_DATA = {
        "current": {
            "coord": { "lon": 80.6083, "lat": 16.3268 },
            "weather": [{ "id": 800, "main": "Clear", "description": "clear sky", "icon": "01d" }],
            "main": {
                "temp": 29.0,
                "feels_like": 28.5,
                "temp_min": 18.0,
                "temp_max": 37.0,
                "pressure": 1012,
                "humidity": 60
            },
            "wind": { "speed": 4.0, "deg": 240 },
            "name": "Vadlamudi",
            "cod": 200
        }
    };

    console.log("Script loaded and DOMContentLoaded fired.");

    // THESE ARE ALREADY FULL URLs
    const BASE_URL_WEATHER = 'https://api.openweathermap.org/data/2.5/weather';
    const BASE_URL_GEOCODING = 'https://api.openweathermap.org/geo/1.0/direct';
    // NEW: OpenWeatherMap Reverse Geocoding API URL
    const BASE_URL_REVERSE_GEOCODING = 'https://api.openweathermap.org/geo/1.0/reverse';


    // --- NEW: Disaster AI Backend URL ---
    // Match your Flask app's URL
    const DISASTER_AI_BACKEND_URL = "https://weather-n7tq.onrender.com";
    // DOM Elements - Ensure these match your HTML IDs
    const cityInput = document.getElementById('cityInput');
    const searchButton = document.getElementById('searchButton');
    const currentTempElem = document.getElementById('currentTemp');
    const skyConditionElem = document.getElementById('skyCondition');
    const todayMinTempElem = document.getElementById('todayMinTemp');
    const todayMaxTempElem = document.getElementById('todayMaxTemp');
    const airQualityValueElem = document.getElementById('airQualityValue');
    const airQualityStatusElem = document.getElementById('airQualityStatus');
    const pollenCountElem = document.getElementById('pollenCount');
    const errorMessageElem = document.getElementById('errorMessage');
    const locationNameElem = document.getElementById('locationName');
    const weatherSuggestionsElem = document.getElementById('weatherSuggestions');
    const windSpeedElem = document.getElementById('windSpeed');
    const humidityElem = document.getElementById('humidity');
    const voiceInputButton = document.getElementById('voiceInputButton');

    // Weather Alert DOM Elements
    const weatherAlertBox = document.getElementById('weatherAlertBox');
    const alertMessageElem = document.getElementById('alertMessage');
    // Ensure this button exists in your HTML if you want to use it
    const closeAlertButton = document.querySelector('.close-alert-button'); 
    // If closeAlertButton is not found, it won't be assigned, and its listener won't be added.
    // Make sure your HTML for weatherAlertBox includes a button with class 'close-alert-button'

    // Map Layer Buttons
    const mapLayerButtons = document.querySelectorAll('.map-layer-button');


    // Background elements
    const weatherBackground = document.getElementById('weatherBackground');
    const weatherParticlesCanvas = document.getElementById('weatherParticlesCanvas');
    const ctx = weatherParticlesCanvas ? weatherParticlesCanvas.getContext('2d') : null;

    // Particle system variables
    let particles = [];
    let particleType = null; // 'rain' or 'snow'
    let animationFrameId;

    // --- Map Variables ---
    let map; // Variable to hold the Leaflet map instance
    let currentMarker; // Variable to hold the Leaflet marker
    let activeWeatherLayer = null; // To keep track of the currently active weather layer
    let disasterMarker; // Marker for AI-detected disaster
    let isSpeaking = false;
    let isListening = false;

    // OpenWeatherMap Tile Layer URLs for weather features (requires API key)
    const OWM_TILE_LAYERS = {
        base: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        temp: L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${API_KEY}`, {
            attribution: 'Weather data &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>',
            opacity: 0.6
        }),
        precipitation: L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${API_KEY}`, {
            attribution: 'Weather data &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>',
            opacity: 0.7 // Slightly increased opacity for better visibility of rain/snow
        }),
        clouds: L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${API_KEY}`, {
            attribution: 'Weather data &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>',
            opacity: 0.6
        }),
        thunderstorm: L.tileLayer(`https://tile.openweathermap.org/map/thunderstorm_new/{z}/{x}/{y}.png?appid=${API_KEY}`, {
            attribution: 'Weather data &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>',
            opacity: 0.7 // Adjust opacity as needed for visibility
        })
    };


    // Element checks - ensure all critical elements are found
    const criticalElements = {
        cityInput, searchButton, currentTempElem, skyConditionElem, todayMinTempElem, todayMaxTempElem,
        airQualityValueElem, airQualityStatusElem, pollenCountElem, errorMessageElem, locationNameElem,
        weatherSuggestionsElem, weatherBackground, windSpeedElem, humidityElem,
        voiceInputButton, weatherAlertBox, alertMessageElem
    };
    for (const key in criticalElements) {
        if (!criticalElements[key]) {
            console.error(`Error: Critical DOM element '${key}' not found.`);
        }
    }
    // Specific check for closeAlertButton as it's optional in HTML
    if (!closeAlertButton) {
        console.warn("Close alert button (.close-alert-button) not found. Alert box will not be dismissible via button.");
    }


    // Initialize Leaflet Map
    function initializeMap(lat, lon) {
        if (!map && document.getElementById('weatherMap')) {
            map = L.map('weatherMap').setView([lat, lon], 13); // Initialize map on the 'weatherMap' div
            OWM_TILE_LAYERS.base.addTo(map); // Add base map layer by default
            console.log("Leaflet map initialized.");

            // NEW: Add right-click listener to the map
            map.on('contextmenu', async (e) => {
                console.log("Right-click detected at:", e.latlng);
                const lat = e.latlng.lat;
                const lon = e.latlng.lng;
                
                // Perform reverse geocoding to get city name
                const cityName = await getCityFromCoordinates(lat, lon);
                if (cityName) {
                    console.log(`Right-clicked city: ${cityName}. Fetching weather...`);
                    getWeatherData(cityName); // Trigger weather search for the right-clicked city
                } else {
                    displayError("Could not identify city at this location.");
                }
            });

        } else if (map) {
            console.log("Map already initialized. Setting view to new coordinates.");
            map.setView([lat, lon], 13); // Just update view if map already exists
        } else {
            console.error("weatherMap div not found. Cannot initialize Leaflet map.");
        }
    }

    // Function to update the active weather map layer
    function updateWeatherMapLayer(layerType) {
        if (!map) {
            console.warn("Map not initialized, cannot update layer.");
            return;
        }

        // Remove the currently active weather layer, if any (excluding base)
        if (activeWeatherLayer && activeWeatherLayer !== OWM_TILE_LAYERS.base) {
            map.removeLayer(activeWeatherLayer);
        }

        // Set the new active layer
        if (layerType === 'base') {
            // Ensure base map is on top if other layers were removed
            OWM_TILE_LAYERS.base.bringToFront();
            activeWeatherLayer = null; // No specific weather layer active
        } else if (OWM_TILE_LAYERS[layerType]) {
            activeWeatherLayer = OWM_TILE_LAYERS[layerType];
            activeWeatherLayer.addTo(map).bringToFront(); // Add and bring to front
        } else {
            console.warn(`Unknown map layer type: ${layerType}`);
            activeWeatherLayer = null;
        }

        // Update active button state
        mapLayerButtons.forEach(button => {
            if (button.dataset.layer === layerType) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }


    // Canvas resizing and animation setup
    function resizeCanvas() {
        if (weatherParticlesCanvas) {
            weatherParticlesCanvas.width = window.innerWidth;
            weatherParticlesCanvas.height = window.innerHeight;
            if (particleType) { // Re-initialize particles if a type is set
                initParticles(particleType);
            }
        }
    }

    // Particle Initialization
    function initParticles(type, count = 200) {
        if (!weatherParticlesCanvas) return;
        particles = [];
        particleType = type;
        console.log(`Initializing ${type} particles with count: ${count}`); // Added log
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * weatherParticlesCanvas.width,
                y: Math.random() * weatherParticlesCanvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 1
            });
        }
    }

    // Particle Drawing and Updating
    function animateParticles() {
        if (!ctx || !weatherParticlesCanvas) return;
        ctx.clearRect(0, 0, weatherParticlesCanvas.width, weatherParticlesCanvas.height);

        if (particleType === 'rain') {
            ctx.fillStyle = 'rgba(174, 194, 224, 0.8)';
            for (let i = 0; i < particles.length; i++) {
                let p = particles[i];
                ctx.fillRect(p.x, p.y, 2, p.size * 5);
                p.x += p.speed * 0.5;
                p.y += p.speed * 4;

                if (p.y > weatherParticlesCanvas.height) {
                    p.y = -10;
                    p.x = Math.random() * weatherParticlesCanvas.width;
                }
            }
        } else if (particleType === 'snow') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            for (let i = 0; i < particles.length; i++) {
                let p = particles[i];
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                p.x += Math.sin(p.y * 0.05) * 0.5;
                p.y += p.speed * 0.8;

                if (p.y > weatherParticlesCanvas.height) {
                    p.y = -10;
                    p.x = Math.random() * weatherParticlesCanvas.width;
                }
            }
        }

        animationFrameId = requestAnimationFrame(animateParticles);
    }

    // Function to stop particles
    function stopParticles() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        particles = [];
        if (ctx && weatherParticlesCanvas) ctx.clearRect(0, 0, weatherParticlesCanvas.width, weatherParticlesCanvas.height);
        particleType = null;
    }

    // Function to update the background based on weather
    function updateBackground(weatherMain, isDaytime) {
        if (!weatherBackground) {
            console.error("weatherBackground element not found. Cannot update background visuals.");
            return;
        }

        // Clear all existing weather classes
        weatherBackground.className = '';

        // Stop any ongoing particle animations first
        stopParticles();
        // Clear any ongoing lightning flash timeout
        if (lightningFlashTimeout) {
            clearTimeout(lightningFlashTimeout);
            lightningFlashTimeout = null;
        }

        // Apply new classes and start particle animations if needed
        let className = '';
        switch (weatherMain) {
            case 'Clear':
                className = isDaytime ? 'clear-day' : 'clear-night';
                break;
            case 'Clouds':
                className = isDaytime ? 'clouds-day' : 'clouds-night';
                break;
            case 'Rain':
            case 'Drizzle':
                className = 'rainy';
                initParticles('rain', 300);
                animateParticles();
                break;
            case 'Snow':
                className = 'snowy';
                initParticles('snow', 250);
                animateParticles();
                break;
            case 'Thunderstorm':
                className = 'thunderstorm';
                initParticles('rain', 400); // Explicitly start rain particles for thunderstorm
                animateParticles(); // Ensure animation loop is running for particles
                flashBackground(200); // Trigger lightning flash effect
                break;
            case 'Mist':
            case 'Haze':
            case 'Fog':
                className = 'misty';
                break;
            default:
                className = isDaytime ? 'clear-day' : 'clear-night'; // Fallback
                break;
        }
        weatherBackground.classList.add(className);
        console.log(`Background updated to: ${className}`); // Added console log
    }

    // Simple lightning flash for thunderstorm
    let lightningFlashTimeout;
    function flashBackground(duration) {
        console.log("flashBackground called. Duration:", duration); // Added console log
        if (!weatherBackground) return;

        // Temporarily add a flash class for the effect
        weatherBackground.classList.add('flash');

        // Set timeout to remove flash class and schedule next flash
        lightningFlashTimeout = setTimeout(() => {
            console.log("Removing flash class."); // Added console log
            if (!weatherBackground) return;
            weatherBackground.classList.remove('flash');

            // Schedule next flash only if weather is still thunderstorm
            if (weatherBackground.classList.contains('thunderstorm')) {
                console.log("Scheduling next flash."); // Added console log
                lightningFlashTimeout = setTimeout(() => {
                    flashBackground(duration);
                }, Math.random() * 4000 + 1000); // Random interval for next flash (1 to 5 seconds)
            } else {
                console.log("Thunderstorm class removed, stopping flashes."); // Added console log
            }
        }, duration);
    }


    function displayError(message) {
        if (errorMessageElem) {
            errorMessageElem.textContent = message;
            errorMessageElem.style.display = 'block';
            console.error("Displaying error:", message);
        } else {
            console.error("Could not display error message on screen: errorMessageElem not found. Error:", message);
        }
        // Use window.speechSynthesis
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        hideWeatherAlert(); // Hide any active weather alerts on error
    }

    function clearError() {
        if (errorMessageElem) {
            errorMessageElem.style.display = 'none';
        }
    }

    function isDaytime(iconCode) {
        return iconCode.endsWith('d');
    }

    async function getLatLon(city) {
        try {
            const geoUrl = BASE_URL_GEOCODING + `?q=${city}&limit=1&appid=${API_KEY}`;
            console.log("Fetching geocoding data from:", geoUrl); // Log API call
            const response = await fetch(geoUrl);

            if (!response.ok) {
                const errorData = await response.text();
                console.error(`Geocoding API HTTP Error: ${response.status} - ${response.statusText}`, errorData);
                throw new Error(`Geocoding API error: ${response.statusText} (Status: ${response.status}). Response: ${errorData}`);
            }
            const data = await response.json();
            console.log("Geocoding data received:", data[0]); // Log success
            return { lat: data[0].lat, lon: data[0].lon, name: data[0].name, state: data[0].state, country: data[0].country };
        } catch (error) {
            console.error('Error in getLatLon function:', error);
            throw error; // Re-throw to be caught by getWeatherData
        }
    }

    // NEW: Function to get City Name from Coordinates (Reverse Geocoding)
    async function getCityFromCoordinates(lat, lon) {
        try {
            const reverseGeoUrl = BASE_URL_REVERSE_GEOCODING + `?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
            console.log("Fetching reverse geocoding data from:", reverseGeoUrl);
            const response = await fetch(reverseGeoUrl);

            if (!response.ok) {
                const errorData = await response.text();
                console.error(`Reverse Geocoding API HTTP Error: ${response.status} - ${response.statusText}`, errorData);
                return null;
            }
            const data = await response.json();
            if (data.length === 0) {
                console.warn(`No city found for coordinates: ${lat}, ${lon}.`);
                return null;
            }
            console.log("Reverse geocoding data received:", data[0]);
            return data[0].name; // Return the city name
        } catch (error) {
            console.error('Error in getCityFromCoordinates function:', error);
            return null;
        }
    }


    async function getWeatherData(city) {
        clearError();
        hideWeatherAlert(); // Hide any previous alerts when fetching new data
        if (!city) {
            displayError("Please enter a city name.");
            return;
        }

        try {
            let currentWeatherData;
            let lat, lon, resolvedCityName;

            // Update displayed location name immediately with "Loading..."
            if (locationNameElem) {
                locationNameElem.textContent = `Loading ${city}... ⏳`;
            }

            if (USE_MOCK_DATA) {
                console.warn("Using hardcoded mock data for weather (USE_MOCK_DATA is true).");
                currentWeatherData = HARDCODED_MOCK_DATA.current;
                lat = currentWeatherData.coord.lat;
                lon = currentWeatherData.coord.lon;
                resolvedCityName = currentWeatherData.name;
            } else {
                // Get coordinates first
                const coords = await getLatLon(city);
                lat = coords.lat;
                lon = coords.lon;
                // Use the resolved city name from geocoding API for display
                resolvedCityName = coords.name;
                if (coords.state) resolvedCityName += `, ${coords.state}`;
                if (coords.country) resolvedCityName += `, ${coords.country}`;

                // Fetch current weather
                const weatherUrl = BASE_URL_WEATHER + `?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
                console.log("Fetching current weather data from:", weatherUrl); // Log API call
                const currentWeatherResponse = await fetch(weatherUrl);

                if (!currentWeatherResponse.ok) {
                    const errorData = await currentWeatherResponse.text();
                    console.error(`Current Weather API HTTP Error: ${currentWeatherResponse.status} - ${currentWeatherResponse.statusText}`, errorData);
                    throw new Error(`Error fetching current weather: ${currentWeatherResponse.statusText} (Status: ${currentWeatherResponse.status}). Response: ${errorData}`);
                }
                currentWeatherData = await currentWeatherResponse.json();
                console.log("Current weather data received:", currentWeatherData); // Log success
            }

            const currentSkyCondition = currentWeatherData.weather[0].main;
            const currentIconCode = currentWeatherData.weather[0].icon;

            updateUI(currentWeatherData, resolvedCityName);

            // ✅ ADD THIS LINE (ONLY HERE)
            if (locationNameElem) {
                locationNameElem.textContent = resolvedCityName;
            }

            updateBackground(currentSkyCondition, isDaytime(currentIconCode));
            // Check and display weather alerts (from OpenWeatherMap)
            checkAndDisplayAlerts(currentWeatherData);

            // Trigger Disaster AI Alert based on current location
            triggerDisasterAIAlert(resolvedCityName, lat, lon); // Pass lat/lon for map marker


            // --- Map Update Logic ---
            initializeMap(lat, lon); // Ensure map is initialized
            if (map) {
                map.setView([lat, lon], 13); // Center map on new location

                // Remove previous weather marker and disaster marker
                if (currentMarker) {
                    map.removeLayer(currentMarker); 
                }
                if (disasterMarker) { // Remove previous disaster marker
                    map.removeLayer(disasterMarker);
                    disasterMarker = null; // Reset
                }

                currentMarker = L.marker([lat, lon]).addTo(map)
                    .bindPopup(`${resolvedCityName}<br>Temp: ${Math.round(currentWeatherData.main.temp)}°C`)
                    .openPopup();
            } else {
                console.warn("Map not initialized. Ensure 'weatherMap' div exists in HTML.");
            }

            // Speak weather summary after successful update
            speakWeatherSummary(currentWeatherData, resolvedCityName); // Pass data for accurate summary
            return currentWeatherData; // Return data for potential chaining
        } catch (error) {
            console.error('Caught error during weather data fetch or UI update:', error);
            displayError(`Failed to fetch weather data: ${error.message}. Please check your API key, internet connection, and city spelling.`);
            throw error; // Re-throw to propagate error
        }
    }

    // Function to update all UI elements with weather data
    function updateUI(current, resolvedCityName) {
        if (!current) {
            console.error("updateUI received no data or null/undefined.");
            return;
        }

        // Helper to safely update textContent
        const updateTextContent = (element, value) => {
            if (element) {
                element.textContent = value;
            } else {
                console.warn(`UI element missing: Cannot update ${element ? element.id : 'unknown'}.`);
            }
        };

        // Update location name
        if (locationNameElem) {
            locationNameElem.textContent = resolvedCityName;
        }

        // Update all weather readings
        // Assumes units like C, km/h, % are hardcoded in index.html next to the spans
        updateTextContent(currentTempElem, Math.round(current.main.temp));
        updateTextContent(skyConditionElem, current.weather[0].description.charAt(0).toUpperCase() + current.weather[0].description.slice(1));
        updateTextContent(todayMinTempElem, Math.round(current.main.temp_min));
        updateTextContent(todayMaxTempElem, Math.round(current.main.temp_max));
        updateTextContent(windSpeedElem, `${Math.round(current.wind.speed)}`); // Units are in HTML
        updateTextContent(humidityElem, `${Math.round(current.main.humidity)}`); // Units are in HTML

        // Air Quality and Pollen (Simulated/N/A in this version)
        updateTextContent(airQualityValueElem, 'N/A');
        updateTextContent(airQualityStatusElem, 'Unknown');
        updateTextContent(pollenCountElem, 'Low (simulated)');

        if (weatherSuggestionsElem) {
            weatherSuggestionsElem.innerHTML = generateSuggestions(current);
        } else {
            console.error("Element with ID 'weatherSuggestions' not found.");
        }
    }

    // Function to generate weather suggestions based on current data
    function generateSuggestions(current) {
        if (!current || !current.main || !current.weather || !current.wind) {
            return "Could not generate suggestions due to missing weather data.";
        }

        const temp = current.main.temp;
        const weatherMain = current.weather[0].main;
        const humidity = current.main.humidity;
        const windSpeed = current.wind.speed;
        const suggestions = [];

        // Define adverse weather conditions
        const adverseWeatherConditions = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow', 'Mist', 'Haze', 'Fog'];
        const isAdverseWeather = adverseWeatherConditions.includes(weatherMain);

        // Temperature-based suggestions
        if (temp > 35) { suggestions.push("It's extremely hot! Stay indoors during peak heat hours. Hydrate constantly with water and electrolytes."); }
        else if (temp > 30) { suggestions.push("It's very hot! Stay hydrated and avoid prolonged sun exposure between 10 AM and 4 PM."); }
        else if (temp >= 20 && temp <= 30) {
            // Only suggest pleasant weather if there are no adverse conditions
            if (!isAdverseWeather) {
                suggestions.push("Pleasant weather. Great for outdoor activities!");
                if (weatherMain === 'Clear') {
                    suggestions.push("Perfect day for a walk, exercise, or outdoor sports.");
                }
            } else {
                // If adverse, still give temperature advice but without "pleasant" framing
                suggestions.push(`Temperature is around ${Math.round(temp)}°C.`);
            }
        }
        else if (temp < 20 && temp >= 10) { suggestions.push("It's cool. A light jacket or sweater would be comfortable, especially in the morning or evening."); }
        else if (temp < 10 && temp >= 0) { suggestions.push("It's cold! Dress in warm layers including a jacket, hat, and gloves if heading out."); suggestions.push("Consider warm beverages to stay cozy indoors."); }
        else if (temp < 0) { suggestions.push("It's freezing! Limit time outdoors. Wear heavy winter clothing and protect exposed skin."); suggestions.push("Ensure your home is well-heated."); }

        // Weather condition based suggestions (these should always apply and override "pleasant" context)
        switch (weatherMain) {
            case 'Rain': case 'Drizzle': suggestions.push("Rain expected. Carry an umbrella or wear a raincoat."); suggestions.push("Be extra cautious on wet roads if driving or walking. Reduce speed."); break;
            case 'Thunderstorm': suggestions.push("Thunderstorms are possible. Stay indoors and avoid open areas, trees, and tall structures."); suggestions.push("Unplug sensitive electronics during lightning."); break;
            case 'Snow': suggestions.push("Snowfall expected. Dress very warmly in waterproof and insulated gear."); suggestions.push("Roads might be slippery, drive with extreme care and allow extra travel time."); break;
            case 'Clear':
                // Only add "Enjoy the clear skies!" if not an adverse condition (e.g., clear after a storm)
                if (!isAdverseWeather) {
                    suggestions.push("Enjoy the clear skies!");
                    if (temp > 20) { suggestions.push("Good day for visibility, but remember sun protection if sunny."); }
                }
                break;
            case 'Clouds':
                // Only add "Cloudy conditions..." if not an adverse condition
                if (!isAdverseWeather) {
                    suggestions.push("Cloudy conditions. Good for outdoor activities without direct harsh sun.");
                }
                break;
            case 'Mist': case 'Fog': case 'Haze': suggestions.push("Reduced visibility due to mist/fog. Drive carefully, use low beam headlights, and increase following distance."); suggestions.push("Consider indoor activities if air quality is a concern (check local AQI if available)."); break;
            default: suggestions.push("Weather condition is unique. Be prepared for anything!"); break;
        }

        // Wind speed based suggestions
        if (windSpeed > 30) { suggestions.push("It's quite windy. Secure any loose outdoor items."); if (temp < 20) { suggestions.push("A windbreaker is recommended due to wind chill."); } }
        else if (windSpeed > 15) { suggestions.push("There's a noticeable breeze. Enjoy the fresh air!"); }

        // Humidity based suggestions
        if (humidity > 85) { suggestions.push("Very high humidity. Expect muggy and uncomfortable conditions. Prioritize staying cool and dry. Air conditioning or good ventilation is highly recommended."); }
        else if (humidity > 70) { suggestions.push("High humidity. Opt for breathable, moisture-wicking clothing."); }
        else if (humidity < 30) { suggestions.push("Low humidity. Keep yourself well-hydrated, especially if active, to prevent dry skin or throat."); }

        if (suggestions.length === 0) { suggestions.push("The weather seems moderate. Enjoy your day!"); }
        return suggestions.join("<br>"); // Join with <br> for HTML line breaks
    }

    // Function to speak the weather summary and suggestions
    function speakWeatherSummary(currentData, resolvedCityName) {
        if (!window.speechSynthesis || !currentData) {
            console.warn("Speech Synthesis API not supported or no weather data to speak.");
            return;
        }

        // Cancel any ongoing speech before starting new one
        window.speechSynthesis.cancel();

        const location = resolvedCityName || (locationNameElem ? locationNameElem.textContent : "the current location");
        const temperature = Math.round(currentData.main.temp);
        const condition = currentData.weather[0].description.charAt(0).toUpperCase() + currentData.weather[0].description.slice(1);
        const minTemp = Math.round(currentData.main.temp_min);
        const maxTemp = Math.round(currentData.main.temp_max);
        const windSpeed = Math.round(currentData.wind.speed);
        const humidity = Math.round(currentData.main.humidity);
        const suggestionsText = weatherSuggestionsElem ? weatherSuggestionsElem.textContent : "No specific suggestions.";

        const summary = `Weather in ${location}: Currently ${temperature} degrees Celsius, with ${condition}. Today's low is ${minTemp} and high is ${maxTemp} degrees Celsius. Wind speed is ${windSpeed} kilometers per hour, and humidity is ${humidity} percent. Weather wise tips: ${suggestionsText}`;

        const utterance = new SpeechSynthesisUtterance(summary);
        utterance.lang = 'en-US';
        utterance.rate = 1.0; // You can adjust the speech rate
        utterance.pitch = 1.0; // You can adjust the pitch

        // --- Voice Selection Logic ---
        let femaleVoice = null;
        const voices = window.speechSynthesis.getVoices();
        for (let i = 0; i < voices.length; i++) {
            // Look for a female voice, prioritizing 'Google US English' or similar clear ones
            // The names of voices can vary by browser and operating system.
            // You might need to inspect `voices` in your browser's console to find suitable names.
            if (voices[i].lang === 'en-US' && (voices[i].name.includes('Female') || voices[i].name.includes('Google US English') || voices[i].name.includes('Samantha'))) {
                femaleVoice = voices[i];
                // Optionally, you can break here if the first suitable voice is enough
                // break;
            }
        }

        if (femaleVoice) {
            utterance.voice = femaleVoice;
            console.log("Using female voice:", femaleVoice.name);
        } else {
            console.warn("No specific female voice found. Using default voice.");
        }
        // --- End Voice Selection Logic ---
        // ✅ STOP MIC BEFORE SPEAKING
        if (recognition && isListening) {
            recognition.stop();
        }

        isSpeaking = true;
        utterance.onend = () => {
            isSpeaking = false;
        };
        window.speechSynthesis.speak(utterance);
        console.log("Speaking weather summary...");
    }
    // --- Custom Weather Alert Functions ---
    function displayWeatherAlert(message) {
        if (weatherAlertBox && alertMessageElem) {
            // Replace markdown-like bold with HTML strong tags for proper rendering
            const formattedMessage = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            alertMessageElem.innerHTML = formattedMessage; // Use innerHTML to allow HTML tags
            weatherAlertBox.style.display = 'flex'; // Use flex to center content
            console.warn("Displaying weather alert:", message);
        } else {
            console.error("Weather alert box elements not found. Cannot display alert:", message);
        }
    }

    function hideWeatherAlert() {
        if (weatherAlertBox) {
            weatherAlertBox.style.display = 'none';
        }
    }

    // Function to check for specific conditions and display alerts
    function checkAndDisplayAlerts(current) {
        if (!current || !current.main || !current.weather || !current.wind) {
            return; // Not enough data to check for alerts
        }

        const temp = current.main.temp;
        const weatherMain = current.weather[0].main;
        const windSpeed = current.wind.speed;
        const humidity = current.main.humidity;

        let alertMessages = [];

        // Extreme Temperature Alerts
        if (temp > 38) {
            alertMessages.push("🌡️ **Extreme Heat Warning!** Temperatures are dangerously high. Stay in air-conditioned areas, drink plenty of fluids, and check on vulnerable individuals. Avoid strenuous outdoor activities between 10 AM and 4 PM.");
        } else if (temp < -5) {
            alertMessages.push("🥶**Extreme Cold Warning!** Life-threatening temperatures. Dress in multiple warm layers, cover exposed skin, and limit time outdoors. Protect pipes and bring pets indoors.");
        }

        // Severe Weather Alerts
        switch (weatherMain) {
            case 'Thunderstorm':
                alertMessages.push("⚡️⛈️ **Severe Thunderstorm Warning!** Expect heavy rain, strong winds, and frequent lightning. Seek sturdy shelter immediately. Close windows and unplug sensitive electrical appliances. Do not go outside.");
                break;
            case 'Rain':
            case 'Drizzle':
                // Check if 'rain' property exists and '1h' (last hour) data is available
                if (current.rain && current.rain['1h'] && current.rain['1h'] > 5) { // Check for significant rain (e.g., > 5mm in last hour)
                    alertMessages.push("🌧️ **Heavy Rain Alert!** Intense rainfall causing localized flooding. Roads may be slippery and prone to flooding. Do not drive or walk through flooded areas. Turn around, don't drown.");
                }
                break;
            case 'Snow':
                // Check if 'snow' property exists and '1h' (last hour) data is available
                if (current.snow && current.snow['1h'] && current.snow['1h'] > 2) { // Check for significant snow (e.g., > 2mm in last hour)
                    alertMessages.push("❄️ **Winter Storm Warning!** Significant snowfall will create hazardous travel conditions. Only travel if absolutely necessary. Prepare for potential power outages and ensure emergency supplies are accessible.");
                }
                break;
            case 'Mist':
            case 'Fog':
            case 'Haze':
                alertMessages.push("🌫️ **Dense Fog Advisory!** Visibility is severely reduced. Drive slowly, use low-beam headlights, and increase following distance. Be extra cautious on the roads.");
                break;
        }

        // High Wind Alert
        if (windSpeed > 40) { // Gusts over 40 km/h
            alertMessages.push("💨 **High Wind Advisory!** Strong gusts capable of downing branches and power lines. Secure any loose outdoor objects. High-profile vehicles should exercise extreme caution on highways.");
        }

        // High Humidity Alert
        if (humidity > 95) {
            alertMessages.push("�**Very High Humidity Alert!** Expect muggy and uncomfortable conditions. Prioritize staying cool and dry. Use air conditioning or good ventilation to prevent heat exhaustion.");
        }

        if (alertMessages.length > 0) {
            displayWeatherAlert(alertMessages.join("<br><br>"));
        } else {
            hideWeatherAlert(); // No alerts, ensure it's hidden
        }
    }

    // Function to display AI-detected disaster alert on the map
    function displayAIDisasterAlertOnMap(lat, lon, disasterInfo) {
        if (!map) {
            console.warn("Map not initialized, cannot display AI disaster alert.");
            return;
        }

        // Remove any existing AI disaster marker first
        if (disasterMarker) {
            map.removeLayer(disasterMarker);
        }

        // Create a custom icon for disaster (e.g., a red exclamation mark)
        const disasterIcon = L.divIcon({
            className: 'disaster-icon',
            html: '<i class="fas fa-exclamation-triangle" style="color: red; font-size: 36px; text-shadow: 1px 1px 3px rgba(0,0,0,0.5);"></i>',
            iconSize: [36, 36],
            iconAnchor: [18, 36], // Center the icon bottom
            popupAnchor: [0, -30] // Adjust popup position
        });

        const threatIndex = disasterInfo.threat_index !== undefined ? disasterInfo.threat_index : 'N/A'; // Get Threat Index

        const popupContent = `
            <strong>Disaster Alert!</strong><br>
            Type: ${disasterInfo.disaster_type}<br>
            Status: ${disasterInfo.status.charAt(0).toUpperCase() + disasterInfo.status.slice(1)}<br>
            Severity: ${disasterInfo.severity}<br>
            Threat Index (TI): ${threatIndex}
        `;
        const statusText =
        disasterInfo.status.charAt(0).toUpperCase() +
        disasterInfo.status.slice(1);

        disasterMarker = L.marker([lat, lon], { icon: disasterIcon }).addTo(map)
            .bindPopup(popupContent)
            .openPopup(); // Automatically open the popup

        console.log(`AI Disaster alert displayed on map at [${lat}, ${lon}]: ${disasterInfo.disaster_type}, TI: ${threatIndex}`);
    }

    // Function to trigger Disaster AI Alert via Flask Backend
    async function triggerDisasterAIAlert(locationName, lat, lon) { // Added lat, lon parameters
        console.log(`Attempting to send disaster alert request for: ${locationName}`);
        try {
            const response = await fetch(`${DISASTER_AI_BACKEND_URL}/alert`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ location: locationName })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Disaster AI Backend HTTP error: ${response.status} - ${response.statusText}`, errorText);
                // Optionally display a less critical error to the user, or just log
                // displayError(`Failed to trigger AI alert: ${response.statusText}`);
                return; // Stop execution if backend call failed
            }

            const result = await response.json();
            console.log("Disaster AI Backend Response:", result);

            if (result.status === "success") {
                console.log(`Disaster alert triggered successfully for ${locationName}.`);
                // Call the new function to display the alert on the map
                displayAIDisasterAlertOnMap(lat, lon, result.disaster_info);
            } else if (result.status === "no_disaster") {
                console.log(`No disaster detected by AI for ${locationName}.`);
                if (disasterMarker) {
                    map.removeLayer(disasterMarker);
                    disasterMarker = null;
                }
                // ✅ USER FEEDBACK (IMPORTANT)
                displayWeatherAlert("✅ No disaster detected at this location.");
            } else {
                console.warn(`Unexpected response from AI backend: ${result.message}`);
            }

        } catch (error) {
            console.error('Error sending request to Disaster AI Backend:', error);
            // displayError(`Network error communicating with AI backend.`);
        }
    }


    // --- Speech Recognition Setup ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        recognition.onstart = () => {
            isListening = true;
            console.log("Voice recognition started. Speak now.");
            if (voiceInputButton) voiceInputButton.classList.add('listening');
            displayError("Listening... Speak a city name.");
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                isSpeaking = false;
            }
        };

        recognition.onresult = (event) => {
            // ❌ IGNORE SYSTEM SPEECH
            if (isSpeaking) {
                console.log("Ignored system voice");
                return;
            }
            const transcript = event.results[0][0].transcript.trim();
            console.log("Speech recognized:", transcript);
            if (cityInput) cityInput.value = transcript;
            clearError();
            getWeatherData(transcript)
                .then(data => speakWeatherSummary(data, data.name))
                .catch(error => console.error("Error during voice search and summary:", error));
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'no-speech') {
                displayError("No speech detected. Please try again.");
            } else if (event.error === 'not-allowed') {
                displayError("Microphone access denied. Please allow in browser settings.");
            } else {
                displayError(`Speech recognition error: ${event.error}`);
            }
            if (voiceInputButton) voiceInputButton.classList.remove('listening');
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
        };

        recognition.onend = () => {
            isListening = false;
            console.log("Voice recognition ended.");
            clearError();
            if (voiceInputButton) voiceInputButton.classList.remove('listening');
        };

        if (voiceInputButton) {
            voiceInputButton.addEventListener('click', () => {
                console.log("Voice input button clicked");
                // ✅ STOP SPEAKING IMMEDIATELY
                if (window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                    isSpeaking = false;
                }
                // ✅ STOP OLD LISTENING
                if (recognition && isListening) {
                    recognition.stop();
                    isListening = false;
                    console.log("Stopped previous voice recognition session.");
                }
                // ✅ START NEW LISTENING
                recognition.start();
                isListening = true;
            });
        }
    } else {
        console.warn("Web Speech API not supported in this browser.");
        if (voiceInputButton) {
            voiceInputButton.style.display = 'none';
            displayError("Voice input is not supported in your browser.");
        }
    }

    // --- Event Listeners ---
    if (searchButton) {
        searchButton.addEventListener('click', () => {
            const city = cityInput.value.trim();
            getWeatherData(city);
        });
    } else {
        console.error("Search button not found.");
    }

    if (cityInput) {
        cityInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const city = cityInput.value.trim();
                getWeatherData(city);
            }
        });
    } else {
        console.error("City input field not found.");
    }

    // Close alert button listener
    if (closeAlertButton) {
        closeAlertButton.addEventListener('click', hideWeatherAlert);
    }

    // Map layer button event listeners
    mapLayerButtons.forEach(button => {
        button.addEventListener('click', () => {
            const layerType = button.dataset.layer;
            updateWeatherMapLayer(layerType);
        });
    });


    // Initial load: Get weather for a default city (e.g., Vadlamudi) or user's current location.
    // You can change 'Vadlamudi' to any default city or use navigator.geolocation for current location.
    // For simplicity, starting with a default city.
    getWeatherData('Vadlamudi'); // Load weather for Vadlamudi on startup

    // Add event listener for canvas resizing
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial canvas resize
});
