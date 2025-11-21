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

    const infoDiv = document.getElementById('cell-info');
    let selectedCell = null; // For click-locking

    // --- Lighting ---
    const ambientLight = new AmbientLight({
        color: [255, 255, 255],
        intensity: 1.0
    });

    const pointLight = new PointLight({
        color: [255, 255, 255],
        intensity: 2.0,
        position: [145.67, -12.34, 80000] // Light from above center
    });

    const lightingEffect = new LightingEffect({ambientLight, pointLight});

    let deckglInstance = null; // Store instance to update layers/camera
    let allData = []; // Store loaded data

    // --- Data Fetching ---
    fetch('/api/grid')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error(data.error);
                return;
            }
            allData = data.map(d => ({
                ...d,
                // Inverted depth: Shallow (Seamount) = Tall, Deep (Trench) = Short
                elevation: (MAX_DEPTH - d.depth)
            }));
            initDeckGL(allData);
            setupSearch();
        })
        .catch(err => console.error('Error fetching grid:', err));

    function initDeckGL(processedData) {
        deckglInstance = new DeckGL({
            container: 'map-container',
            mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', // MapLibre style
            initialViewState: {
                longitude: 145.8,
                latitude: -12.45,
                zoom: 9,
                pitch: 45,
                bearing: 20
            },
            controller: true,
            effects: [lightingEffect],
            layers: [renderLayer(processedData)],
            getTooltip: ({object}) => object && {
                html: `
                    <div><b>${object.biome.toUpperCase()}</b></div>
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
            getFillColor: d => {
                 // If a cell is selected...
                 if (selectedCell) {
                     // If it IS the selected cell, paint it GOLD
                     if (d.row === selectedCell.row && d.col === selectedCell.col) {
                         return [255, 215, 0, 255]; // Opaque Gold
                     }
                     // If it is NOT the selected cell, dim it
                     const c = biomeColors[d.biome] || biomeColors['unknown'];
                     return [c[0], c[1], c[2], 50]; // More transparent
                 }
                 // Default state (no selection)
                 return biomeColors[d.biome] || biomeColors['unknown'];
            },
            getElevation: d => d.elevation,
            getLineColor: d => (selectedCell && d.row === selectedCell.row && d.col === selectedCell.col) ? [255, 215, 0] : [0, 0, 0],
            getLineWidth: d => (selectedCell && d.row === selectedCell.row && d.col === selectedCell.col) ? 20 : 0,
            lineWidthMinPixels: 0,
            
            // Update triggers re-evaluates accessors when variables change
            updateTriggers: {
                getFillColor: [selectedCell],
                getLineWidth: [selectedCell]
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
    
    function selectTile(cell) {
        selectedCell = cell;
        updateSidebar(cell);
        
        // Force full layer update to trigger getFillColor and getLineWidth re-evaluation
        // by creating a fresh layer instance with the new selectedCell state
        deckglInstance.setProps({
            layers: [renderLayer(allData)]
        });
    }

    function deselectTile() {
        selectedCell = null;
        infoDiv.innerHTML = '<p class="stat-label">Hover over a cell to view details.</p>';
        
        // Reset layer
        deckglInstance.setProps({
            layers: [renderLayer(allData)]
        });
    }

    function setupSearch() {
        const btn = document.getElementById('search-btn');
        const rowInput = document.getElementById('row-input');
        const colInput = document.getElementById('col-input');

        const doSearch = () => {
            const r = parseInt(rowInput.value);
            const c = parseInt(colInput.value);
            
            if (isNaN(r) || isNaN(c)) return;

            const found = allData.find(d => d.row === r && d.col === c);
            if (found) {
                // Just select it, do NOT move camera
                selectTile(found);
            } else {
                alert('Cell not found within grid range.');
            }
        };

        btn.addEventListener('click', doSearch);
    }

    function updateSidebar(cell) {
        const d = cell.full_data;

        // Helper to format values
        const formatVal = (key, val) => {
            if (Array.isArray(val)) {
                return val.length > 0 ? val.join(', ') : 'None';
            }
            if (typeof val === 'number') {
                if (key.includes('lat') || key.includes('lon')) return val.toFixed(4);
                if (key.includes('depth') || key.includes('pressure') || key.includes('temp')) return val.toFixed(2);
                return val;
            }
            return val;
        };

        let listItems = '';
        const keys = Object.keys(d).sort();
        
        for (const key of keys) {
            const val = d[key];
            if (Array.isArray(val) && val.length === 0) continue;
            
            listItems += `
                <div class="stat-row">
                    <span class="stat-label" title="${key}">${key}</span>
                    <span class="stat-value" style="text-align: right; max-width: 180px; overflow-wrap: break-word;">
                        ${formatVal(key, val)}
                    </span>
                </div>
            `;
        }

        infoDiv.innerHTML = `
            <div class="stat-box">
                 <div class="stat-row" style="border-bottom: 1px solid #8892b0; margin-bottom: 10px; padding-bottom: 5px;">
                    <span class="stat-label"><strong>Column</strong></span>
                    <span class="stat-value"><strong>Value</strong></span>
                </div>
                ${listItems}
            </div>
        `;
    }
});
