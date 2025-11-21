from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import csv
import json
import os
import ast
from app.optimizer import AbyssalOptimizer

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse('app/static/index.html')

@app.get("/api/grid")
async def get_grid():
    optimizer = AbyssalOptimizer()
    
    # Load data
    if not optimizer.load_data():
        return {"error": "merged.csv not found"}
        
    # Calculate scores with default weights
    weights = {
        'value': 1.0,
        'difficulty': 1.0,
        'impact': 2.0,
        'hazard': 2.0
    }
    
    data = optimizer.calculate_scores(weights)
    return data
