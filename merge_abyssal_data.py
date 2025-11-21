import pandas as pd
import os

def main():
    base_dir = 'Abyssal_World'
    cells_path = os.path.join(base_dir, 'cells.csv')
    merged_path = 'merged.csv'

    if not os.path.exists(cells_path):
        print(f"Error: {cells_path} not found.")
        return

    print(f"Loading base file: {cells_path}")
    df_cells = pd.read_csv(cells_path)
    print(f"Base shape: {df_cells.shape}")

    csv_files = {
        'corals.csv': 'coral',
        'currents.csv': 'current',
        'hazards.csv': 'hazard',
        'life.csv': 'life',
        'poi.csv': 'poi',
        'resources.csv': 'resource'
    }

    for filename, prefix in csv_files.items():
        filepath = os.path.join(base_dir, filename)
        if not os.path.exists(filepath):
            print(f"Skipping {filename} (not found)")
            continue

        print(f"Processing {filename}...")
        df_other = pd.read_csv(filepath)

        # Rename columns excluding keys
        cols_to_rename = {c: f"{prefix}_{c}" for c in df_other.columns if c not in ['row', 'col']}
        df_other.rename(columns=cols_to_rename, inplace=True)
        
        # Special handling for life.csv prey parsing (internal cleanup only)
        # We want the merged result to be a list of the raw strings
        if filename == 'life.csv':
            prey_col = f"{prefix}_prey_species"
            if prey_col in df_other.columns:
                # Normalize empty values to empty string
                df_other[prey_col] = df_other[prey_col].fillna('')

        # Aggregate duplicates
        if df_other.duplicated(subset=['row', 'col']).any():
            print(f"  Found duplicate entries for (row, col) in {filename}. Aggregating...")
            
            value_cols = [c for c in df_other.columns if c not in ['row', 'col']]
            
            # Group by cell and aggregate into lists
            # This preserves index alignment:
            # life_species[0] corresponds to life_prey_species[0]
            df_agg = df_other.groupby(['row', 'col'])[value_cols].agg(list).reset_index()
            
            # Cleanup completely empty prey lists for life.csv
            if filename == 'life.csv':
                prey_col = f"{prefix}_prey_species"
                if prey_col in df_agg.columns:
                    def clean_prey(lst):
                        # If list contains only empty strings (no prey for any species in cell), return None (BLANK)
                        if isinstance(lst, list) and all(x == '' for x in lst):
                            return None
                        return lst
                    df_agg[prey_col] = df_agg[prey_col].apply(clean_prey)

            df_other = df_agg
            print(f"  Aggregated shape: {df_other.shape}")

        # Merge
        df_cells = pd.merge(df_cells, df_other, on=['row', 'col'], how='left')
        print(f"  Merged. Current shape: {df_cells.shape}")

    # Food web processing
    food_web_path = os.path.join(base_dir, 'food_web.csv')
    if os.path.exists(food_web_path):
        print("Processing food_web.csv...")
        try:
            df_food = pd.read_csv(food_web_path)
            group_col = 'biome_overlap'
            
            if group_col in df_food.columns:
                df_food_agg = df_food.groupby(group_col).agg({
                    'predator': list,
                    'prey': list,
                    'interaction_strength': list
                }).reset_index()
                
                df_food_agg.rename(columns={
                    'predator': 'biome_predators',
                    'prey': 'biome_prey',
                    'interaction_strength': 'biome_interaction_strengths'
                }, inplace=True)
                
                df_cells = pd.merge(df_cells, df_food_agg, left_on='biome', right_on=group_col, how='left')
                
                if group_col in df_cells.columns:
                    df_cells.drop(columns=[group_col], inplace=True)
                    
                print(f"  Merged food_web. Current shape: {df_cells.shape}")
        except Exception as e:
            print(f"Error processing food_web: {e}")

    print(f"Saving merged data to {merged_path}...")
    df_cells.to_csv(merged_path, index=False)
    print("Done.")

if __name__ == "__main__":
    main()
