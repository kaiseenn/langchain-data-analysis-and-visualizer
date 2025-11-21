# Changelog

## [Unreleased]
- Created `merge_abyssal_data.py` to merge CSV files from `Abyssal_World`.
- Installed `pandas` for data manipulation.
- Generated `merged.csv` combining:
    - `cells.csv` (base)
    - `corals.csv`
    - `currents.csv`
    - `hazards.csv` (aggregated by cell)
    - `life.csv` (aggregated by cell)
    - `poi.csv` (aggregated by cell)
    - `resources.csv` (aggregated by cell)
    - `food_web.csv` (aggregated by biome and mapped to cells)
- Fixed `life.csv` parsing:
    - `prey_species` column containing comma-separated strings (e.g., "Abyssal_Ray, Glass_Squid") is now parsed into a list of strings.
    - `NaN` values in `prey_species` are converted to empty lists `[]` before aggregation.
    - Leading/trailing whitespace and empty strings (e.g., from leading commas like ",Species") are filtered out from `prey_species`.
