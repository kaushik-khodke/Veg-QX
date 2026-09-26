import urllib.request
import json

commodities = ['tomato', 'brinjal', 'beetroot', 'carrot', 'bitter_gourd', 'green_brinjal']

print(f"{'COMMODITY':15} | {'SAMPLES':7} | {'ACCURACY':9} | {'R2':7} | {'MODEL NAME':22} | {'ALGORITHM'}")
print("-" * 80)
for c in commodities:
    url = f"http://127.0.0.1:8000/analytics_dashboard?commodity={c}"
    try:
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            summary = data.get("summary", {})
            perf = data.get("model_performance", {})
            samples = summary.get("total_predictions", 0)
            acc = perf.get("classification_accuracy", 0.0) * 100
            r2 = perf.get("regression_r2", 0.0)
            model_name = perf.get("canonical_name", "N/A")
            algo = perf.get("classifier_algorithm", "N/A")
            print(f"{c.upper():15} | {samples:7} | {acc:6.2f}%   | {r2:6.4f} | {model_name:22} | {algo}")
    except Exception as e:
        print(f"{c.upper():15} | ERROR: {e}")
