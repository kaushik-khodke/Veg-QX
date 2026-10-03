"""
utils/index_calculator.py
Computes vegetation indices (NDVI, GNDVI, RVI) from raw spectral band values.
These are always computed server-side — the user never needs to calculate them manually.
"""


def compute_ndvi(nir: float, red: float) -> float:
    """
    Normalized Difference Vegetation Index.
    NDVI = (NIR - Red) / (NIR + Red)
    Range: [-1, 1]  |  Higher = healthier/fresher vegetation
    """
    denominator = nir + red
    if denominator == 0:
        return 0.0
    return round((nir - red) / denominator, 6)


def compute_gndvi(nir: float, green: float) -> float:
    """
    Green Normalized Difference Vegetation Index.
    GNDVI = (NIR - Green) / (NIR + Green)
    More sensitive to chlorophyll concentration than NDVI.
    """
    denominator = nir + green
    if denominator == 0:
        return 0.0
    return round((nir - green) / denominator, 6)


def compute_rvi(nir: float, red: float) -> float:
    """
    Ratio Vegetation Index.
    RVI = NIR / Red
    Reflects biomass. Higher = more biomass/freshness.
    """
    if red == 0:
        return 0.0
    return round(nir / red, 6)


def compute_all_indices(nir: float, red: float, green: float) -> dict:
    """
    Computes all three vegetation indices from raw spectral bands.
    Returns a dict with NDVI, GNDVI, RVI.
    """
    return {
        "NDVI":  compute_ndvi(nir, red),
        "GNDVI": compute_gndvi(nir, green),
        "RVI":   compute_rvi(nir, red),
    }


def compute_ripeness(commodity: str, raw_bands: dict, indices: dict, raw_freshness_score: float) -> dict:
    """
    Evaluates physiological ripeness vs biological decay across commodities.
    Determines whether a specimen is 'Ripe' or 'Unripe' (e.g. green tomato),
    and calculates an adjusted freshness score so that unripe specimens are not
    falsely ranked above prime ready-to-eat produce, while prime ripe specimens
    with intact cell turgor maintain high freshness scores.
    """
    comm = (commodity or "tomato").lower()
    blue = float(raw_bands.get("Blue", 0.0))
    green = float(raw_bands.get("Green", 0.0))
    yellow = float(raw_bands.get("Yellow", 0.0))
    orange = float(raw_bands.get("Orange", 0.0))
    red = float(raw_bands.get("Red", 0.0))
    nir = float(raw_bands.get("NIR", 0.0))
    ndvi = float(indices.get("NDVI", 0.0))

    is_unripe = False
    ripeness_stage = "Ripe"
    ripeness_index = 0.0
    adjusted_score = raw_freshness_score

    if comm == "tomato":
        # Normalized Difference Ripeness Index (Lycopene vs Chlorophyll ratio)
        # NDRI = (Red - Green) / (Red + Green)
        denom = red + green
        ndri = (red - green) / denom if denom > 0 else 0.0
        ripeness_index = round(ndri, 4)

        # Unripe Green Tomato Criteria:
        # 1. High NDVI (intense chlorophyll absorption of red) >= 0.60
        # 2. Green reflectance exceeds or matches Red reflectance (NDRI <= 0.12 or Red <= Green * 1.25)
        if ndvi >= 0.60 and (ndri <= 0.12 or red <= green * 1.25):
            is_unripe = True
            ripeness_stage = "Unripe"
            # Calibration: In an unripe green tomato, chlorophyll creates artificially inflated
            # regression scores (> 80). Calibrate to a realistic 'Harvest Fresh / Firm Storage'
            # score range (68.0 - 74.0) so it is marked Fresh but not falsely 95% table-ready.
            if raw_freshness_score > 74.0:
                excess = raw_freshness_score - 74.0
                adjusted_score = round(68.0 + (excess * 0.22), 2)
            else:
                adjusted_score = raw_freshness_score
        else:
            is_unripe = False
            ripeness_stage = "Ripe"
            # If ripe red tomato (ndri > 0.25) has high cellular turgor (NIR >= 350),
            # ensure its freshness score is not penalized for low NDVI:
            if ndri > 0.25 and nir >= 350.0 and raw_freshness_score < 75.0:
                adjusted_score = max(raw_freshness_score, round(75.0 + min(20.0, (nir - 350.0) * 0.1), 2))

    elif comm == "carrot":
        # Immature/unripe carrot: Pale color, low beta-carotene (Orange and Yellow < 40)
        # while root moisture is high (NIR >= 280)
        ripeness_index = round((orange + yellow) / (nir + 1e-6), 4)
        if orange < 40.0 and yellow < 40.0 and nir >= 280.0:
            is_unripe = True
            ripeness_stage = "Unripe"
            if raw_freshness_score > 74.0:
                adjusted_score = round(68.0 + (raw_freshness_score - 74.0) * 0.2, 2)
        else:
            is_unripe = False
            ripeness_stage = "Ripe"

    elif comm == "brinjal":
        # Young immature/unripe brinjal with underdeveloped anthocyanin (greenish tint, Green > Blue * 1.3)
        ripeness_index = round(blue / (green + 1e-6), 4)
        if green > blue * 1.3 and nir >= 300.0:
            is_unripe = True
            ripeness_stage = "Unripe"
            if raw_freshness_score > 74.0:
                adjusted_score = round(68.0 + (raw_freshness_score - 74.0) * 0.2, 2)
        else:
            is_unripe = False
            ripeness_stage = "Ripe"

    elif comm == "bitter_gourd":
        # Bitter gourd is consumed immature/green.
        # If it turns yellow/orange (Yellow >= Green * 1.05), it is Overripe.
        if yellow >= green * 1.05 or orange >= green * 1.05:
            is_unripe = False
            ripeness_stage = "Overripe"
            ripeness_index = round((yellow + orange) / (green + 1e-6), 4)
            if raw_freshness_score > 48.0:
                adjusted_score = round(38.0 + (raw_freshness_score - 48.0) * 0.15, 2)
        else:
            is_unripe = False
            ripeness_stage = "Ripe"
            ripeness_index = round(green / (yellow + 1e-6), 4)

    elif comm == "green_brinjal":
        # If chlorotic / yellowing
        if yellow >= green * 1.1:
            is_unripe = False
            ripeness_stage = "Overripe"
            ripeness_index = round(yellow / (green + 1e-6), 4)
            if raw_freshness_score > 48.0:
                adjusted_score = round(42.0 + (raw_freshness_score - 48.0) * 0.15, 2)
        else:
            is_unripe = False
            ripeness_stage = "Ripe"
            ripeness_index = round(green / (yellow + 1e-6), 4)

    else:
        is_unripe = False
        ripeness_stage = "Ripe"
        ripeness_index = 0.0
        adjusted_score = raw_freshness_score

    adjusted_score = round(max(0.0, min(100.0, adjusted_score)), 2)

    return {
        "is_unripe": is_unripe,
        "ripeness_stage": ripeness_stage,
        "ripeness_index": ripeness_index,
        "calibrated_freshness_score": adjusted_score,
    }

