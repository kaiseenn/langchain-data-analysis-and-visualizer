document.addEventListener('DOMContentLoaded', () => {
    const {DeckGL, ColumnLayer, AmbientLight, PointLight, LightingEffect} = deck;

    // --- Configuration ---
    const MAX_DEPTH = 7000; // Used for inversion logic
    const Z_SCALE = 10;      // Vertical exaggeration factor

    // Biome Colors (RGB arrays for Deck.gl)
    const biomeColors = {
        'slope': [112, 128, 144],      // SlateGray
        'seamount': [255, 107, 107],   // Reddish
        'plain': [70, 130, 180],       // SteelBlue
        'trench': [20, 20, 20],        // Very Dark
        'hydrothermal': [255, 215, 0], // Gold
        'unknown': [136, 136, 136]
    };

    // State
    let currentViewMode = 'biome'; // 'biome' or 'score'
    let selectedCell = null;
    let maxScore = 1; // Will be updated from data
    let allData = []; // Store loaded data
    let deckglInstance = null;
    
    const infoDiv = document.getElementById('cell-info');
    const btnBiome = document.getElementById('btn-biome');
    const btnScore = document.getElementById('btn-score');

    // --- Lighting ---
    const ambientLight = new AmbientLight({
        color: [255, 255, 255],
        intensity: 1.0
    });

    const pointLight = new PointLight({
        color: [255, 255, 255],
        intensity: 2.0,
        position: [145.67, -12.34, 80000]
    });

    const lightingEffect = new LightingEffect({ambientLight, pointLight});

    // --- Data Fetching ---
    fetch('/api/grid')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error(data.error);
                return;
            }
            // Calculate max score for normalization
            maxScore = Math.max(...data.map(d => d.score || 0));
            if (maxScore <= 0) maxScore = 1; // Avoid div by zero
            
            allData = data.map(d => ({
                ...d,
                elevation: (MAX_DEPTH - d.depth)
            }));
            
            initDeckGL(allData);
            setupControls(allData);
            setupSearch();
        })
        .catch(err => console.error('Error fetching grid:', err));

    function initDeckGL(processedData) {
        deckglInstance = new DeckGL({
            container: 'map-container',
            mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            initialViewState: {
                longitude: 145.8,
                latitude: -12.45,
                zoom: 9,
                pitch: 45,
                bearing: 20
            },
            controller: true,
            effects: [lightingEffect],
            layers: [
                renderLayer(processedData)
            ],
            getTooltip: ({object}) => object && {
                html: `
                    <div><b>${currentViewMode === 'score' ? 'Score: ' + object.score.toFixed(0) : object.biome.toUpperCase()}</b></div>
                    <div>Depth: ${object.depth}m</div>
                    <div>(${object.row}, ${object.col})</div>
                `,
                style: {
                    backgroundColor: '#112240',
                    color: '#ccd6f6',
                    fontSize: '0.8em'
                }
            }
        });
    }

    function renderLayer(data) {
        return new ColumnLayer({
            id: 'grid-cell-layer',
            data: data,
            diskResolution: 4,
            radius: 500,
            extruded: true,
            pickable: true,
            elevationScale: Z_SCALE,
            getPosition: d => [d.lon, d.lat],
            getFillColor: d => getCellColor(d),
            getElevation: d => d.elevation,
            getLineColor: d => (selectedCell && d.row === selectedCell.row && d.col === selectedCell.col) ? [255, 215, 0] : [0, 0, 0],
            getLineWidth: d => (selectedCell && d.row === selectedCell.row && d.col === selectedCell.col) ? 20 : 0,
            lineWidthMinPixels: 0,
            updateTriggers: {
                getFillColor: [currentViewMode, selectedCell],
                getLineWidth: [selectedCell],
                getLineColor: [selectedCell]
            },
            // Interactive props
            autoHighlight: true,
            highlightColor: [100, 255, 218, 128],
            
            onHover: ({object}) => {
                if (!selectedCell && object) {
                    updateSidebar(object);
                }
            },
            onClick: ({object}) => {
                if (object) {
                    selectTile(object);
                } else {
                    deselectTile();
                }
            }
        });
    }

    function getCellColor(d) {
        // If selected, highlight logic handles it in renderLayer triggers if we want transparency logic
        // But for base color:
        
        if (selectedCell) {
             if (d.row === selectedCell.row && d.col === selectedCell.col) {
                 return [255, 215, 0, 255]; // Gold for selected
             }
             // Dim others? Optional. Let's keep them normal but maybe slightly transparent if we want focus
        }

        if (currentViewMode === 'biome') {
            return biomeColors[d.biome] || biomeColors['unknown'];
        } else {
            // Score mode: Brighter colors
            // Map score 0-1 to a vibrant gradient
            // Low (Blue/Purple) -> Mid (Cyan/Green) -> High (Yellow/Orange/Red)
            // Let's use: Dark Blue -> Bright Cyan -> Bright Green -> Yellow
            
            const n = Math.max(0, (d.score || 0) / maxScore);
            
            // Define stops
            // 0.0: [0, 0, 139] (DarkBlue)
            // 0.33: [0, 255, 255] (Cyan)
            // 0.66: [0, 255, 0] (Lime)
            // 1.0: [255, 255, 0] (Yellow)
            
            let r, g, b;
            
            if (n < 0.33) {
                // DarkBlue to Cyan
                const t = n / 0.33;
                r = 0;
                g = Math.floor(255 * t);
                b = Math.floor(139 + (255 - 139) * t);
            } else if (n < 0.66) {
                // Cyan to Lime
                const t = (n - 0.33) / 0.33;
                r = 0;
                g = 255;
                b = Math.floor(255 * (1 - t));
            } else {
                // Lime to Yellow
                const t = (n - 0.66) / 0.34;
                r = Math.floor(255 * t);
                g = 255;
                b = 0;
            }
            
            return [r, g, b];
        }
    }

    function setupControls(data) {
        // Check if buttons exist (might be missing in index.html if overwritten)
        if (!btnBiome || !btnScore) return;

        btnBiome.addEventListener('click', () => {
            currentViewMode = 'biome';
            btnBiome.classList.add('active');
            btnScore.classList.remove('active');
            updateLayer(data);
        });

        btnScore.addEventListener('click', () => {
            currentViewMode = 'score';
            btnScore.classList.add('active');
            btnBiome.classList.remove('active');
            updateLayer(data);
        });
    }
    
    function updateLayer(data) {
        deckglInstance.setProps({
            layers: [renderLayer(data)]
        });
    }

    function selectTile(cell) {
        selectedCell = cell;
        updateSidebar(cell);
        updateLayer(allData); // Trigger re-render for highlights
    }

    function deselectTile() {
        selectedCell = null;
        infoDiv.innerHTML = '<p class="stat-label">Hover over a cell to view details.</p>';
        updateLayer(allData);
    }

    function setupSearch() {
        const btn = document.getElementById('search-btn');
        const rowInput = document.getElementById('row-input');
        const colInput = document.getElementById('col-input');

        if (!btn) return; // Safety check

        const doSearch = () => {
            const r = parseInt(rowInput.value);
            const c = parseInt(colInput.value);
            
            if (isNaN(r) || isNaN(c)) return;

            const found = allData.find(d => d.row === r && d.col === c);
            if (found) {
                selectTile(found);
                // Optionally fly to it
                deckglInstance.setProps({
                    initialViewState: {
                        longitude: found.lon,
                        latitude: found.lat,
                        zoom: 11,
                        pitch: 45,
                        bearing: 0,
                        transitionDuration: 1000,
                        transitionInterpolator: new deck.FlyToInterpolator()
                    }
                });
            } else {
                alert('Cell not found within grid range.');
            }
        };

        btn.addEventListener('click', doSearch);
    }

    function updateSidebar(cell) {
        // Format tags
        const resourceTags = cell.resources.length > 0 
            ? cell.resources.map(r => `<span class="tag">${r}</span>`).join('')
            : '<span class="stat-label">None</span>';
            
        const hazardTags = cell.hazards.length > 0 
            ? cell.hazards.map(h => `<span class="tag hazard">${h}</span>`).join('')
            : '<span class="stat-label">Safe</span>';

        const lifeTags = cell.life.length > 0 
            ? cell.life.map((l, i) => {
                const status = cell.life_iucn && cell.life_iucn[i] ? cell.life_iucn[i] : 'DD';
                const isEndangered = ['CR', 'EN', 'VU'].includes(status);
                const className = isEndangered ? 'tag hazard' : 'tag life';
                return `<span class="${className}" title="IUCN Status: ${status}">${l} [${status}]</span>`;
            }).join('')
            : '<span class="stat-label">None</span>';
            
        // Score section
        const scoreHtml = `
            <div class="stat-box" style="border-color: var(--accent-cyan);">
                <div class="stat-row">
                    <span class="stat-label">Mining Score</span>
                    <span class="stat-value" style="color: var(--accent-cyan)">${(cell.score || 0).toFixed(0)}</span>
                </div>
                 <div class="stat-row">
                    <span class="stat-label">Value</span>
                    <span class="stat-value">${(cell.total_value || 0).toFixed(0)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Difficulty</span>
                    <span class="stat-value">${(cell.difficulty || 0).toFixed(2)}</span>
                </div>
            </div>
        `;

        infoDiv.innerHTML = `
            ${scoreHtml}
            
            <div class="stat-box">
                <div class="stat-row">
                    <span class="stat-label">Coordinates</span>
                    <span class="stat-value">(${cell.row}, ${cell.col})</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Biome</span>
                    <span class="stat-value" style="color: rgb(${biomeColors[cell.biome]?.join(',') || '136,136,136'})">${cell.biome.toUpperCase()}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Depth</span>
                    <span class="stat-value">${cell.depth.toFixed(1)} m</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Pressure</span>
                    <span class="stat-value">${cell.pressure.toFixed(1)} atm</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Temp</span>
                    <span class="stat-value">${cell.temp.toFixed(1)} °C</span>
                </div>
            </div>

            <h2>Resources</h2>
            <div style="margin-bottom: 15px;">${resourceTags}</div>

            <h2>Hazards</h2>
            <div style="margin-bottom: 15px;">${hazardTags}</div>

            <h2>Life Forms</h2>
            <div>${lifeTags}</div>
        `;
    }
});
