// disaster_dashboard.js

// Declare Firebase variables globally within this script's scope
let firebaseAuth;
let firebaseDb;
let firebaseAppId;
let firebase;
let currentFirebaseUser = null; // To store the current authenticated user object

document.addEventListener('DOMContentLoaded', () => {
    console.log("Disaster Management Dashboard script loaded.");

    // --- Configuration ---
    // ✅ FIX: Force local backend during development (prevents 404)
    const DISASTER_AI_BACKEND_URL = "http://127.0.0.1:5000"; // Ensure this matches your Flask app's URL
    // OpenWeatherMap API Key for reverse geocoding on this dashboard
    const API_KEY = '1527d2adc8fe3d42482dc313a6852fbd'; // Use your OpenWeatherMap API Key here
    const BASE_URL_REVERSE_GEOCODING = 'https://api.openweathermap.org/geo/1.0/reverse';


    // --- DOM Elements ---
    const disasterCityInput = document.getElementById('disasterCityInput');
    const searchDisasterButton = document.getElementById('searchDisasterButton');
    const disasterAlertBox = document.getElementById('disasterAlertBox');
    const disasterAlertMessageElem = document.getElementById('disasterAlertMessage');
    const disasterMapDiv = document.getElementById('disasterMap');
    const recentAlertsList = document.getElementById('recentAlertsList');
    // Authority Contacts and Communication Logs are now in left-panel
    const authorityContactsList = document.getElementById('authorityContactsList');
    const communicationLogsSection = document.getElementById('communicationLogsSection');
    const communicationLogsList = document.getElementById('communicationLogsList');

    const dashboardInfo = document.getElementById('dashboardInfo'); // For initial info message
    const resourceSuggestionsSection = document.getElementById('resourceSuggestionsSection');
    const resourceSuggestionsList = document.getElementById('resourceSuggestionsList');
    
    // Authority Management DOM Elements
    const authorityForm = document.getElementById('authorityForm');
    const authorityNameInput = document.getElementById('authorityName');
    const authorityEmailInput = document.getElementById('authorityEmail');
    const authorityLocationInput = document.getElementById('authorityLocation');
    const authorityTypeSelect = document.getElementById('authorityType');
    const addAuthorityButton = document.getElementById('addAuthorityButton');
    const updateAuthorityButton = document.getElementById('updateAuthorityButton');
    const cancelEditButton = document.getElementById('cancelEditButton');
    const authorityIdInput = document.getElementById('authorityId'); // Hidden input for ID
    const authoritiesTableBody = document.getElementById('authoritiesTableBody');

    // User Reporting DOM Elements
    const incidentReportForm = document.getElementById('incidentReportForm');
    const incidentTypeSelect = document.getElementById('incidentType');
    const incidentLocationInput = document.getElementById('incidentLocation');
    const incidentDescriptionTextarea = document.getElementById('incidentDescription');
    const incidentSeveritySelect = document.getElementById('incidentSeverity');
    const submitReportButton = document.getElementById('submitReportButton');
    const userReportsTableBody = document.getElementById('userReportsTableBody');

    // Predictive Modeling DOM Elements
    const predictiveStatementSection = document.getElementById('predictiveStatementSection');
    const predictiveStatementText = document.getElementById('predictiveStatementText');

    // Mail Authentication DOM Elements (NEW)
    const authStatusText = document.getElementById('authStatusText');
    const authUserId = document.getElementById('authUserId');
    const signInButton = document.getElementById('signInButton');
    const signOutButton = document.getElementById('signOutButton');


    // Map Layer Buttons (for the dashboard map)
    const mapLayerButtons = document.querySelectorAll('.map-layer-button');

    // --- Map Variables ---
    let map; // Leaflet map instance
    let disasterMarker; // Marker for the detected disaster location
    let currentMapLocation = { lat: 0, lon: 0, name: "World" }; // Default map center

    // Heatmap specific variables
    let heatLayer = null;
    let threatPoints = []; // Array to store [lat, lon, intensity] for heatmap


    // --- Map Initialization and Layers ---
    const OWM_TILE_LAYERS_DASHBOARD = {
        base: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        // Heatmap layer will be created dynamically
    };

    function initializeDisasterMap(lat, lon, zoom = 6) {
        if (!map && disasterMapDiv) {
            map = L.map('disasterMap').setView([lat, lon], zoom);
            OWM_TILE_LAYERS_DASHBOARD.base.addTo(map);
            console.log("Disaster map initialized.");

            // Add right-click listener to the map for disaster search
            map.on('contextmenu', async (e) => {
                console.log("Right-click detected at:", e.latlng);
                const lat = e.latlng.lat;
                const lon = e.latlng.lng;
                
                // Perform reverse geocoding to get city name
                const cityName = await getCityFromCoordinates(lat, lon);
                if (cityName) {
                    console.log(`Right-clicked city: ${cityName}. Triggering disaster alert check...`);
                    getDisasterAlert(cityName); // Trigger disaster alert check for the right-clicked city
                } else {
                    displayInfoMessage("Could not identify city at this location for disaster check.");
                }
            });

        } else if (map) {
            map.setView([lat, lon], zoom);
            console.log("Disaster map view updated.");
        } else {
            console.error("disasterMap div not found. Cannot initialize Leaflet map for dashboard.");
        }
    }

    // Function to update the heatmap
    function updateHeatmap() {
        if (!map) {
            console.warn("Map not initialized, cannot update heatmap.");
            return;
        }

        // Remove existing heat layer if it exists
        if (heatLayer) {
            map.removeLayer(heatLayer);
        }

        if (threatPoints.length > 0) {
            heatLayer = L.heatLayer(threatPoints, {
                radius: 25, // Adjust as needed for visual effect
                maxZoom: 14,
                scaleRadius: true,
                useLocalExtrema: false,
                blur: 15, // Adjust blur for smoother gradients
            }).addTo(map);
            console.log("Heatmap updated with", threatPoints.length, "points.");
        } else {
            console.log("No threat points to display heatmap.");
        }
    }

    // --- UI Update Functions ---
    function displayDisasterAlert(message, disasterInfo = null) {
        if (disasterAlertBox && disasterAlertMessageElem) {
            // Replace markdown-like bold with HTML strong tags for proper rendering
            let formattedMessage = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
            // Add TI to the displayed message if available
            if (disasterInfo && disasterInfo.threat_index !== undefined) {
                formattedMessage += `<br><br><strong>Threat Index (TI):</strong> ${disasterInfo.threat_index}`;
            }

            disasterAlertMessageElem.innerHTML = formattedMessage;
            disasterAlertBox.style.display = 'flex'; // Show the alert box
            console.warn("Displaying disaster alert:", message);
        } else {
            console.error("Disaster alert box elements not found. Cannot display alert:", message);
        }
    }

    function hideDisasterAlert() {
        if (disasterAlertBox) {
            disasterAlertBox.style.display = 'none';
        }
    }

    function displayInfoMessage(message) {
        if (dashboardInfo) {
            dashboardInfo.innerHTML = `<p>${message}</p>`;
            dashboardInfo.style.display = 'block';
        }
    }

    function addRecentAlert(locationName, disasterType, status, severity, threatIndex) {
        if (recentAlertsList) {
            // Remove "No recent alerts." if it's the first alert
            if (recentAlertsList.children.length === 1 && recentAlertsList.children[0].textContent === 'No recent alerts.') {
                recentAlertsList.innerHTML = '';
            }
            const listItem = document.createElement('li');
            const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1);
            listItem.innerHTML = `<strong>${locationName}:</strong> ${disasterType} (${capitalizedStatus}, TI: ${threatIndex}) - ${new Date().toLocaleTimeString()}`;
            recentAlertsList.prepend(listItem); // Add to the top
            // Limit to a certain number of recent alerts (e.g., 5)
            if (recentAlertsList.children.length > 5) {
                recentAlertsList.removeChild(recentAlertsList.lastChild);
            }
        }
    }

    function updateAuthorityContacts(emails) {
        if (authorityContactsList) {
            authorityContactsList.innerHTML = ''; // Clear previous contacts
            if (emails && emails.length > 0) {
                emails.forEach(email => {
                    const listItem = document.createElement('li');
                    listItem.textContent = email;
                    authorityContactsList.appendChild(listItem);
                });
            } else {
                const listItem = document.createElement('li');
                    listItem.textContent = "(No specific authorities found or email not sent)";
                authorityContactsList.appendChild(listItem);
            }
        }
    }

    // Function to display resource suggestions
    function displayResourceSuggestions(suggestions) {
        if (resourceSuggestionsSection && resourceSuggestionsList) {
            resourceSuggestionsList.innerHTML = ''; // Clear previous suggestions
            if (suggestions && suggestions.length > 0) {
                suggestions.forEach(item => {
                    const listItem = document.createElement('li');
                    listItem.textContent = `${item.resource}: ${item.quantity}`;
                    resourceSuggestionsList.appendChild(listItem);
                });
                resourceSuggestionsSection.style.display = 'block'; // Show the section
            } else {
                resourceSuggestionsSection.style.display = 'none'; // Hide if no suggestions
            }
        } else {
            console.error("Resource suggestions DOM elements not found.");
        }
    }

    // Function to fetch and display communication logs (Firestore)
    async function fetchCommunicationLogs() {
        if (!firebaseDb || !currentFirebaseUser) {
            console.warn("Firestore not initialized or user not authenticated. Cannot fetch communication logs.");
            communicationLogsList.innerHTML = '<li>Sign in to view communication history.</li>';
            return;
        }

        if (communicationLogsSection && communicationLogsList) {
            communicationLogsList.innerHTML = '<li>Loading communication history...</li>'; // Show loading message
            communicationLogsSection.style.display = 'block'; // Ensure section is visible while loading

            try {
                const logsCollectionRef = firebase.collection(firebaseDb, `artifacts/${firebaseAppId}/public/data/communication_logs`);
                const q = firebase.query(logsCollectionRef, firebase.orderBy('timestamp', 'desc'), firebase.limit(50));
                const querySnapshot = await firebase.getDocs(q);

                if (querySnapshot.empty) {
                    communicationLogsList.innerHTML = '<li>No communication history found.</li>';
                } else {
                    communicationLogsList.innerHTML = ''; // Clear loading message
                    querySnapshot.forEach(doc => {
                        const log = doc.data();
                        const listItem = document.createElement('li');
                        const timestamp = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : 'N/A';
                        const logMessage = `
                            <strong>${log.location}:</strong> ${log.disasterType} (${log.status}, TI: ${log.threatIndex})<br>
                            <em>Logged: ${timestamp} (by User ID: ${log.userId.substring(0, 8)}...)</em>
                        `;
                        listItem.innerHTML = logMessage;
                        communicationLogsList.appendChild(listItem);
                    });
                }
            } catch (error) {
                console.error('Error fetching communication logs from Firestore:', error);
                communicationLogsList.innerHTML = `<li>Error loading logs: ${error.message}</li>`;
            }
        } else {
            console.error("Communication logs DOM elements not found.");
        }
    }

    // Function to display predictive statement
    function displayPredictiveStatement(statement) {
        if (predictiveStatementSection && predictiveStatementText) {
            predictiveStatementText.textContent = statement;
            predictiveStatementSection.style.display = 'block';
        }
    }

    function hidePredictiveStatement() {
        if (predictiveStatementSection) {
            predictiveStatementSection.style.display = 'none';
        }
    }


    // --- Map Marker for AI Disaster ---
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

        const capitalizedStatus = disasterInfo.status.charAt(0).toUpperCase() + disasterInfo.status.slice(1);
        const popupContent = `
            <strong>Disaster Alert!</strong><br>
            Type: ${disasterInfo.disaster_type}<br>
            Status: ${capitalizedStatus}<br>
            Severity: ${disasterInfo.severity}<br>
            Threat Index (TI): ${threatIndex}
        `;

        disasterMarker = L.marker([lat, lon], { icon: disasterIcon }).addTo(map)
            .bindPopup(popupContent)
            .openPopup(); // Automatically open the popup

        console.log(`AI Disaster alert displayed on map at [${lat}, ${lon}]: ${disasterInfo.disaster_type}, TI: ${threatIndex}`);
    }

    // Function to get City Name from Coordinates for Dashboard (Reverse Geocoding)
    async function getCityFromCoordinates(lat, lon) {
        try {
            const reverseGeoUrl = BASE_URL_REVERSE_GEOCODING + `?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
            console.log("Fetching reverse geocoding data for dashboard from:", reverseGeoUrl);
            const response = await fetch(reverseGeoUrl);

            if (!response.ok) {
                const errorData = await response.text();
                console.error(`Reverse Geocoding API HTTP Error (Dashboard): ${response.status} - ${response.statusText}`, errorData);
                return null;
            }
            const data = await response.json();
            if (data.length === 0) {
                console.warn(`No city found for coordinates: ${lat}, ${lon} for dashboard.`);
                return null;
            }
            console.log("Reverse geocoding data received (Dashboard):", data[0]);
            return data[0].name; // Return the city name
        } catch (error) {
            console.error('Error in getCityFromCoordinates (Dashboard) function:', error);
            return null;
        }
    }

    // --- Core Function to Fetch Disaster Alert from Backend ---
    async function getDisasterAlert(locationName) {
        hideDisasterAlert(); // Hide any previous alerts
        hidePredictiveStatement(); // Hide previous predictive statement
        displayInfoMessage(`Checking for disaster alerts in ${locationName}...`);
        updateAuthorityContacts([]); // Clear previous contacts
        displayResourceSuggestions([]); // Clear previous resource suggestions

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
                displayDisasterAlert(`Error: Could not connect to the AI backend or an error occurred. Status: ${response.status}`);
                return;
            }

            const result = await response.json();
            console.log("Disaster AI Backend Response:", result);

            if (result.status === "success") {
                const disasterInfo = result.disaster_info;
                const capitalizedStatus = disasterInfo.status.charAt(0).toUpperCase() + disasterInfo.status.slice(1);
                const message = `**${disasterInfo.disaster_type}** (${capitalizedStatus}) detected in ${locationName} with **${disasterInfo.severity}** severity.`;
                displayDisasterAlert(message, disasterInfo);
                
                // Update map marker
                const coords = await getLatLonForDashboard(locationName);
                if (coords) {
                    currentMapLocation = { lat: coords.lat, lon: coords.lon, name: locationName };
                    initializeDisasterMap(coords.lat, coords.lon); // Center map on detected location
                    displayAIDisasterAlertOnMap(coords.lat, coords.lon, disasterInfo);

                    // Add this disaster to threatPoints for heatmap
                    if (disasterInfo.threat_index !== undefined) {
                        threatPoints.push([coords.lat, coords.lon, disasterInfo.threat_index]);
                        updateHeatmap(); // Update heatmap whenever a new alert is added
                    }
                }

                // Add to recent alerts
                addRecentAlert(locationName, disasterInfo.disaster_type, disasterInfo.status, disasterInfo.severity, disasterInfo.threat_index);
                
                // Fetch and display authority contacts (now from DB via backend)
                fetchAuthorityContacts(locationName);

                // Display resource suggestions
                if (disasterInfo.resource_suggestions) {
                    displayResourceSuggestions(disasterInfo.resource_suggestions);
                } else {
                    displayResourceSuggestions([]); // Clear if no suggestions
                }

                // Display predictive statement
                if (disasterInfo.predictive_statement) {
                    displayPredictiveStatement(disasterInfo.predictive_statement);
                } else {
                    hidePredictiveStatement(); // Hide if no statement
                }

                // Fetch and display updated communication logs
                fetchCommunicationLogs();

            } else if (result.status === "no_disaster") {
                displayInfoMessage(`No natural disaster detected by AI for "${locationName}" at this time.`);
                if (disasterMarker) {
                    map.removeLayer(disasterMarker);
                    disasterMarker = null;
                }
                updateAuthorityContacts([]); // Clear contacts if no disaster
                displayResourceSuggestions([]); // Clear resource suggestions if no disaster
                hidePredictiveStatement(); // Hide predictive statement if no disaster
                // Fetch and display updated communication logs (even if no new alert)
                fetchCommunicationLogs();
            } else {
                displayDisasterAlert(`Unexpected response from AI backend: ${result.message}`);
            }

        } catch (error) {
            console.error('Error communicating with Disaster AI Backend:', error);
            displayDisasterAlert(`Network error: Could not reach the AI backend. Please ensure it's running at ${DISASTER_AI_BACKEND_URL}.`);
        }
    }

    // Helper function to get Lat/Lon for dashboard map (using OpenWeatherMap Geocoding API)
    async function getLatLonForDashboard(city) {
        try {
            const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${API_KEY}`;
            console.log("Fetching geo data for dashboard from:", geoUrl);
            const response = await fetch(geoUrl);
            if (!response.ok) {
                const errorData = await response.text();
                console.error(`Geocoding API HTTP Error (Dashboard): ${response.status} - ${response.statusText}`, errorData);
                return null;
            }
            const data = await response.json();
            if (data.length === 0) {
                console.warn(`No coordinates found for ${city} for dashboard map.`);
                return null;
            }
            console.log("Geocoding data received (Dashboard):", data[0]);
            return { lat: data[0].lat, lon: data[0].lon };
        } catch (error) {
            console.error('Error fetching lat/lon for dashboard map:', error);
            return null;
        }
    }

    // Function to fetch authority contacts from the backend (now using /api/authorities)
    async function fetchAuthorityContacts(locationName) {
        try {
            const response = await fetch(`${DISASTER_AI_BACKEND_URL}/api/authorities`); // Fetch from new API
            if (!response.ok) {
                console.error(`Failed to fetch authorities data from DB: ${response.status} - ${response.statusText}`);
                updateAuthorityContacts(["Error fetching authority list from database."]);
                return;
            }
            const allAuthorities = await response.json();
            console.log("Fetched All Authorities from DB API:", allAuthorities);

            const locationNameLower = locationName.toLowerCase();
            let emails = [];

            // Filter authorities by location (case-insensitive match)
            for (const auth_entry of allAuthorities) {
                if (auth_entry.location.toLowerCase().includes(locationNameLower) || locationNameLower.includes(auth_entry.location.toLowerCase())) {
                    emails.push(auth_entry.email);
                }
            }
            
            // Fallback if no specific match from DB
            if (emails.length === 0) {
                emails = ["central.emergency@example.com (Fallback - No specific DB match)"];
            }

            updateAuthorityContacts(emails);

        } catch (error) {
            console.error('Network error fetching authority contacts from DB:', error);
            updateAuthorityContacts(["Network error fetching authority list from database."]);
        }
    }

    // --- Authority Management Functions ---

    // Function to fetch and render authorities in the table
    async function renderAuthoritiesTable() {
        authoritiesTableBody.innerHTML = '<tr><td colspan="6">Loading authorities...</td></tr>'; // Loading state
        try {
            const response = await fetch(`${DISASTER_AI_BACKEND_URL}/api/authorities`);
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to fetch authorities: ${response.status} - ${response.statusText}`, errorText);
                authoritiesTableBody.innerHTML = `<tr><td colspan="6">Error loading authorities: ${response.statusText}</td></tr>`;
                return;
            }
            const authorities = await response.json();
            console.log("Authorities fetched for table:", authorities);

            authoritiesTableBody.innerHTML = ''; // Clear existing rows
            if (authorities.length === 0) {
                authoritiesTableBody.innerHTML = '<tr><td colspan="6">No authorities added yet.</td></tr>';
                return;
            }

            authorities.forEach(authority => {
                const row = authoritiesTableBody.insertRow();
                row.innerHTML = `
                    <td>${authority.id}</td>
                    <td>${authority.name}</td>
                    <td>${authority.email}</td>
                    <td>${authority.location}</td>
                    <td>${authority.type}</td>
                    <td class="authority-actions">
                        <button class="edit-button" data-id="${authority.id}">Edit</button>
                        <button class="delete-button" data-id="${authority.id}">Delete</button>
                    </td>
                `;
            });
        } catch (error) {
            console.error('Network error rendering authorities table:', error);
            authoritiesTableBody.innerHTML = `<tr><td colspan="6">Network error: Could not load authorities.</td></tr>`;
        }
    }

    // Function to clear the form
    function clearAuthorityForm() {
        authorityNameInput.value = '';
        authorityEmailInput.value = '';
        authorityLocationInput.value = '';
        authorityTypeSelect.value = ''; // Reset select to default option
        authorityIdInput.value = ''; // Clear hidden ID
        addAuthorityButton.style.display = 'inline-block';
        updateAuthorityButton.style.display = 'none';
        cancelEditButton.style.display = 'none';
    }

    // Function to populate form for editing
    function editAuthority(id) {
        // Find the authority in the current table data (or refetch if needed)
        // For simplicity, we'll re-fetch all and find it
        fetch(`${DISASTER_AI_BACKEND_URL}/api/authorities`)
            .then(response => response.json())
            .then(authorities => {
                const authorityToEdit = authorities.find(auth => auth.id === id);
                if (authorityToEdit) {
                    authorityNameInput.value = authorityToEdit.name;
                    authorityEmailInput.value = authorityToEdit.email;
                    authorityLocationInput.value = authorityToEdit.location;
                    authorityTypeSelect.value = authorityToEdit.type;
                    authorityIdInput.value = authorityToEdit.id;

                    addAuthorityButton.style.display = 'none';
                    updateAuthorityButton.style.display = 'inline-block';
                    cancelEditButton.style.display = 'inline-block';
                } else {
                    console.error('Authority not found for editing:', id);
                }
            })
            .catch(error => console.error('Error fetching authority for edit:', error));
    }

    // Function to handle adding/updating authority
    async function handleAuthorityFormSubmit(event) {
        event.preventDefault(); // Prevent default form submission

        const id = authorityIdInput.value;
        const name = authorityNameInput.value.trim();
        const email = authorityEmailInput.value.trim();
        const location = authorityLocationInput.value.trim();
        const type = authorityTypeSelect.value;

        if (!name || !email || !location || !type) {
            alert('Please fill in all fields.'); // Using alert for simplicity, consider custom modal
            return;
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${DISASTER_AI_BACKEND_URL}/api/authorities/${id}` : `${DISASTER_AI_BACKEND_URL}/api/authorities`;

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, location, type })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`Error ${method} authority: ${response.status} - ${response.statusText}`, errorData);
                alert(`Failed to ${id ? 'update' : 'add'} authority: ${errorData.error || response.statusText}`);
                return;
            }

            const result = await response.json();
            console.log(`${id ? 'Updated' : 'Added'} authority:`, result);
            alert(`Authority ${id ? 'updated' : 'added'} successfully!`); // Using alert for simplicity

            clearAuthorityForm();
            renderAuthoritiesTable(); // Re-render table to show changes
        } catch (error) {
            console.error('Network error during authority form submission:', error);
            alert(`Network error: Could not ${id ? 'update' : 'add'} authority.`);
        }
    }

    // Function to handle deleting authority
    async function deleteAuthority(id) {
        if (!confirm('Are you sure you want to delete this authority?')) { // Using confirm for simplicity
            return;
        }

        try {
            const response = await fetch(`${DISASTER_AI_BACKEND_URL}/api/authorities/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`Error deleting authority: ${response.status} - ${response.statusText}`, errorData);
                alert(`Failed to delete authority: ${errorData.error || response.statusText}`);
                return;
            }

            const result = await response.json();
            console.log('Deleted authority:', result);
            alert('Authority deleted successfully!'); // Using alert for simplicity

            renderAuthoritiesTable(); // Re-render table to show changes
        } catch (error) {
            console.error('Network error during authority deletion:', error);
            alert('Network error: Could not delete authority.');
        }
    }

    // --- User Reporting Functions (Firestore) ---

    // Function to fetch and render user reports in the table
    async function renderUserReportsTable() {
        if (!firebaseDb || !currentFirebaseUser) {
            console.warn("Firestore not initialized or user not authenticated. Cannot fetch user reports.");
            userReportsTableBody.innerHTML = '<tr><td colspan="6">Sign in to view user reports.</td></tr>';
            return;
        }

        userReportsTableBody.innerHTML = '<tr><td colspan="6">Loading user reports...</td></tr>'; // Loading state
        try {
            const reportsCollectionRef = firebase.collection(firebaseDb, `artifacts/${firebaseAppId}/public/data/user_reports`);
            const q = firebase.query(reportsCollectionRef, firebase.orderBy('timestamp', 'desc'), firebase.limit(50));
            const querySnapshot = await firebase.getDocs(q);

            if (querySnapshot.empty) {
                userReportsTableBody.innerHTML = '<tr><td colspan="6">No user reports submitted yet.</td></tr>';
            } else {
                userReportsTableBody.innerHTML = ''; // Clear existing rows
                querySnapshot.forEach(doc => {
                    const report = doc.data();
                    const row = userReportsTableBody.insertRow();
                    const timestamp = report.timestamp ? new Date(report.timestamp.toDate()).toLocaleString() : 'N/A';
                    row.innerHTML = `
                        <td>${doc.id.substring(0, 8)}...</td>
                        <td>${report.incidentType}</td>
                        <td>${report.incidentLocation}</td>
                        <td>${report.incidentSeverity}</td>
                        <td>${report.userId ? report.userId.substring(0, 8) + '...' : 'Anonymous'}</td>
                        <td>${timestamp}</td>
                    `;
                });
            }
        } catch (error) {
            console.error('Error fetching user reports from Firestore:', error);
            userReportsTableBody.innerHTML = `<tr><td colspan="6">Error loading user reports: ${error.message}</td></tr>`;
        }
    }

    // Function to handle incident report submission
    async function handleIncidentReportSubmit(event) {
        event.preventDefault(); // Prevent default form submission

        if (!firebaseDb || !currentFirebaseUser) {
            alert('Please sign in to submit an incident report.');
            return;
        }

        const incidentType = incidentTypeSelect.value;
        const incidentLocation = incidentLocationInput.value.trim();
        const incidentDescription = incidentDescriptionTextarea.value.trim();
        const incidentSeverity = incidentSeveritySelect.value;

        if (!incidentType || !incidentLocation || !incidentDescription || !incidentSeverity) {
            alert('Please fill in all incident report fields.');
            return;
        }

        const reportData = {
            incidentType,
            incidentLocation,
            incidentDescription,
            incidentSeverity,
            userId: currentFirebaseUser.uid, // Associate report with authenticated user
            timestamp: firebase.serverTimestamp() // Firestore server timestamp
        };

        try {
            const reportsCollectionRef = firebase.collection(firebaseDb, `artifacts/${firebaseAppId}/public/data/user_reports`);
            const docRef = await firebase.addDoc(reportsCollectionRef, reportData);
            console.log('Incident report submitted with ID:', docRef.id);
            alert('Incident report submitted successfully!');

            // Clear form and re-render reports table
            incidentReportForm.reset();
            renderUserReportsTable();
        } catch (error) {
            console.error('Error during incident report submission to Firestore:', error);
            alert(`Failed to submit report: ${error.message}`);
        }
    }

    // --- Firebase Authentication Functions (NEW) ---
    function updateAuthUI(user) {
        if (user) {
            authStatusText.textContent = 'Authenticated';
            authStatusText.style.color = '#28a745'; // Green
            authUserId.textContent = user.uid;
            signInButton.style.display = 'none';
            signOutButton.style.display = 'inline-block';
            currentFirebaseUser = user;
            console.log("User authenticated:", user.uid);
            // Re-fetch data that depends on authentication
            fetchCommunicationLogs();
            renderUserReportsTable();
        } else {
            authStatusText.textContent = 'Not authenticated';
            authStatusText.style.color = '#dc3545'; // Red
            authUserId.textContent = 'N/A';
            signInButton.style.display = 'inline-block';
            signOutButton.style.display = 'none';
            currentFirebaseUser = null;
            console.log("User not authenticated.");
            // Clear data that depends on authentication
            communicationLogsList.innerHTML = '<li>Sign in to view communication history.</li>';
            userReportsTableBody.innerHTML = '<tr><td colspan="6">Sign in to view user reports.</td></tr>';
        }
    }

    async function handleSignInAnonymously() {
        try {
            const userCredential = await window.firebase.signInAnonymously(firebaseAuth);
            console.log("Signed in anonymously:", userCredential.user.uid);
        } catch (error) {
            console.error("Error signing in anonymously:", error);
            // Show both code and message for better diagnostics
            const code = error && error.code ? error.code : 'unknown_code';
            const message = error && error.message ? error.message : String(error);
            alert(`Error signing in: ${code} - ${message}`);

            // Print a masked Identity Toolkit URL to help debugging in network tab
            try {
                const apiKeyMasked = window.firebase && window.firebase._configCheck ? window.firebase._configCheck.apiKeyMasked : 'missing_api_key';
                console.log(`Identity Toolkit request attempted (masked apiKey): https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKeyMasked}`);
            } catch (logErr) {
                console.log('Could not print Identity Toolkit debug URL:', logErr);
            }
        }
    }

    async function handleSignOut() {
        try {
            await firebase.signOut(firebaseAuth);
            console.log("Signed out.");
            // onAuthStateChanged will handle UI update
        } catch (error) {
            console.error("Error signing out:", error);
            alert(`Error signing out: ${error.message}`);
        }
    }


    // --- Event Listeners ---
    if (searchDisasterButton) {
        searchDisasterButton.addEventListener('click', () => {
            const city = disasterCityInput.value.trim();
            if (city) {
                getDisasterAlert(city);
            } else {
                displayInfoMessage("Please enter a city or village name to search.");
                hideDisasterAlert();
                hidePredictiveStatement();
                if (disasterMarker) {
                    map.removeLayer(disasterMarker);
                    disasterMarker = null;
                }
                displayResourceSuggestions([]);
                fetchCommunicationLogs();
            }
        });
    }

    if (disasterCityInput) {
        disasterCityInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const city = disasterCityInput.value.trim();
                if (city) {
                    getDisasterAlert(city);
                } else {
                    displayInfoMessage("Please enter a city or village name to search.");
                    hideDisasterAlert();
                    hidePredictiveStatement();
                    if (disasterMarker) {
                        map.removeLayer(disasterMarker);
                        disasterMarker = null;
                    }
                    displayResourceSuggestions([]);
                    fetchCommunicationLogs();
                }
            }
        });
    }

    // Map layer button event listeners
    mapLayerButtons.forEach(button => {
        button.addEventListener('click', () => {
            const layerType = button.dataset.layer;

            // Remove active class from all buttons
            mapLayerButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to the clicked button
            button.classList.add('active');

            // Handle layer visibility
            if (layerType === 'base') {
                OWM_TILE_LAYERS_DASHBOARD.base.addTo(map).bringToFront();
                if (heatLayer) {
                    map.removeLayer(heatLayer);
                }
            } else if (layerType === 'heatmap') {
                if (OWM_TILE_LAYERS_DASHBOARD.base) {
                    map.removeLayer(OWM_TILE_LAYERS_DASHBOARD.base);
                }
                updateHeatmap();
            }
        });
    });

    // Authority form event listeners
    if (authorityForm) {
        authorityForm.addEventListener('submit', handleAuthorityFormSubmit);
    }
    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', clearAuthorityForm);
    }
    // Event delegation for edit/delete buttons on the table
    if (authoritiesTableBody) {
        authoritiesTableBody.addEventListener('click', (event) => {
            if (event.target.classList.contains('edit-button')) {
                const id = parseInt(event.target.dataset.id);
                editAuthority(id);
            } else if (event.target.classList.contains('delete-button')) {
                const id = parseInt(event.target.dataset.id);
                deleteAuthority(id);
            }
        });
    }

    // User Report form event listener
    if (incidentReportForm) {
        incidentReportForm.addEventListener('submit', handleIncidentReportSubmit);
    }

    // Firebase Auth button event listeners (NEW)
    if (signInButton) {
        signInButton.addEventListener('click', handleSignInAnonymously);
    }
    if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOut);
    }


    // --- Initial Setup ---
    // Initialize map to a default view (e.g., world center)
    initializeDisasterMap(currentMapLocation.lat, currentMapLocation.lon, 2); // Zoom out for world view
    displayInfoMessage("Welcome to the Disaster Management Dashboard. Use the search bar to monitor locations for potential natural disasters.");
    
    // Firebase Initialization and Auth State Listener
    // Check if window.firebase is available (from the module script in HTML)
    if (window.firebase) {
        firebase = window.firebase;   
        firebaseAuth = firebase.auth;
        firebaseDb = firebase.db;
        firebaseAppId = firebase.appId;

        // Listen for auth state changes
        window.firebase.onAuthStateChanged(firebaseAuth, async (user) => {
            updateAuthUI(user);
            if (!user && window.firebase.initialAuthToken) {
                // If there's an initial token but no user, try to sign in with it
                try {
                    await window.firebase.signInWithCustomToken(firebaseAuth, window.firebase.initialAuthToken);
                    console.log("Attempted sign-in with initial custom token.");
                } catch (error) {
                    console.error("Failed to sign in with initial custom token:", error);
                    // Fallback to anonymous if custom token fails
                    try {
                        await window.firebase.signInAnonymously(firebaseAuth);
                        console.log("Signed in anonymously after custom token failure.");
                    } catch (anonError) {
                        console.error("Failed to sign in anonymously:", anonError);
                    }
                }
            } else if (!user) {
                // If no user and no initial token, sign in anonymously
                try {
                    await window.firebase.signInAnonymously(firebaseAuth);
                    console.log("Signed in anonymously on initial load.");
                } catch (anonError) {
                    console.error("Failed to sign in anonymously on initial load:", anonError);
                }
            }
        });
    } else {
        console.error("Firebase SDK not loaded or exposed globally. Authentication and Firestore features will not work.");
        authStatusText.textContent = 'Firebase Error';
        authStatusText.style.color = '#dc3545';
        authUserId.textContent = 'SDK Missing';
        signInButton.disabled = true;
        signOutButton.disabled = true;
        communicationLogsList.innerHTML = '<li>Firebase SDK not loaded.</li>';
        userReportsTableBody.innerHTML = '<tr><td colspan="6">Firebase SDK not loaded.</td></tr>';
    }

    // Fetch and render authorities table on initial load
    renderAuthoritiesTable();

    // Communication logs and user reports will be fetched by updateAuthUI once authenticated
});
