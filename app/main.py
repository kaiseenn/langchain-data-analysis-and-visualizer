from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import csv
import json
import os
import ast
import math

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

def safe_eval(val):
    """Safely evaluates a string representation of a list."""
    if not val:
        return []
    try:
        val = val.strip()
        if val.startswith('[') and val.endswith(']'):
            return ast.literal_eval(val)
        return val
    except (ValueError, SyntaxError):
        return []

@app.get("/")
async def read_index():
    return FileResponse('app/static/index.html')

@app.get("/api/grid")
async def get_grid():
    data = []
    filepath = 'merged.csv'
    
    if not os.path.exists(filepath):
        return {"error": "merged.csv not found"}
        
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Parse known lists for specific processing if needed, 
            # but mainly we just want to pass all data to the frontend.
            
            # Construct a clean dictionary of all non-empty values
            full_data = {}
            for k, v in row.items():
                if v and v.strip():  # Only include non-empty values
                    # Try to parse list-like strings to actual lists
                    if v.strip().startswith('[') and v.strip().endswith(']'):
                         full_data[k] = safe_eval(v)
                    else:
                         # Try to convert to numbers if possible
                         try:
                             if '.' in v:
                                 full_data[k] = float(v)
                             else:
                                 full_data[k] = int(v)
                         except ValueError:
                             full_data[k] = v
            
            # Ensure required fields for mapping exist
            cell_data = {
                'row': int(row['row']),
                'col': int(row['col']),
                'lat': float(row['lat']),
                'lon': float(row['lon']),
                'depth': float(row['depth_m']),
                'biome': row['biome'],
                'full_data': full_data # Pass everything for the sidebar
            }
            
            # Add specific lists for visualization logic if they exist
            cell_data['hazards'] = full_data.get('hazard_type', [])
            cell_data['resources'] = full_data.get('resource_type', [])
            cell_data['life'] = full_data.get('life_species', [])
            
            # Ensure they are lists (handle case where safe_eval returned non-list or key missing)
            if not isinstance(cell_data['hazards'], list): cell_data['hazards'] = []
            if not isinstance(cell_data['resources'], list): cell_data['resources'] = []
            if not isinstance(cell_data['life'], list): cell_data['life'] = []

            data.append(cell_data)
            
    return data
